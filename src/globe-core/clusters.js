/**
 * globe-core/clusters — spatial cluster view-models (hull + badge), shared
 * across renderers. Previously inlined in GoogleGlobe.
 */
import { clusterEvents, detectClusterToneDisagreement } from '../core/globeLayers'
import { rgbaFromHex, SIGNAL_MARKER_COLOR } from './viewModels'

/**
 * Hard cap on the clusterer input so the O(n²) pass stays bounded when the
 * worker has delivered a particularly rich export. Upstream ranking already
 * front-loads the freshest/most-severe events, so a head-slice is a faithful
 * approximation of the dense pool.
 */
export const MAX_CLUSTER_INPUTS = 2000

export function convexHull(points) {
  if (points.length < 3) return points
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const cross = (O, A, B) => (A[0] - O[0]) * (B[1] - O[1]) - (A[1] - O[1]) * (B[0] - O[0])
  const lower = []
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper = []
  for (const p of sorted.reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
    upper.push(p)
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

/**
 * Cluster events spatially and emit renderer-agnostic hull view-models:
 * `{ key, hullRing: [{lat,lng}], fill, stroke, count, centroid, dimension,
 *    toneConflict, events }`.
 */
export function buildClusterViewModels(events, {
  radiusKm = 200,
  minClusterSize = 5,
  maxInputs = MAX_CLUSTER_INPUTS,
} = {}) {
  const clusterInput = events.length > maxInputs ? events.slice(0, maxInputs) : events
  const clusters = clusterEvents(clusterInput, radiusKm, minClusterSize)
  return clusters
    .map((cluster) => {
      const signalColor = SIGNAL_MARKER_COLOR
      const toneConflict = detectClusterToneDisagreement(cluster)
      const points = cluster.events.map((e) => [e.lng, e.lat])
      const hull = convexHull(points)
      if (hull.length < 3) return null
      return {
        key: `cl-${cluster.dimension}-${cluster.centroid.lat}-${cluster.centroid.lng}`,
        hullRing: hull.map(([lng, lat]) => ({ lat, lng })),
        fill: rgbaFromHex(signalColor, toneConflict ? 0.16 : 0.12),
        stroke: rgbaFromHex(toneConflict ? '#ffaa00' : signalColor, toneConflict ? 0.85 : 0.55),
        count: cluster.count,
        centroid: cluster.centroid,
        dimension: cluster.dimension,
        toneConflict,
        events: cluster.events,
      }
    })
    .filter(Boolean)
}
