/**
 * globe-core/choropleth — GDELT country-tone choropleth view-models.
 *
 * Joins the tone scale once so renderers never re-derive fill colors:
 * `{ key, geometry, fill, stroke, name, iso, tone, count, props }`.
 */
import { toneToChoroplethRgba } from '../services/gdelt/geoService'

export const CHOROPLETH_STROKE = 'rgba(255,255,255,0.22)'

export function buildChoroplethViewModels(rows, toneRange) {
  if (!Array.isArray(rows) || rows.length === 0) return []
  const min = toneRange?.min ?? -5
  const max = toneRange?.max ?? 5
  return rows.map((r, i) => ({
    key: `gdelt-choro-${i}`,
    geometry: r.geometry,
    fill: toneToChoroplethRgba(r.tone, min, max),
    stroke: CHOROPLETH_STROKE,
    name: r.name,
    iso: r.iso,
    tone: r.tone,
    count: r.count,
    props: r.props,
  }))
}

/** Flatten GeoJSON Polygon / MultiPolygon geometry to an array of outer rings. */
export function geoJsonToOuterRings(geometry) {
  if (!geometry) return []
  const rings = []
  if (geometry.type === 'Polygon' && Array.isArray(geometry.coordinates)) {
    if (geometry.coordinates[0]) rings.push(geometry.coordinates[0])
  } else if (geometry.type === 'MultiPolygon' && Array.isArray(geometry.coordinates)) {
    for (const poly of geometry.coordinates) {
      if (poly && poly[0]) rings.push(poly[0])
    }
  }
  return rings
    .map((ring) =>
      ring
        .filter((pair) => Array.isArray(pair) && pair.length >= 2 && Number.isFinite(pair[0]) && Number.isFinite(pair[1]))
        .map(([lng, lat]) => ({ lat, lng, altitude: 0 })),
    )
    .filter((ring) => ring.length >= 3)
}
