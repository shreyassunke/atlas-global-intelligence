/**
 * Phase 4 — Triage feed builders.
 *
 * "What changed since you looked": pure functions that turn store state
 * (events, anomaly stream, surge alerts) into one ranked row list for the
 * Workbench Triage tab. No fetching here — surge polling lives in
 * `useSurgeAlerts`, anomalies are computed in `eventBus.worker.js`, and
 * corroboration metadata comes from `crossSourceMerge.js`.
 *
 * Row shape:
 *   { id, kind, severity (1-5), confidence: {label, tone}, timestamp,
 *     title, why, event?, lat?, lng?, isNew, dimension? }
 */


import {
  ATLAS_CYCLE_MS,
  eventTimestampMs,
  isWithinAtlasCycle,
  pinnedEventIds,
} from './atlasCycle.js'

/** Rows older than this never make the triage list (ATLAS 24h cycle). */
export const TRIAGE_WINDOW_MS = ATLAS_CYCLE_MS

/** Mirrors the anomaly grid in eventBus.worker.js (GRID_SIZE = 200). */
const ANOMALY_GRID_SIZE = 200

/** Representative centroids for the worker's coarse BLACKOUT regions. */
const REGION_CENTROIDS = {
  US: { lat: 39, lng: -98 },
  CA: { lat: 60, lng: -110 },
  EU: { lat: 50, lng: 14 },
  ASIA: { lat: 34, lng: 100 },
  SA: { lat: -10, lng: -58 },
  AF: { lat: 2, lng: 21 },
  OTHER: null,
}

const CHOKEPOINT_COORDS = {
  Hormuz: { lat: 26.6, lng: 56.3 },
  Suez: { lat: 30.0, lng: 32.3 },
  Malacca: { lat: 2.5, lng: 101.8 },
  'Bab-el-Mandeb': { lat: 12.6, lng: 43.3 },
  Taiwan: { lat: 24.5, lng: 120.5 },
  Bosphorus: { lat: 41.1, lng: 29.0 },
  SCS: { lat: 15.0, lng: 115.0 },
  Denmark: { lat: 66.0, lng: -27.0 },
}

/** Anomaly cell id ("row_col") → cell-center coordinates. */
export function anomalyCellToLatLng(cell) {
  const m = /^(\d+)_(\d+)$/.exec(String(cell || ''))
  if (!m) return null
  const cellDeg = 180 / ANOMALY_GRID_SIZE
  const lat = Number(m[1]) * cellDeg - 90 + cellDeg / 2
  const lng = Number(m[2]) * (360 / ANOMALY_GRID_SIZE) - 180 + (360 / ANOMALY_GRID_SIZE) / 2
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { lat, lng }
}

/** Distinct corroborating source display names, report names first. */
export function corroboratingSourceNames(event) {
  const names = []
  const seen = new Set()
  const add = (name) => {
    const key = String(name || '').trim()
    if (!key || seen.has(key.toLowerCase())) return
    seen.add(key.toLowerCase())
    names.push(key)
  }
  for (const r of event?.sourceReports || []) add(r.source || r.sourceId)
  for (const id of event?.corroborationSources || []) add(id)
  return names
}

/**
 * Confidence badge for an event row — first-class trust display
 * ("1 source, uncorroborated" / "4 independent feeds" / "sources disagree"),
 * with the corroborating source list for tooltips/footers.
 * @returns {{ label: string, tone: 'high'|'medium'|'low'|'flag', sources: string[] }}
 */
export function confidenceForEvent(event) {
  if (!event) return { label: 'Derived signal', tone: 'medium', sources: [] }
  const sources = corroboratingSourceNames(event)
  if (event.toneDisagreement || event.disputed) {
    return { label: 'Sources disagree', tone: 'flag', sources }
  }
  const count = Math.max(
    event.corroborationCount || 0,
    (event.corroborationSources || []).length,
    (event.sourceReports || []).length,
  )
  if (event.authoritative) {
    return count >= 2
      ? { label: `Authoritative +${count - 1}`, tone: 'high', sources }
      : { label: 'Authoritative', tone: 'high', sources }
  }
  if (count >= 3) return { label: `${count} independent feeds`, tone: 'high', sources }
  if (count === 2) return { label: '2 sources', tone: 'medium', sources }
  return { label: '1 source · uncorroborated', tone: 'low', sources }
}

function eventWhy(event) {
  const sev = event.severity || 1
  const conf = confidenceForEvent(event)
  const head = sev >= 5 ? 'Critical signal'
    : sev >= 4 ? 'Severe signal'
      : 'Signal'
  return `${head} — ${conf.label.toLowerCase()}`
}

function tsMs(value, fallback = 0) {
  const t = new Date(value || 0).getTime()
  return Number.isFinite(t) && t > 0 ? t : fallback
}

function eventRow(event, { kind, why, isNew, severity }) {
  return {
    id: `${kind}_${event.id}`,
    kind,
    severity: severity ?? event.severity ?? 1,
    confidence: confidenceForEvent(event),
    timestamp: event.timestamp || event.fetchedAt,
    title: event.title || 'Untitled event',
    why: why || eventWhy(event),
    event,
    lat: event.lat,
    lng: event.lng,
    isNew: Boolean(isNew),
    dimension: event.dimension,
  }
}

function anomalyRow(anomaly, eventMap, now) {
  const evt = anomaly.eventId ? eventMap?.[anomaly.eventId] : null
  const base = {
    id: `anom_${anomaly.type}_${anomaly.timestamp}_${anomaly.eventId || anomaly.cell || anomaly.region || anomaly.chokepoint || ''}`,
    kind: 'anomaly',
    severity: anomaly.severity || 3,
    confidence: evt
      ? confidenceForEvent(evt)
      : { label: 'Derived signal', tone: 'medium', sources: [] },
    timestamp: anomaly.timestamp,
    event: evt || null,
    lat: evt?.lat ?? null,
    lng: evt?.lng ?? null,
    isNew: false,
    dimension: evt?.dimension || anomaly.dimension || null,
  }

  switch (anomaly.type) {
    case 'SPIKE': {
      const coords = anomalyCellToLatLng(anomaly.cell)
      return {
        ...base,
        ...(coords || {}),
        title: 'Activity spike',
        why: `${anomaly.count} signals in 6h vs ~${anomaly.expected} expected — local surge above the 7-day baseline`,
      }
    }
    case 'BLACKOUT': {
      const coords = REGION_CENTROIDS[anomaly.region] || null
      return {
        ...base,
        ...(coords || {}),
        title: `Signal blackout — ${anomaly.region}`,
        why: 'A region averaging 5+ signals/day has gone silent for 6h — possible comms disruption or feed outage',
      }
    }
    case 'CHOKEPOINT_COMPOSITE': {
      const coords = CHOKEPOINT_COORDS[anomaly.chokepoint] || null
      const conflictEvt = eventMap?.[anomaly.conflictEventId] || null
      return {
        ...base,
        event: conflictEvt || base.event,
        ...(coords || {}),
        title: `Chokepoint risk — ${anomaly.chokepoint}`,
        why: 'Conflict signal within 500 km of a maritime chokepoint while energy markets move — shipping exposure',
      }
    }
    case 'COMPOUND_CRISIS':
      return {
        ...base,
        ...(REGION_CENTROIDS[anomaly.region] || {}),
        title: `Compound crisis — ${anomaly.region}`,
        why: 'Safety, humanitarian and economic signals overlapping in the same region inside 24h',
      }
    case 'RAPID_ESCALATION':
      return {
        ...base,
        title: evt?.title || 'Rapid escalation',
        why: `Severity jumped rapidly in under 10 minutes`,
      }
    default:
      return null
  }
}

function corroborationRow(anomaly, eventMap) {
  const evt = anomaly.eventId ? eventMap?.[anomaly.eventId] : null
  if (anomaly.type === 'CORROBORATION_BOOST') {
    const n = (anomaly.sources || []).length || 3
    if (!evt) return null
    return eventRow(evt, {
      kind: 'corroboration',
      severity: anomaly.newSeverity || evt.severity,
      why: `Now corroborated by ${n} independent feeds — severity upgraded to ${anomaly.newSeverity}/5`,
    })
  }
  return null
}

function surgeRow(alert) {
  const z = Number(alert.zScore)
  return {
    id: `surge_${alert.fips}_${alert.date || ''}`,
    kind: 'surge',
    severity: z >= 3 ? 4 : 3,
    confidence: { label: 'GDELT 30-day baseline', tone: 'high', sources: ['GDELT BigQuery'] },
    timestamp: alert.checkedAt || alert.date,
    title: `Event surge — ${alert.name || alert.fips}`,
    why: `${alert.events} events vs 30-day baseline (z=${z.toFixed(1)})${alert.watchlist ? ` — watchlist “${alert.watchlist}”` : ''}`,
    event: null,
    lat: alert.lat ?? null,
    lng: alert.lng ?? null,
    isNew: false,
    dimension: null,
  }
}

/**
 * Build the ranked triage list. New-since-last-visit high-severity rows first,
 * then by severity, then recency. One row per underlying event (corroboration
 * upgrades win over plain high-severity rows since they carry the better story).
 */
export function buildTriageRows({
  events = [],
  eventMap = {},
  anomalies = [],
  surgeAlerts = [],
  lastSeenAt = 0,
  now = Date.now(),
  investigation = null,
} = {}) {
  const cutoff = now - TRIAGE_WINDOW_MS
  const rows = []
  const seenEventIds = new Set()
  const pinned = pinnedEventIds(investigation)

  const push = (row) => {
    if (!row) return
    if (row.event) {
      if (pinned.has(row.event.id)) return
      if (seenEventIds.has(row.event.id)) return
      seenEventIds.add(row.event.id)
    }
    rows.push(row)
  }

  const recentAnomalies = anomalies.filter((a) => tsMs(a.timestamp) >= cutoff)

  // 1. Corroboration upgrades + escalations (richest "what changed" stories).
  for (const a of recentAnomalies) {
    push(corroborationRow(a, eventMap))
  }

  // 2. High-severity events in the 24h cycle (publication time, not re-fetch).
  for (const e of events) {
    if ((e.severity || 1) < 4) continue
    if (pinned.has(e.id)) continue
    if (!isWithinAtlasCycle(e, now)) continue
    const pubTs = eventTimestampMs(e)
    if (pubTs < cutoff) continue
    const seenTs = tsMs(e.fetchedAt, pubTs)
    push(eventRow(e, { kind: 'high-severity', isNew: seenTs > lastSeenAt }))
  }

  // 3. Tone-disagreement flags on anything still in the 24h cycle.
  for (const e of events) {
    if (!e.toneDisagreement) continue
    if (pinned.has(e.id)) continue
    if (!isWithinAtlasCycle(e, now)) continue
    const spread = e.toneDisagreement.spread
    push(eventRow(e, {
      kind: 'dispute',
      why: `${e.toneDisagreement.count} sources disagree on tone (spread ${Number(spread).toFixed(1)}) — framing dispute`,
    }))
  }

  // 4. Structural anomalies (spikes, blackouts, composites).
  for (const a of recentAnomalies) {
    if (a.type === 'CORROBORATION_BOOST') continue
    push(anomalyRow(a, eventMap, now))
  }

  // 5. Watchlist-country surge alerts.
  for (const s of surgeAlerts) {
    push(surgeRow(s))
  }

  rows.sort((a, b) =>
    (b.isNew - a.isNew)
    || (b.severity - a.severity)
    || (tsMs(b.timestamp) - tsMs(a.timestamp)),
  )
  return rows
}

/** Header badge: high-severity cycle events that landed after the analyst's last triage visit. */
export function countUnseenHighSeverity(events, lastSeenAt, now = Date.now(), investigation = null) {
  if (!events?.length) return 0
  const pinned = pinnedEventIds(investigation)
  let n = 0
  for (const e of events) {
    if ((e.severity || 1) < 4) continue
    if (pinned.has(e.id)) continue
    if (!isWithinAtlasCycle(e, now)) continue
    if (tsMs(e.fetchedAt, eventTimestampMs(e)) > lastSeenAt) n++
  }
  return n
}
