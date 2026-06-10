/**
 * globe-core/useGlobeViewModels — single entry point for renderers.
 *
 * Composes the filtered layer events and GDELT field overlays into
 * renderer-agnostic view-models. Renderers are thin adapters: they consume
 * these VMs and translate them into native layer primitives.
 *
 * Options (constant per call site — each renderer always passes the same):
 *   - withClusters: compute spatial cluster hull VMs (O(n²); Map3D only)
 *   - withHeatBins: bin heatmap points into cells (marker-based heat; Map3D)
 *   - withFields:   fetch GDELT field overlays at all (false for FlatMap,
 *                   which draws no choropleth/heatmap)
 */
import { useEffect, useMemo, useState } from 'react'
import { useAtlasStore } from '../store/atlasStore'
import useGlobeLayerEvents from './useGlobeLayerEvents'
import useGdeltGeoOverlay from './useGdeltGeoOverlay'
import { buildMarkerViewModels, layerRevealMultiplier } from './viewModels'
import { buildClusterViewModels } from './clusters'
import { buildChoroplethViewModels } from './choropleth'
import { buildHeatBins } from './heatBins'

export function useGlobeViewModels({
  withClusters = false,
  withHeatBins = false,
  withFields = true,
} = {}) {
  const layerRevealAt = useAtlasStore((s) => s.layerRevealAt)
  const [revealTick, setRevealTick] = useState(0)

  useEffect(() => {
    const now = Date.now()
    const animating = Object.entries(layerRevealAt || {}).some(
      ([key, t0]) => layerRevealMultiplier(layerRevealAt, key, now) < 1 && now - t0 < 600,
    )
    if (!animating) return undefined
    const id = setInterval(() => setRevealTick((t) => t + 1), 50)
    return () => clearInterval(id)
  }, [layerRevealAt, revealTick])

  const {
    globePlottedEvents,
    tacticalAircraft,
    tacticalVessels,
    tacticalSatellites,
    stormOverlays,
    propagationTick,
  } = useGlobeLayerEvents()

  const { heatmapPoints, choroplethRows, toneRange } = useGdeltGeoOverlay({ enabled: withFields })

  const markers = useMemo(
    () => buildMarkerViewModels({
      globePlottedEvents,
      tacticalAircraft,
      tacticalVessels,
      tacticalSatellites,
      stormOverlays,
      layerRevealAt,
    }),
    [globePlottedEvents, tacticalAircraft, tacticalVessels, tacticalSatellites, stormOverlays, layerRevealAt, revealTick],
  )

  const clusters = useMemo(
    () => (withClusters ? buildClusterViewModels(globePlottedEvents) : []),
    [withClusters, globePlottedEvents],
  )

  const choropleth = useMemo(
    () => buildChoroplethViewModels(choroplethRows, toneRange),
    [choroplethRows, toneRange],
  )

  const heatBins = useMemo(
    () => (withHeatBins ? buildHeatBins(heatmapPoints) : []),
    [withHeatBins, heatmapPoints],
  )

  return {
    ...markers,
    clusters,
    choropleth,
    heatBins,
    heatmapPoints,
    stormOverlays,
    propagationTick,
  }
}

export default useGlobeViewModels
