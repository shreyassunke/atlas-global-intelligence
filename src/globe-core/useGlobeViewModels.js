/**
 * globe-core/useGlobeViewModels — single entry point for renderers.
 */
import { useEffect, useMemo, useState } from 'react'
import { useAtlasStore } from '../store/atlasStore'
import useGlobeLayerEvents from './useGlobeLayerEvents'
import useGdeltGeoOverlay from './useGdeltGeoOverlay'
import { warmMarkerIconCache } from '../core/markerIconCache'
import { buildMarkerViewModels, layerRevealMultiplier } from './viewModels'
import { buildClusterViewModels } from './clusters'
import { buildChoroplethViewModels } from './choropleth'
import { buildHeatBins } from './heatBins'
import { buildReferenceMarkerVMs } from '../core/referenceCatalog'
import { buildDerivedMarkerVMs } from './derivedMarkers'
import { isLayerToggleOn } from '../core/layerCatalog'
import { buildCorrelationArcs } from '../core/globeLayers'

export function useGlobeViewModels({
  withClusters = false,
  withHeatBins = false,
  withFields = true,
} = {}) {
  const layerRevealAt = useAtlasStore((s) => s.layerRevealAt)
  const dataLayers = useAtlasStore((s) => s.dataLayers)
  const anomalies = useAtlasStore((s) => s.anomalies)
  const eventMap = useAtlasStore((s) => s.eventMap)
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

  useEffect(() => {
    warmMarkerIconCache()
  }, [])

  const { heatmapPoints, choroplethRows, toneRange } = useGdeltGeoOverlay({ enabled: withFields })

  const referenceMarkers = useMemo(
    () => buildReferenceMarkerVMs({
      enabledCategories: {
        nuclear: isLayerToggleOn('referenceNuclear', dataLayers),
        chokepoints: isLayerToggleOn('referenceChokepoints', dataLayers),
      },
    }),
    [dataLayers],
  )

  const derivedMarkers = useMemo(
    () => buildDerivedMarkerVMs({
      anomalies,
      eventMap,
      enabled: isLayerToggleOn('derivedSignals', dataLayers),
    }),
    [anomalies, eventMap, dataLayers],
  )

  const correlationArcs = useMemo(
    () => (isLayerToggleOn('derivedSignals', dataLayers)
      ? buildCorrelationArcs(anomalies, eventMap)
      : []),
    [anomalies, eventMap, dataLayers],
  )

  const markers = useMemo(
    () => buildMarkerViewModels({
      globePlottedEvents,
      tacticalAircraft,
      tacticalVessels,
      tacticalSatellites,
      stormOverlays,
      referenceMarkers,
      derivedMarkers,
      layerRevealAt,
    }),
    [
      globePlottedEvents,
      tacticalAircraft,
      tacticalVessels,
      tacticalSatellites,
      stormOverlays,
      referenceMarkers,
      derivedMarkers,
      layerRevealAt,
      revealTick,
    ],
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
    correlationArcs,
    propagationTick,
  }
}

export default useGlobeViewModels
