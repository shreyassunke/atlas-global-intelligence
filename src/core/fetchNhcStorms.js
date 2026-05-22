/**
 * Shared NOAA NHC storm fetch + parse ($0, no key).
 * Used by fetchManager.worker (direct) and /api/nhc-storms (production proxy).
 */
import {
  extractGeometriesFromKml,
  extractNetworkLinkHrefs,
  parseNhcGisRss,
} from './nhcKmlParser.js'

const NHC_FEEDS = [
  'https://www.nhc.noaa.gov/gis-at.xml',
  'https://www.nhc.noaa.gov/gis-ep.xml',
  'https://www.nhc.noaa.gov/gis-cp.xml',
]
const NHC_ACTIVE_KML = 'https://www.nhc.noaa.gov/gis/kml/nhc_active.kml'

async function fetchText(url) {
  const res = await fetch(url, { headers: { Accept: 'application/xml, text/xml, */*' } })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  return res.text()
}

/**
 * @returns {Promise<{ stormId: string, name: string, category?: string, centerLat?: number, centerLng?: number, trackCoords: object[], coneCoords: object[] }[]>}
 */
export async function fetchNhcStormsBundle() {
  /** @type {Map<string, object>} */
  const storms = new Map()

  const feedResults = await Promise.allSettled(NHC_FEEDS.map((url) => fetchText(url)))
  for (const result of feedResults) {
    if (result.status !== 'fulfilled') continue
    for (const meta of parseNhcGisRss(result.value)) {
      storms.set(meta.stormId, { ...meta, trackCoords: [], coneCoords: [] })
    }
  }

  try {
    const activeKml = await fetchText(NHC_ACTIVE_KML)
    const hrefs = extractNetworkLinkHrefs(activeKml)
    const { tracks, cones } = extractGeometriesFromKml(activeKml)
    if (tracks.length || cones.length) {
      storms.set('active-kml', {
        stormId: 'ACTIVE',
        name: 'Active Cyclone',
        trackCoords: tracks[0] || [],
        coneCoords: cones[0] || [],
        centerLat: tracks[0]?.[tracks[0].length - 1]?.lat,
        centerLng: tracks[0]?.[tracks[0].length - 1]?.lng,
      })
    }
    for (const href of hrefs.slice(0, 8)) {
      try {
        const kml = await fetchText(href)
        const geo = extractGeometriesFromKml(kml)
        const idMatch = href.match(/\b([A-Z]{2}\d{6})\b/)
        const stormId = idMatch?.[1] || href
        if (!storms.has(stormId)) {
          storms.set(stormId, {
            stormId,
            name: stormId,
            trackCoords: geo.tracks[0] || [],
            coneCoords: geo.cones[0] || [],
          })
        } else {
          const s = storms.get(stormId)
          if (!s.trackCoords?.length && geo.tracks[0]) s.trackCoords = geo.tracks[0]
          if (!s.coneCoords?.length && geo.cones[0]) s.coneCoords = geo.cones[0]
        }
      } catch { /* skip bad link */ }
    }
  } catch { /* active KML optional */ }

  for (const storm of storms.values()) {
    if (storm.trackUrl && !storm.trackCoords?.length) {
      try {
        const kml = await fetchText(storm.trackUrl)
        const geo = extractGeometriesFromKml(kml)
        if (geo.tracks[0]) storm.trackCoords = geo.tracks[0]
      } catch { /* ignore */ }
    }
    if (storm.coneUrl && !storm.coneCoords?.length) {
      try {
        const kml = await fetchText(storm.coneUrl)
        const geo = extractGeometriesFromKml(kml)
        if (geo.cones[0]) storm.coneCoords = geo.cones[0]
      } catch { /* ignore */ }
    }
    if (storm.trackCoords?.length && (storm.centerLat == null || storm.centerLng == null)) {
      const last = storm.trackCoords[storm.trackCoords.length - 1]
      storm.centerLat = last.lat
      storm.centerLng = last.lng
    }
  }

  return [...storms.values()].map((s) => ({
    stormId: s.stormId,
    name: s.name,
    category: s.category,
    centerLat: s.centerLat,
    centerLng: s.centerLng,
    trackCoords: s.trackCoords || [],
    coneCoords: s.coneCoords || [],
  }))
}
