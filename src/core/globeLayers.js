export const NUCLEAR_FACILITIES = [
  { name: 'Zaporizhzhia', lat: 47.51, lng: 34.59, country: 'UA' },
  { name: 'Fukushima Daiichi', lat: 37.42, lng: 141.03, country: 'JP' },
  { name: 'Chernobyl', lat: 51.39, lng: 30.10, country: 'UA' },
  { name: 'Sellafield', lat: 54.42, lng: -3.50, country: 'GB' },
  { name: 'La Hague', lat: 49.68, lng: -1.88, country: 'FR' },
  { name: 'Hanford', lat: 46.55, lng: -119.49, country: 'US' },
  { name: 'Natanz', lat: 33.72, lng: 51.73, country: 'IR' },
  { name: 'Yongbyon', lat: 39.80, lng: 125.75, country: 'KP' },
  { name: 'Dimona', lat: 31.00, lng: 35.15, country: 'IL' },
  { name: 'Bushehr', lat: 28.83, lng: 50.89, country: 'IR' },
  { name: 'Koodankulam', lat: 8.17, lng: 77.71, country: 'IN' },
  { name: 'Barakah', lat: 23.96, lng: 52.26, country: 'AE' },
  { name: 'Hinkley Point C', lat: 51.21, lng: -3.13, country: 'GB' },
  { name: 'Vogtle', lat: 33.14, lng: -81.76, country: 'US' },
  { name: 'Taishan', lat: 21.92, lng: 112.98, country: 'CN' },
]


export const ARC_TYPES = {
  CORRELATION: 'correlation',
  TRAJECTORY: 'trajectory',
  BLACKOUT: 'blackout',
}

/** Data-layer keys for GDELT GEO overlays (heatmap + choropleth). See `atlasStore` defaults. */
export const GLOBE_OVERLAY_LAYER_KEYS = {
  GDELT_HEATMAP: 'gdeltHeatmap',
  GDELT_CHOROPLETH: 'gdeltChoropleth',
}

/** NASA GIBS WMTS imagery — free, no key. 2D Map + Globe.GL (Map3D has no WMTS hook). */
export const GLOBE_DATA_LAYER_KEYS = {
  GIBS_TRUE_COLOR: 'gibsTrueColor',
  GIBS_FIRES: 'gibsFires',
  GIBS_AEROSOL: 'gibsAerosol',
  GIBS_DUST: 'gibsDust',
  GIBS_CLOUDS: 'gibsClouds',
  /** Night-side city-lights emphasis (Globe.GL night texture boost; optional GIBS when available) */
  GIBS_BLACK_MARBLE: 'gibsBlackMarble',
  /** Solar terminator line overlay (all globe modes) */
  TERMINATOR: 'terminator',
  /** OpenSky Network ADS-B live aircraft — $0, anon 10s / registered 5s poll */
  ADSB: 'adsb',
  /** Military-only sub-filter of ADS-B layer (ICAO hex range heuristic) */
  ADSB_MILITARY: 'adsbMilitary',
  /** CelesTrak TLE-propagated satellite positions — $0, no key */
  SATELLITES: 'satellites',
  /** AISStream.io vessel positions at maritime chokepoints — $0, registration only */
  AIS: 'ais',
  /** NOAA NHC active tropical cyclone tracks + cone — $0, no key */
  NHC_STORMS: 'nhcStorms',
  /** Open-Meteo wind particle overlay (Globe.GL) — $0, no key */
  WIND_OVERLAY: 'windOverlay',
}

/**
 * Globe pin / ticker routing — see docs/SOURCE_GEOLOCATION_REFERENCE.md
 * and src/core/sourceGeolocation.js for tier tables and eligibility rules.
 */
export {
  eventSourceToGlobeDataLayerKey,
  getEventSourceId,
  hasPreciseGeolocation,
  isGlobeStaticPinCandidate,
  isTickerFeedEvent,
  GLOBE_LAYER_BY_SOURCE_ID,
  SOURCE_GEO_TIER,
} from './sourceGeolocation.js'

/** @param {object} evt */
export function isTacticalTrackEvent(evt) {
  const kind = evt?.trackKind
  return kind === 'aircraft' || kind === 'satellite' || kind === 'vessel'
}

/**
 * Closed ring of lat/lng/alt samples around a point (for Map3D polygon “blobs”).
 * @param {number} radiusDeg approximate angular radius in degrees
 */
export function ringAroundLatLng(lat, lng, radiusDeg, steps = 14, altitudeM = 0) {
  const ring = []
  const cosLat = Math.cos((lat * Math.PI) / 180) || 1e-6
  const n = Math.max(8, steps)
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2
    const dlat = radiusDeg * Math.sin(a)
    const dlng = (radiusDeg * Math.cos(a)) / cosLat
    ring.push({ lat: lat + dlat, lng: lng + dlng, altitude: altitudeM })
  }
  return ring
}

export const ARC_LIMIT = 15

/** GDELT AvgTone spread threshold for cluster-level disagreement highlighting. */
export const CLUSTER_TONE_DISAGREEMENT_SPREAD = 4.0

/**
 * Flag spatial clusters where member tone scores diverge sharply (GDELT AvgTone).
 * @param {{ events?: object[] }} cluster
 */
export function detectClusterToneDisagreement(cluster, threshold = CLUSTER_TONE_DISAGREEMENT_SPREAD) {
  const events = cluster?.events || []
  const tones = []
  for (const e of events) {
    if (e.toneScore != null && Number.isFinite(Number(e.toneScore))) {
      tones.push(Number(e.toneScore))
    }
    for (const r of e.sourceReports || []) {
      if (r.toneScore != null && Number.isFinite(Number(r.toneScore))) {
        tones.push(Number(r.toneScore))
      }
    }
  }
  if (tones.length < 2) return null
  const min = Math.min(...tones)
  const max = Math.max(...tones)
  const spread = max - min
  if (spread < threshold) return null
  return { min, max, spread, eventCount: events.length }
}

export function clusterEvents(events, radiusKm = 200, minClusterSize = 5) {
  const clusters = []
  const assigned = new Set()

  const sorted = [...events].sort((a, b) => b.severity - a.severity)

  for (const evt of sorted) {
    if (assigned.has(evt.id)) continue

    const cluster = [evt]
    assigned.add(evt.id)

    for (const other of sorted) {
      if (assigned.has(other.id)) continue
      // Cluster by dimension (not priority/tier)
      if (other.dimension !== evt.dimension) continue
      const dist = haversineKm(evt.lat, evt.lng, other.lat, other.lng)
      if (dist <= radiusKm) {
        cluster.push(other)
        assigned.add(other.id)
      }
    }

    if (cluster.length >= minClusterSize) {
      let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180
      let sumLat = 0, sumLng = 0

      for (const e of cluster) {
        sumLat += e.lat
        sumLng += e.lng
        if (e.lat < minLat) minLat = e.lat
        if (e.lat > maxLat) maxLat = e.lat
        if (e.lng < minLng) minLng = e.lng
        if (e.lng > maxLng) maxLng = e.lng
      }

      clusters.push({
        centroid: { lat: sumLat / cluster.length, lng: sumLng / cluster.length },
        bounds: { minLat, maxLat, minLng, maxLng },
        dimension: evt.dimension,
        priority: evt.priority,
        count: cluster.length,
        maxSeverity: Math.max(...cluster.map(e => e.severity)),
        events: cluster,
      })
    }
  }

  return clusters
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const toRad = d => d * Math.PI / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function buildCorrelationArcs(anomalies, eventMap) {
  const arcs = []

  for (const anomaly of anomalies) {
    if (anomaly.type === 'CHOKEPOINT_COMPOSITE') {
      const e1 = eventMap[anomaly.conflictEventId]
      const e2 = eventMap[anomaly.economicEventId]
      if (e1 && e2) {
        arcs.push({
          type: ARC_TYPES.CORRELATION,
          from: { lat: e1.lat, lng: e1.lng },
          to: { lat: e2.lat, lng: e2.lng },
          priority: 'p1',
          label: `Chokepoint: ${anomaly.chokepoint}`,
        })
      }
    }
  }

  return arcs.slice(0, ARC_LIMIT)
}
