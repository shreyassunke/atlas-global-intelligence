/**
 * globe-core/heatBins — bin GDELT heatmap points into coarse cells for
 * marker-based renderers (Map3D has no native heat layer). Globe.GL keeps
 * consuming the raw weighted points via its own heatmap layer.
 */

/** Bin heatmap points into ~`cellDeg`° cells, normalized, heaviest first. */
export function buildHeatBins(points, { cellDeg = 1.5, maxBins = 400 } = {}) {
  if (!Array.isArray(points) || points.length === 0) return []
  const bins = new Map()
  for (const p of points) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue
    const ix = Math.round(p.lat / cellDeg)
    const iy = Math.round(p.lng / cellDeg)
    const k = `${ix}|${iy}`
    const prev = bins.get(k)
    if (prev) {
      prev.w += p.weight || 1
      prev.n += 1
    } else {
      bins.set(k, { lat: ix * cellDeg, lng: iy * cellDeg, w: p.weight || 1, n: 1 })
    }
  }
  const out = [...bins.values()]
  let max = 0
  for (const b of out) if (b.w > max) max = b.w
  for (const b of out) b.norm = max > 0 ? b.w / max : 0
  out.sort((a, b) => b.w - a.w)
  return out.slice(0, maxBins)
}
