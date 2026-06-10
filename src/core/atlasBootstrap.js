/**
 * Bootstrap readiness — fast path to the live globe; layers continue loading in the background.
 */

/** @typedef {'pending'|'loading'|'ready'|'skipped'|'failed'} BootstrapStatus */

/** Minimum time the splash is visible (avoids a flash). */
export const BOOTSTRAP_MIN_MS = 1800
/** Hard cap — HUD unlocks even if slow feeds are still warming up. */
export const BOOTSTRAP_MAX_MS = 9000

/** Only these worker sources require an API key — safe to skip in UI when absent. */
export const KEYED_OPTIONAL_SOURCES = new Set([
  'firms',
  'acled',
  'finnhub',
  'fred',
  'eia',
  'cloudflare',
  'abuseipdb',
  'shodan',
  'electricity-maps',
  'entsoe',
  'aisstream',
  'fact-check',
])

/** Steps that must be ready before the HUD is shown. */
export const BLOCKING_STEP_IDS = new Set(['globe', 'feeds'])

/**
 * @param {Record<string, { status?: string, eventCount?: number, lastFetch?: number, error?: string }>} statuses
 * @param {string[]} sourceIds
 */
export function sourceGroupStatus(statuses, sourceIds) {
  const rows = sourceIds.map((id) => statuses[id]).filter(Boolean)
  if (rows.length === 0) return 'loading'

  if (rows.some((r) => r.status === 'fetching')) return 'loading'

  const anyFetched = rows.some((r) => r.lastFetch > 0)
  if (!anyFetched) return 'loading'

  if (rows.every((r) => r.status === 'error')) return 'failed'

  const totalEvents = rows.reduce((n, r) => n + (r.eventCount || 0), 0)
  if (totalEvents > 0) return 'ready'

  if (rows.some((r) => r.status === 'connected' || r.status === 'partial' || r.status === 'stale')) return 'ready'

  return 'loading'
}

/** Layer key → worker source id(s) for the splash checklist (informational). */
export const LAYER_SOURCE_MAP = {
  gdeltSignals: { sources: ['gdelt-cameo'], label: 'GDELT signals' },
  gdeltHeatmap: { sources: ['gdelt'], label: 'GDELT heatmap', geoOverlay: 'heatmap' },
  gdeltChoropleth: { sources: ['gdelt-cameo'], label: 'GDELT country tone', geoOverlay: 'choropleth' },
  firms: { sources: ['firms'], label: 'NASA FIRMS fires', optionalKeyed: true },
  usgs: { sources: ['usgs'], label: 'USGS earthquakes' },
  gdacs: { sources: ['gdacs'], label: 'GDACS disasters' },
  eonet: { sources: ['eonet'], label: 'NASA EONET events' },
  adsb: { sources: ['opensky'], label: 'ADS-B aircraft' },
  satellites: { sources: ['celestrak-tle'], label: 'Satellite catalog' },
  ais: { sources: ['aisstream'], label: 'AIS vessel tracking', optionalKeyed: true },
  nhcStorms: { sources: ['noaa-nhc'], label: 'NOAA hurricane tracks' },
}

/**
 * @param {{
 *   dataLayers: Record<string, boolean>,
 *   sourceStatuses: Record<string, object>,
 *   globeReady: boolean,
 *   geoOverlay: { heatmapReady?: boolean, choroplethReady?: boolean, loading?: boolean },
 *   trackCounts: { aircraft: number, satellites: number, vessels: number },
 *   workersReady: boolean,
 * }} ctx
 */
export function computeBootstrapSteps(ctx) {
  const { dataLayers, sourceStatuses, globeReady, geoOverlay, trackCounts, workersReady, elapsedMs = 0 } = ctx
  const timedOut = elapsedMs >= BOOTSTRAP_MAX_MS
  /** @type {{ id: string, label: string, status: BootstrapStatus, detail?: string, blocking?: boolean }[]} */
  const steps = []

  steps.push({
    id: 'globe',
    label: 'Globe renderer',
    status: globeReady || timedOut ? 'ready' : 'loading',
    blocking: true,
  })

  steps.push({
    id: 'feeds',
    label: 'Data feed workers',
    status: workersReady ? 'ready' : 'loading',
    blocking: true,
  })

  const seenSourceGroups = new Set()

  for (const [layerKey, cfg] of Object.entries(LAYER_SOURCE_MAP)) {
    if (dataLayers?.[layerKey] === false) continue

    const groupKey = `${cfg.sources.join('|')}|${cfg.geoOverlay || ''}`
    if (seenSourceGroups.has(groupKey)) continue
    seenSourceGroups.add(groupKey)

    let status = sourceGroupStatus(sourceStatuses, cfg.sources)
    let detail

    if (cfg.optionalKeyed || cfg.sources.every((id) => KEYED_OPTIONAL_SOURCES.has(id))) {
      const anyKnown = cfg.sources.some((id) => sourceStatuses[id] != null)
      if (!anyKnown && workersReady) {
        status = 'skipped'
        detail = 'Requires API key in environment'
      }
    }

    if (layerKey === 'adsb') {
      if (trackCounts.aircraft > 0) status = 'ready'
      else if (sourceStatuses.opensky?.status === 'partial') {
        status = 'loading'
        detail = sourceStatuses.opensky?.warning || 'OpenSky warming up…'
      } else if (sourceStatuses.opensky?.status === 'error') {
        const err = sourceStatuses.opensky?.error || ''
        if (err.includes('429')) {
          status = 'loading'
          detail = 'OpenSky rate limited — backing off'
        } else {
          status = 'failed'
          detail = err || 'OpenSky unavailable — retrying'
        }
      } else if (sourceStatuses.opensky?.eventCount > 0) {
        status = 'loading'
        detail = 'Receiving aircraft positions…'
      }
    }

    if (layerKey === 'satellites') {
      if (trackCounts.satellites > 0) status = 'ready'
      else if (sourceStatuses['celestrak-tle']?.status === 'partial') {
        status = 'loading'
        detail = sourceStatuses['celestrak-tle']?.warning || 'Loading satellite catalog…'
      } else if (sourceStatuses['celestrak-tle']?.status === 'error') {
        status = 'loading'
        detail = sourceStatuses['celestrak-tle']?.error || 'CelesTrak fetch failed — retrying'
      } else if (sourceStatuses['celestrak-tle']?.eventCount > 0) {
        status = 'loading'
        detail = 'Propagating orbital tracks…'
      }
    }

    if (layerKey === 'ais') {
      if (trackCounts.vessels > 0) status = 'ready'
      else if (sourceStatuses.aisstream?.status === 'partial') {
        status = 'loading'
        detail = sourceStatuses.aisstream?.warning || 'Connecting to AISStream…'
      } else if (sourceStatuses.aisstream?.status === 'error') {
        status = 'loading'
        detail = sourceStatuses.aisstream?.error || 'AISStream unavailable — retrying'
      } else if (sourceStatuses.aisstream?.warning) {
        status = 'loading'
        detail = sourceStatuses.aisstream.warning
      }
    }

    if (layerKey === 'nhcStorms') {
      const nhcStatus = sourceStatuses['noaa-nhc']
      if (nhcStatus?.eventCount > 0) status = 'ready'
      else if (nhcStatus?.status === 'connected' && nhcStatus?.eventCount === 0) {
        status = 'ready'
        detail = 'No active tropical cyclones (Atlantic/Pacific)'
      } else if (nhcStatus?.status === 'error') {
        status = 'failed'
        detail = nhcStatus.error || 'NOAA NHC feed unavailable'
      }
    }

    if (cfg.geoOverlay === 'heatmap' && dataLayers?.gdeltHeatmap !== false) {
      if (geoOverlay.loading) status = 'loading'
      else if (geoOverlay.heatmapReady) status = 'ready'
    }
    if (cfg.geoOverlay === 'choropleth' && dataLayers?.gdeltChoropleth !== false) {
      if (geoOverlay.loading) status = 'loading'
      else if (geoOverlay.choroplethReady) status = 'ready'
    }

    if (status === 'failed' && !detail) {
      detail = cfg.sources.map((id) => sourceStatuses[id]?.error).filter(Boolean)[0]
        || 'Source unavailable'
    }

    steps.push({
      id: layerKey,
      label: cfg.label,
      status,
      detail,
      blocking: false,
    })
  }

  return steps
}

/** Progress for the splash bar — time-based so it never appears stuck. */
export function bootstrapProgress(steps, elapsedMs) {
  const timePct = Math.min(92, (elapsedMs / BOOTSTRAP_MAX_MS) * 92)
  if (!steps.length) return Math.round(timePct)

  const weights = { ready: 1, skipped: 1, failed: 1, loading: 0.5, pending: 0.2 }
  const stepPct = (steps.reduce((n, s) => n + (weights[s.status] ?? 0), 0) / steps.length) * 100
  return Math.min(100, Math.round(Math.max(timePct, stepPct * 0.85)))
}

export function isBootstrapCompleteFromCtx(steps, { elapsedMs, globeReady, workersReady, sourceStatuses }) {
  if (!workersReady) return false
  if (elapsedMs < BOOTSTRAP_MIN_MS) return false
  // Never block the HUD past the hard cap — tactical feeds keep loading in the background.
  if (elapsedMs >= BOOTSTRAP_MAX_MS) return true

  if (!globeReady) return false

  const gdeltEvents =
    (sourceStatuses.gdelt?.eventCount ?? 0) > 0 ||
    (sourceStatuses['gdelt-cameo']?.eventCount ?? 0) > 0
  if (gdeltEvents) return true

  return elapsedMs >= BOOTSTRAP_MIN_MS + 2500
}

/** Worker sources polled first (immediate, no stagger). */
export const PRIORITY_FETCH_SOURCES = [
  'opensky',
  'celestrak-tle',
  'gdelt-cameo',
  'gdelt',
  'usgs',
  'gdacs',
  'eonet',
]
