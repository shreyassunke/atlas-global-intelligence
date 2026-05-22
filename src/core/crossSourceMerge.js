/**
 * Phase 4 — Cross-source corroboration engine.
 * Merges events from independent feeds describing the same incident,
 * scores multi-source confidence, detects tone disagreement, and threads
 * related signals across time.
 */

import { CORROBORATION_OPACITY } from './eventSchema.js'

/** Lightweight feed→module map for diversity scoring (avoids pulling sourceRegistry into workers). */
const SOURCE_MODULES = {
  usgs: 'seismic',
  gdacs: 'seismic',
  eonet: 'weather',
  'open-meteo': 'weather',
  'noaa-kp': 'space',
  'noaa-xray': 'space',
  'noaa-solar-wind': 'space',
  gdelt: 'news',
  'gdelt-events': 'conflict',
  'gdelt-cameo': 'conflict',
  'gdelt-vgkg': 'news',
  firms: 'environment',
  ucdp: 'conflict',
  coingecko: 'financial',
  'alt-fng': 'prediction',
  'cisa-kev': 'cyber',
  reliefweb: 'humanitarian',
  'who-don': 'disease',
  promed: 'disease',
  'ofac-sdn': 'diplomatic',
  'loc-legal': 'diplomatic',
  celestrak: 'space',
  opensky: 'flight',
  'celestrak-tle': 'space',
  aisstream: 'maritime',
  'noaa-nhc': 'weather',
}

export const MERGE_DISTANCE_KM = 50
export const MERGE_TIME_MS = 3600_000
export const MERGE_TITLE_THRESHOLD = 0.7
export const TONE_DISAGREEMENT_SPREAD = 4.0

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'after', 'over', 'into',
  'about', 'says', 'said', 'report', 'reports', 'news', 'breaking',
])

function toRad(deg) {
  return (deg * Math.PI) / 180
}

export function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function titleSimilarity(a, b) {
  if (!a || !b) return 0
  const wordsA = new Set(a.toLowerCase().split(/\s+/))
  const wordsB = new Set(b.toLowerCase().split(/\s+/))
  let intersection = 0
  for (const w of wordsA) if (wordsB.has(w)) intersection++
  const union = new Set([...wordsA, ...wordsB]).size
  return union === 0 ? 0 : intersection / union
}

function normalizeTitleStem(title) {
  return (title || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
    .slice(0, 8)
    .join('_')
}

function geoCell(lat, lng, sizeDeg = 0.5) {
  const row = Math.floor((lat + 90) / sizeDeg)
  const col = Math.floor((lng + 180) / sizeDeg)
  return `${row}_${col}`
}

function getSourceModule(sourceId) {
  return SOURCE_MODULES[sourceId] || sourceId || 'unknown'
}

/**
 * Stable thread key from title stem, geo cell, and GDELT actors.
 */
export function buildThreadId(event) {
  const stem = normalizeTitleStem(event.title)
  const cell = geoCell(event.lat || 0, event.lng || 0)
  const entities = [event.actor1, event.actor2]
    .filter(Boolean)
    .map((a) => a.toLowerCase().slice(0, 24))
    .sort()
    .join('|')
  return `${stem}::${cell}::${entities}`
}

export function buildSourceReport(event) {
  const sourceId = event.corroborationSources?.[0] || event.source || 'unknown'
  return {
    sourceId,
    source: event.source || sourceId,
    title: event.title || '',
    toneScore: event.toneScore ?? null,
    timestamp: event.timestamp || new Date().toISOString(),
    severity: event.severity || 1,
    eventId: event.id,
  }
}

export function computeSourceDiversityEntropy(reports) {
  if (!reports?.length) return 0
  const counts = {}
  for (const r of reports) {
    const mod = getSourceModule(r.sourceId)
    counts[mod] = (counts[mod] || 0) + 1
  }
  const total = reports.length
  if (total <= 1) return 0
  let entropy = 0
  for (const c of Object.values(counts)) {
    const p = c / total
    entropy -= p * Math.log2(p)
  }
  return entropy
}

/**
 * Weighted corroboration score (0–1) from distinct feed count, module diversity, and time spread.
 */
export function computeCorroborationScore(event) {
  const reports = event.sourceReports?.length
    ? event.sourceReports
    : (event.corroborationSources || []).map((id) => ({ sourceId: id }))

  const distinctSources = new Set([
    ...(event.corroborationSources || []),
    ...reports.map((r) => r.sourceId),
  ]).size

  if (distinctSources <= 1) return 0

  const countScore = Math.min(1, (distinctSources - 1) / 4)
  const diversity = computeSourceDiversityEntropy(reports)
  const maxEntropy = Math.log2(Math.max(2, distinctSources))
  const diversityScore = maxEntropy > 0 ? diversity / maxEntropy : 0

  let timeSpreadScore = 0
  const timedReports = reports.filter((r) => r.timestamp)
  if (timedReports.length >= 2) {
    const times = timedReports.map((r) => new Date(r.timestamp).getTime()).filter(Number.isFinite)
    if (times.length >= 2) {
      const spreadMs = Math.max(...times) - Math.min(...times)
      timeSpreadScore = Math.min(1, spreadMs / (6 * 3600_000))
    }
  }

  const score = countScore * 0.5 + diversityScore * 0.3 + timeSpreadScore * 0.2
  return Math.round(score * 100) / 100
}

export function detectToneDisagreement(reports, threshold = TONE_DISAGREEMENT_SPREAD) {
  const tones = (reports || [])
    .map((r) => r.toneScore)
    .filter((t) => t != null && Number.isFinite(Number(t)))
    .map(Number)
  if (tones.length < 2) return null
  const min = Math.min(...tones)
  const max = Math.max(...tones)
  const spread = max - min
  if (spread < threshold) return null
  return { min, max, spread, count: tones.length }
}

export function isTacticalTrackEvent(event) {
  const kind = event?.trackKind
  return kind === 'aircraft' || kind === 'satellite' || kind === 'vessel' || kind === 'storm'
}

export function findCrossSourceDuplicate(event, pool, opts = {}) {
  if (isTacticalTrackEvent(event)) return null

  const distanceKm = opts.distanceKm ?? MERGE_DISTANCE_KM
  const timeMs = opts.timeMs ?? MERGE_TIME_MS
  const titleThreshold = opts.titleThreshold ?? MERGE_TITLE_THRESHOLD

  for (const existing of pool) {
    if (isTacticalTrackEvent(existing)) continue
    const timeDiff = Math.abs(
      new Date(event.timestamp).getTime() - new Date(existing.timestamp).getTime(),
    )
    if (timeDiff > timeMs) continue
    const dist = haversineKm(event.lat, event.lng, existing.lat, existing.lng)
    if (dist > distanceKm) continue
    if (titleSimilarity(event.title, existing.title) >= titleThreshold) {
      return existing
    }
  }
  return null
}

function recomputeOpacity(existing, corrobCount) {
  return existing.authoritative && corrobCount === 1
    ? Math.max(0.75, CORROBORATION_OPACITY[corrobCount] || 0.35)
    : CORROBORATION_OPACITY[corrobCount] || 0.35
}

/**
 * Merge incoming event into canonical existing record.
 * Mutates `existing` and returns it.
 */
export function mergeCrossSource(existing, incoming, opts = {}) {
  const onPriorityUpgrade = opts.onPriorityUpgrade

  const sources = new Set(existing.corroborationSources || [])
  for (const s of incoming.corroborationSources || []) sources.add(s)

  const reportMap = new Map()
  for (const r of existing.sourceReports || []) {
    reportMap.set(r.eventId || `${r.sourceId}|${r.timestamp}`, r)
  }
  reportMap.set(incoming.id, buildSourceReport(incoming))
  existing.sourceReports = [...reportMap.values()].slice(-12)

  const corrobCount = Math.min(sources.size, 5)
  existing.corroborationCount = corrobCount
  existing.corroborationSources = [...sources]
  existing.corroborationScore = computeCorroborationScore(existing)
  existing.opacity = recomputeOpacity(existing, corrobCount)

  existing.threadId = existing.threadId || buildThreadId(existing)
  if (incoming.id && incoming.id !== existing.id) {
    const ids = new Set(existing.correlatedEventIds || [])
    ids.add(incoming.id)
    existing.correlatedEventIds = [...ids].slice(-20)
  }

  const severityGap = Math.abs((incoming.severity || 1) - (existing.severity || 1))
  if (severityGap >= 2 && sources.size >= 2) {
    existing.disputed = true
    existing.severity = Math.min(existing.severity || 1, incoming.severity || 1)
  } else if ((incoming.severity || 1) > (existing.severity || 1)) {
    const oldPriority = existing.priority
    existing.severity = incoming.severity
    existing.priority = incoming.priority || existing.priority
    if (typeof onPriorityUpgrade === 'function' && oldPriority !== existing.priority) {
      onPriorityUpgrade(existing, oldPriority)
    }
  }

  const toneDis = detectToneDisagreement(existing.sourceReports)
  if (toneDis) {
    existing.disputed = true
    existing.toneDisagreement = toneDis
  } else {
    existing.toneDisagreement = null
  }

  const tones = existing.sourceReports
    .filter((r) => r.toneScore != null)
    .map((r) => Number(r.toneScore))
  if (tones.length) {
    existing.toneScore = tones.reduce((a, b) => a + b, 0) / tones.length
  }

  return existing
}

/** Initialize corroboration metadata on a newly ingested event. */
export function initializeCorroborationFields(event) {
  event.threadId = event.threadId || buildThreadId(event)
  event.sourceReports = event.sourceReports?.length
    ? event.sourceReports
    : [buildSourceReport(event)]
  event.corroborationScore = computeCorroborationScore(event)
  event.correlatedEventIds = event.correlatedEventIds || []
  return event
}
