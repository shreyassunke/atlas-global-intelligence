/**
 * Source geolocation tiers and globe/ticker routing.
 * Canonical reference: docs/SOURCE_GEOLOCATION_REFERENCE.md
 */

/** @typedef {'pinpoint' | 'event' | 'approximate' | 'none'} GeoTier */

/** @type {Record<string, GeoTier>} */
export const SOURCE_GEO_TIER = {
  // Tier A — pinpoint
  usgs: 'pinpoint',
  gdacs: 'pinpoint',
  eonet: 'pinpoint',
  firms: 'pinpoint',
  opensky: 'pinpoint',
  aisstream: 'pinpoint',
  'noaa-nhc': 'pinpoint',
  safecast: 'pinpoint',

  // Tier B — event geocoded (variable resolution)
  'gdelt-cameo': 'event',
  ucdp: 'event',
  acled: 'event',
  'celestrak-tle': 'event',
  'gdelt-events': 'event',
  shodan: 'event',
  'open-meteo': 'event',

  // Tier C — placeholder / centroid
  gdelt: 'approximate',
  'gdelt-vgkg': 'approximate',
  reliefweb: 'approximate',
  bluesky: 'approximate',
  'fact-check': 'approximate',
  coingecko: 'approximate',
  'alt-fng': 'approximate',
  finnhub: 'approximate',
  fred: 'approximate',
  eia: 'approximate',
  'cisa-kev': 'approximate',
  'who-don': 'approximate',
  promed: 'approximate',
  'ofac-sdn': 'approximate',
  'loc-legal': 'approximate',
  cloudflare: 'approximate',
  'electricity-maps': 'approximate',
  'noaa-kp': 'approximate',
  'noaa-xray': 'approximate',
  'noaa-solar-wind': 'approximate',

  // Tier D — no usable geo
  abuseipdb: 'none',
  celestrak: 'none',
  entsoe: 'none',
}

/**
 * Globe data-layer keys for sources with precise enough geo to pin.
 * @type {Record<string, string>}
 */
export const GLOBE_LAYER_BY_SOURCE_ID = {
  usgs: 'usgs',
  gdacs: 'gdacs',
  eonet: 'eonet',
  firms: 'firms',
  'gdelt-cameo': 'gdeltSignals',
  'gdelt-events': 'gdeltSignals',
  ucdp: 'conflictEvents',
  acled: 'conflictEvents',
  opensky: 'adsb',
  'celestrak-tle': 'satellites',
  aisstream: 'ais',
  'noaa-nhc': 'nhcStorms',
}

/** Fallback when only a display label is available (prefer corroborationSources). */
const DISPLAY_SOURCE_TO_ID = {
  usgs: 'usgs',
  gdacs: 'gdacs',
  'nasa eonet': 'eonet',
  eonet: 'eonet',
  'nasa firms': 'firms',
  firms: 'firms',
  ucdp: 'ucdp',
  acled: 'acled',
  opensky: 'opensky',
  'opensky network': 'opensky',
  aisstream: 'aisstream',
  'noaa nhc': 'noaa-nhc',
  'celestrak tle': 'celestrak-tle',
}

/**
 * Resolve the fetchManager source id for an event.
 * @param {object} event
 * @returns {string}
 */
export function getEventSourceId(event) {
  const fromCorro = event?.corroborationSources?.[0]
  if (typeof fromCorro === 'string' && fromCorro.trim()) {
    return fromCorro.trim().toLowerCase()
  }
  const label = String(event?.source || '').trim().toLowerCase()
  if (DISPLAY_SOURCE_TO_ID[label]) return DISPLAY_SOURCE_TO_ID[label]
  if (label.includes('gdelt')) return 'gdelt'
  return label.replace(/\s+/g, '-')
}

/**
 * @param {string} sourceId
 * @returns {GeoTier}
 */
export function getSourceGeoTier(sourceId) {
  return SOURCE_GEO_TIER[sourceId] || 'approximate'
}

/**
 * Event has coordinates tied to the phenomenon (not a placeholder centroid).
 * @param {object} event
 */
export function hasPreciseGeolocation(event) {
  if (!event || event.latApproximate) return false
  if (event.lat == null || event.lng == null) return false
  if (event.lat === 0 && event.lng === 0) return false
  return true
}

/**
 * Map a source id (or event) to a globe data-layer key, or null if ticker-only.
 * @param {object|string} sourceOrEvent — event object or source id string
 * @returns {string|null}
 */
export function eventSourceToGlobeDataLayerKey(sourceOrEvent) {
  const sourceId = typeof sourceOrEvent === 'object' && sourceOrEvent !== null
    ? getEventSourceId(sourceOrEvent)
    : String(sourceOrEvent || '').trim().toLowerCase()

  if (!sourceId) return null

  // Block approximate GDELT feeds explicitly (DOC, VGKG share display label "GDELT").
  if (sourceId === 'gdelt' || sourceId === 'gdelt-vgkg') return null

  return GLOBE_LAYER_BY_SOURCE_ID[sourceId] ?? null
}

/**
 * Static pin candidate: precise geo + mappable source + not a motion track.
 * Does not check layer toggles or HUD filters.
 * @param {object} event
 */
export function isGlobeStaticPinCandidate(event) {
  if (!event || event.trackKind) return false
  if (!hasPreciseGeolocation(event)) return false
  return Boolean(eventSourceToGlobeDataLayerKey(event))
}

/**
 * Events that belong in the ticker / expanded feed tray (not static globe pins).
 * P1 globe events may still appear in the ticker for breaking visibility.
 * @param {object} event
 */
export function isTickerFeedEvent(event) {
  if (!event || event.trackKind) return false
  if (isGlobeStaticPinCandidate(event)) {
    return event.priority === 'p1'
  }
  return true
}
