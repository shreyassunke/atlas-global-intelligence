/**
 * NOAA NHC KML/RSS parsers — $0 public feeds, no key.
 * Extracts forecast track polylines and cone-of-uncertainty polygons.
 */

/**
 * Parse KML `<coordinates>` text (lng,lat[,alt] tuples).
 * @param {string} text
 * @returns {{ lat: number, lng: number }[]}
 */
export function parseKmlCoordinates(text) {
  if (!text) return []
  const coords = []
  for (const token of text.trim().split(/\s+/)) {
    const parts = token.split(',').map(Number)
    if (parts.length < 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) continue
    coords.push({ lng: parts[0], lat: parts[1] })
  }
  return coords
}

/**
 * Extract LineString and Polygon geometries from KML text.
 * @param {string} kml
 * @returns {{ tracks: { lat: number, lng: number }[][], cones: { lat: number, lng: number }[][] }}
 */
export function extractGeometriesFromKml(kml) {
  const tracks = []
  const cones = []
  if (!kml) return { tracks, cones }

  const placemarkRe = /<Placemark[^>]*>([\s\S]*?)<\/Placemark>/gi
  let pm
  while ((pm = placemarkRe.exec(kml)) !== null) {
    const block = pm[1]
    const nameMatch = block.match(/<name>([^<]*)<\/name>/i)
    const name = (nameMatch?.[1] || '').toLowerCase()

    const lineMatch = block.match(/<LineString[^>]*>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/i)
    if (lineMatch) {
      const pts = parseKmlCoordinates(lineMatch[1])
      if (pts.length >= 2) {
        if (name.includes('track') || name.includes('forecast') || !name.includes('cone')) {
          tracks.push(pts)
        }
      }
    }

    const polyMatch = block.match(/<Polygon[^>]*>[\s\S]*?<outerBoundaryIs>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/i)
      || block.match(/<Polygon[^>]*>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/i)
    if (polyMatch) {
      const pts = parseKmlCoordinates(polyMatch[1])
      if (pts.length >= 3 && (name.includes('cone') || name.includes('uncertainty') || name.includes('error'))) {
        cones.push(pts)
      }
    }
  }

  // Fallback: any LineString/Polygon if name heuristics missed
  if (tracks.length === 0) {
    const lineRe = /<LineString[^>]*>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/gi
    let lm
    while ((lm = lineRe.exec(kml)) !== null) {
      const pts = parseKmlCoordinates(lm[1])
      if (pts.length >= 2) tracks.push(pts)
    }
  }
  if (cones.length === 0) {
    const polyRe = /<Polygon[^>]*>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/gi
    let pm2
    while ((pm2 = polyRe.exec(kml)) !== null) {
      const pts = parseKmlCoordinates(pm2[1])
      if (pts.length >= 3) cones.push(pts)
    }
  }

  return { tracks, cones }
}

/**
 * Parse NHC GIS RSS for storm KML links.
 * @param {string} xml
 * @returns {{ stormId: string, name: string, trackUrl?: string, coneUrl?: string, centerLat?: number, centerLng?: number, category?: string }[]}
 */
export function parseNhcGisRss(xml) {
  if (!xml || /no tropical cyclones/i.test(xml)) return []

  const storms = []
  const itemRe = /<item>([\s\S]*?)<\/item>/gi
  let item
  const byStorm = new Map()

  while ((item = itemRe.exec(xml)) !== null) {
    const block = item[1]
    if (/no tropical cyclones/i.test(block)) continue

    const title = (block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i)?.[1] || '').trim()
    const desc = block.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i)?.[1] || ''

    const stormIdMatch = title.match(/\b([A-Z]{2}\d{6})\b/) || desc.match(/\b([A-Z]{2}\d{6})\b/)
    const stormId = stormIdMatch?.[1]
    if (!stormId) continue

    if (!byStorm.has(stormId)) {
      const namePart = title.replace(stormId, '').replace(/^[\s\-–—]+/, '').trim()
      byStorm.set(stormId, {
        stormId,
        name: namePart || stormId,
        trackUrl: undefined,
        coneUrl: undefined,
        centerLat: undefined,
        centerLng: undefined,
        category: undefined,
      })
    }
    const entry = byStorm.get(stormId)

    const cycloneMatch = block.match(/centerLat="([^"]+)"[^>]*centerLon="([^"]+)"/i)
      || block.match(/centerLon="([^"]+)"[^>]*centerLat="([^"]+)"/i)
    if (cycloneMatch) {
      entry.centerLat = parseFloat(cycloneMatch[1])
      entry.centerLng = parseFloat(cycloneMatch[2])
    }
    const typeMatch = block.match(/type="([^"]+)"/i)
    if (typeMatch) entry.category = typeMatch[1]

    const urls = [...(desc.match(/https?:\/\/[^\s"'<>]+\.kml[^\s"'<>]*/gi) || [])]
    for (const url of urls) {
      const lower = url.toLowerCase()
      if (lower.includes('track') || lower.includes('forecast_track')) entry.trackUrl = url
      else if (lower.includes('cone') || lower.includes('uncertainty')) entry.coneUrl = url
    }

    const linkMatch = block.match(/<link>([^<]+)<\/link>/i)
    if (linkMatch && linkMatch[1].includes('.kml')) {
      const url = linkMatch[1].trim()
      const lower = url.toLowerCase()
      if (lower.includes('track')) entry.trackUrl = url
      else if (lower.includes('cone')) entry.coneUrl = url
    }
  }

  return [...byStorm.values()]
}

/**
 * Extract NetworkLink hrefs from nhc_active.kml for follow-up fetches.
 * @param {string} kml
 * @returns {string[]}
 */
export function extractNetworkLinkHrefs(kml) {
  if (!kml) return []
  const hrefs = []
  const re = /<href>([^<]+\.kml[^<]*)<\/href>/gi
  let m
  while ((m = re.exec(kml)) !== null) {
    const href = m[1].trim()
    if (href && !hrefs.includes(href)) hrefs.push(href)
  }
  return hrefs
}
