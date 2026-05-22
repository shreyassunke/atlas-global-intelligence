import {
  findCrossSourceDuplicate,
  mergeCrossSource,
  initializeCorroborationFields,
} from '../core/crossSourceMerge.js'

const RING_BUFFER_SIZE = 8000
const BATCH_INTERVAL = 200
const SEV5_IMMUNITY_MS = 86400_000

let events = []
let eventMap = new Map()
let batchQueue = { added: [], updated: [], removed: [], anomalies: [] }
let batchTimer = null

// ══════════════════════════════════════════════════════════════
//  GEO UTILITIES
// ══════════════════════════════════════════════════════════════

function toRad(deg) { return deg * Math.PI / 180 }

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ══════════════════════════════════════════════════════════════
//  RING BUFFER
// ══════════════════════════════════════════════════════════════

function cullOldest() {
  while (events.length > RING_BUFFER_SIZE) {
    let removeIdx = -1
    let oldestTime = Infinity
    for (let i = events.length - 1; i >= 0; i--) {
      const evt = events[i]
      if (evt.severity === 5) {
        const age = Date.now() - new Date(evt.fetchedAt).getTime()
        if (age < SEV5_IMMUNITY_MS) continue
      }
      const time = new Date(evt.fetchedAt).getTime()
      if (time < oldestTime) { oldestTime = time; removeIdx = i }
    }
    if (removeIdx === -1) break
    const removed = events.splice(removeIdx, 1)[0]
    eventMap.delete(removed.id)
    batchQueue.removed.push(removed.id)
  }
}

function removeStale() {
  const now = Date.now()
  const toRemove = []
  for (let i = events.length - 1; i >= 0; i--) {
    const evt = events[i]
    const age = (now - new Date(evt.fetchedAt).getTime()) / 1000
    if (age > evt.ttl) {
      if (evt.severity === 5 && (now - new Date(evt.fetchedAt).getTime()) < SEV5_IMMUNITY_MS) continue
      toRemove.push(i)
    }
  }
  for (const idx of toRemove) {
    const removed = events.splice(idx, 1)[0]
    eventMap.delete(removed.id)
    batchQueue.removed.push(removed.id)
  }
}

// ══════════════════════════════════════════════════════════════
//  ANOMALY ENGINE — 7 RULES
// ══════════════════════════════════════════════════════════════

const GRID_SIZE = 200
const GRID_CELL_SIZE = 360 / GRID_SIZE

const baselineCounts = {}
const recentCounts = {}
const regionHistory = {}

function getGridCell(lat, lng) {
  const row = Math.floor((lat + 90) / (180 / GRID_SIZE))
  const col = Math.floor((lng + 180) / GRID_CELL_SIZE)
  return `${Math.min(row, GRID_SIZE - 1)}_${Math.min(col, GRID_SIZE - 1)}`
}

function updateBaseline(event) {
  const cell = getGridCell(event.lat, event.lng)
  const dimension = event.dimension || event.dimension
  const key = `${cell}_${dimension}`
  const now = Date.now()

  if (!baselineCounts[key]) baselineCounts[key] = { total: 0, windowStart: now }
  baselineCounts[key].total++

  if (!recentCounts[key]) recentCounts[key] = { count: 0, windowStart: now }
  if (now - recentCounts[key].windowStart > 6 * 3600_000) {
    recentCounts[key] = { count: 0, windowStart: now }
  }
  recentCounts[key].count++
}

function getCountryFromCoords(lat, lng) {
  if (lat > 60 && lng > -170 && lng < -50) return 'CA'
  if (lat > 25 && lat < 50 && lng > -130 && lng < -65) return 'US'
  if (lat > 35 && lat < 72 && lng > -15 && lng < 40) return 'EU'
  if (lat > 20 && lat < 55 && lng > 60 && lng < 150) return 'ASIA'
  if (lat > -35 && lat < 15 && lng > -75 && lng < -35) return 'SA'
  if (lat > -40 && lat < 40 && lng > -20 && lng < 55) return 'AF'
  return 'OTHER'
}

function runAnomalyRules(newEvents) {
  const anomalies = []
  const now = Date.now()

  for (const evt of newEvents) {
    updateBaseline(evt)
  }

  // Rule 2: SPIKE — cell count in 6h > 2× 7-day baseline
  for (const [key, recent] of Object.entries(recentCounts)) {
    const baseline = baselineCounts[key]
    if (!baseline || baseline.total < 3) continue
    const baselineAge = (now - baseline.windowStart) / 86400_000
    const dailyAvg = baseline.total / Math.max(baselineAge, 1)
    const sixHourExpected = dailyAvg * 0.25
    if (recent.count > sixHourExpected * 2 && recent.count >= 5) {
      const [cell, dimension] = key.split('_')
      anomalies.push({
        type: 'SPIKE',
        cell,
        dimension,
        count: recent.count,
        expected: Math.round(sixHourExpected),
        severity: 4,
        timestamp: new Date().toISOString(),
      })
    }
  }

  // Rule 3: BLACKOUT — region with 5+/day drops to 0 for 6h
  for (const evt of newEvents) {
    const region = getCountryFromCoords(evt.lat, evt.lng)
    if (!regionHistory[region]) regionHistory[region] = []
    regionHistory[region].push(now)
    if (regionHistory[region].length > 100) regionHistory[region] = regionHistory[region].slice(-50)
  }

  for (const [region, timestamps] of Object.entries(regionHistory)) {
    const last24h = timestamps.filter(t => now - t < 86400_000)
    const last6h = timestamps.filter(t => now - t < 6 * 3600_000)
    if (last24h.length >= 5 && last6h.length === 0) {
      anomalies.push({
        type: 'BLACKOUT',
        region,
        lastEvent: Math.max(...timestamps),
        severity: 4,
        timestamp: new Date().toISOString(),
      })
    }
  }

  // Rule 4: CORROBORATION — 3+ independent sources -> severity +1
  for (const evt of events) {
    if (evt.corroborationCount >= 3 && !evt._corrobBoosted) {
      evt._corrobBoosted = true
      const newSev = Math.min(5, evt.severity + 1)
      if (newSev !== evt.severity) {
        evt.severity = newSev
        evt.opacity = 1.0
        batchQueue.updated.push({ ...evt })
        anomalies.push({
          type: 'CORROBORATION_BOOST',
          eventId: evt.id,
          newSeverity: newSev,
          sources: evt.corroborationSources,
          timestamp: new Date().toISOString(),
        })
      }
    }
  }

  // Rule 5: CHOKEPOINT COMPOSITE — naval + conflict within 500km + oil spike
  const CHOKEPOINTS = [
    { name: 'Hormuz', lat: 26.6, lng: 56.3 },
    { name: 'Suez', lat: 30.0, lng: 32.3 },
    { name: 'Malacca', lat: 2.5, lng: 101.8 },
    { name: 'Bab-el-Mandeb', lat: 12.6, lng: 43.3 },
    { name: 'Taiwan', lat: 24.5, lng: 120.5 },
    { name: 'Bosphorus', lat: 41.1, lng: 29.0 },
    { name: 'SCS', lat: 15.0, lng: 115.0 },
    { name: 'Denmark', lat: 66.0, lng: -27.0 },
  ]

  for (const cp of CHOKEPOINTS) {
    const nearbyConflict = events.find(e =>
      (e.dimension === 'safety' || e.dimension === 'conflict') && haversineKm(e.lat, e.lng, cp.lat, cp.lng) < 500)
    const oilSpike = events.find(e =>
      (e.dimension === 'economy' || e.dimension === 'economic') && e.tags?.some(t => t === 'oil' || t === 'crude' || t === 'energy'))

    if (nearbyConflict && oilSpike) {
      anomalies.push({
        type: 'CHOKEPOINT_COMPOSITE',
        chokepoint: cp.name,
        conflictEventId: nearbyConflict.id,
        economicEventId: oilSpike.id,
        severity: 5,
        timestamp: new Date().toISOString(),
      })
    }
  }

  // Rule 6: COMPOUND CRISIS — conflict + humanitarian + economic in same region/24h
  const dimensionsByRegion = {}
  for (const evt of events) {
    const age = now - new Date(evt.timestamp).getTime()
    if (age > 86400_000) continue
    const region = getCountryFromCoords(evt.lat, evt.lng)
    if (!dimensionsByRegion[region]) dimensionsByRegion[region] = new Set()
    dimensionsByRegion[region].add(evt.dimension || evt.dimension)
  }

  for (const [region, dimensions] of Object.entries(dimensionsByRegion)) {
    // Check for safety + people + economy
    if ((dimensions.has('safety') || dimensions.has('conflict')) && 
        (dimensions.has('people') || dimensions.has('humanitarian')) && 
        (dimensions.has('economy') || dimensions.has('economic'))) {
      anomalies.push({
        type: 'COMPOUND_CRISIS',
        region,
        dimensions: [...dimensions],
        severity: 5,
        timestamp: new Date().toISOString(),
      })
    }
  }

  // Rule 7: RAPID ESCALATION — event upgrades 2+ priorities in <10min
  for (const anomaly of batchQueue.anomalies) {
    if (anomaly.type === 'TIER_UPGRADE' || anomaly.type === 'PRIORITY_UPGRADE') {
      const priorityOrder = { p3: 0, latent: 0, p2: 1, active: 1, p1: 2, critical: 2 }
      const jump = priorityOrder[anomaly.to] - priorityOrder[anomaly.from]
      if (jump >= 2) {
        anomalies.push({
          type: 'RAPID_ESCALATION',
          eventId: anomaly.eventId,
          from: anomaly.from,
          to: anomaly.to,
          severity: 5,
          timestamp: new Date().toISOString(),
        })
      }
    }
  }

  return anomalies
}

// ══════════════════════════════════════════════════════════════
//  INGEST + BATCH
// ══════════════════════════════════════════════════════════════

function ingestEvents(incoming) {
  const newEvents = []

  for (const event of incoming) {
    const byId = eventMap.get(event.id)
    if (byId) {
      const preserved = {
        sourceReports: byId.sourceReports,
        threadId: byId.threadId,
        corroborationScore: byId.corroborationScore,
        correlatedEventIds: byId.correlatedEventIds,
        toneDisagreement: byId.toneDisagreement,
      }
      Object.assign(byId, event, {
        fetchedAt: event.fetchedAt || new Date().toISOString(),
      })
      if (!event.sourceReports?.length && preserved.sourceReports?.length) {
        byId.sourceReports = preserved.sourceReports
      }
      if (!event.threadId && preserved.threadId) byId.threadId = preserved.threadId
      if ((event.corroborationScore ?? 0) === 0 && (preserved.corroborationScore ?? 0) > 0) {
        byId.corroborationScore = preserved.corroborationScore
      }
      if (!event.correlatedEventIds?.length && preserved.correlatedEventIds?.length) {
        byId.correlatedEventIds = preserved.correlatedEventIds
      }
      if (!event.toneDisagreement && preserved.toneDisagreement) {
        byId.toneDisagreement = preserved.toneDisagreement
      }
      batchQueue.updated.push({ ...byId })
      continue
    }

    const existing = findCrossSourceDuplicate(event, events)
    if (existing) {
      mergeCrossSource(existing, event, {
        onPriorityUpgrade: (evt, from) => {
          batchQueue.anomalies.push({
            type: 'PRIORITY_UPGRADE',
            eventId: evt.id,
            from,
            to: evt.priority,
            timestamp: new Date().toISOString(),
          })
        },
      })
      batchQueue.updated.push({ ...existing })
    } else {
      initializeCorroborationFields(event)
      events.push(event)
      eventMap.set(event.id, event)
      batchQueue.added.push({ ...event })
      newEvents.push(event)
    }
  }

  cullOldest()

  const anomalies = runAnomalyRules(newEvents)
  if (anomalies.length > 0) {
    batchQueue.anomalies.push(...anomalies)
  }
}

function flushBatch() {
  if (
    batchQueue.added.length === 0 &&
    batchQueue.updated.length === 0 &&
    batchQueue.removed.length === 0 &&
    batchQueue.anomalies.length === 0
  ) return

  self.postMessage({ type: 'BATCH_UPDATE', diff: batchQueue })
  batchQueue = { added: [], updated: [], removed: [], anomalies: [] }
}

function startBatchTimer() {
  if (batchTimer) return
  batchTimer = setInterval(() => {
    removeStale()
    flushBatch()
  }, BATCH_INTERVAL)
}

function getSnapshot() {
  return events.map(e => ({ ...e }))
}

function getPriorityCounts() {
  const counts = { p3: 0, p2: 0, p1: 0 }
  for (const e of events) {
    const pri = e.priority || e.priority || 'p3'
    if (counts[pri] !== undefined) counts[pri]++
  }
  return counts
}

self.onmessage = function (msg) {
  const { type, payload } = msg.data
  switch (type) {
    case 'INGEST':
      ingestEvents(payload.events)
      break
    case 'GET_SNAPSHOT':
      self.postMessage({ type: 'SNAPSHOT', events: getSnapshot() })
      break
    case 'GET_TIER_COUNTS':
    case 'GET_PRIORITY_COUNTS':
      self.postMessage({ type: 'PRIORITY_COUNTS', counts: getPriorityCounts() })
      break
    case 'START':
      startBatchTimer()
      break
    case 'CLEAR':
      events = []
      eventMap.clear()
      batchQueue = { added: [], updated: [], removed: [], anomalies: [] }
      break
  }
}
