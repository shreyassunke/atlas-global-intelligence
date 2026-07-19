/**
 * globe-core/useGlobeLayerEvents — shared globe event filtering for all
 * renderers. Respects Settings → Data Layers and time HUD.
 * Dimension taxonomy is not a user-facing filter — layers + interests define scope.
 */
import { useEffect, useMemo, useState } from 'react'
import { useAtlasStore } from '../store/atlasStore'
import { isLayerToggleOn } from '../core/layerCatalog'
import {
  eventSourceToGlobeDataLayerKey,
  hasPreciseGeolocation,
} from '../core/globeLayers'
import { propagateTle } from '../core/satellitePropagation'
import {
  isWorldZoom,
  MAX_GLOBE_MARKERS,
  MAX_TACTICAL_AIRCRAFT,
  MAX_TACTICAL_SATELLITES,
  MAX_TACTICAL_VESSELS,
} from './lod'
import {
  eventTimestampMs,
  passesAtlasTimeFilter,
  pinnedEventIds,
} from '../core/atlasCycle'

export const SAT_PROPAGATION_INTERVAL_MS = 2000

function isLayerEnabled(dataLayers, layerKey) {
  if (!layerKey) return false
  return isLayerToggleOn(layerKey, dataLayers || {})
}

export function useGlobeLayerEvents() {
  const events = useAtlasStore((s) => s.events)
  const dataLayers = useAtlasStore((s) => s.dataLayers)
  const timeFilter = useAtlasStore((s) => s.timeFilter)
  const globeMode = useAtlasStore((s) => s.globeMode)
  const zoomLevel = useAtlasStore((s) => s.zoomLevel)
  const investigation = useAtlasStore((s) => s.investigation)

  const [propagationTick, setPropagationTick] = useState(0)
  useEffect(() => {
    if (!isLayerToggleOn('satellites', dataLayers || {})) return undefined
    const id = setInterval(() => setPropagationTick((t) => t + 1), SAT_PROPAGATION_INTERVAL_MS)
    return () => clearInterval(id)
  }, [dataLayers?.satellites])

  const globePlottedEvents = useMemo(() => {
    const list = []
    const now = Date.now()
    const pinned = pinnedEventIds(investigation)
    // Declutter rule (lod.js): at world zoom show P1/P2 pins only;
    // zooming in reveals the full P3-inclusive set.
    const worldZoom = isWorldZoom(globeMode, zoomLevel)
    for (const evt of events) {
      if (evt.trackKind === 'aircraft' || evt.trackKind === 'satellite' || evt.trackKind === 'vessel' || evt.trackKind === 'storm') continue
      if (pinned.has(evt.id)) continue
      if (!hasPreciseGeolocation(evt)) continue

      const layerKey = eventSourceToGlobeDataLayerKey(evt)
      if (!layerKey || !isLayerEnabled(dataLayers, layerKey)) continue
      if (!passesAtlasTimeFilter(evt, timeFilter, now)) continue
      if (worldZoom && (evt.severity || 1) <= 1) continue
      list.push(evt)
    }

    if (list.length <= MAX_GLOBE_MARKERS) return list

    const scored = list.map((evt) => {
      const ts = eventTimestampMs(evt)
      const tsForRank = Number.isFinite(ts) ? ts : now
      const ageMin = Math.max(0, (now - tsForRank) / 60_000)
      const recency = Math.exp(-ageMin / 60)
      const sev = (evt.severity || 1) / 5
      return { evt, score: recency * 2 + sev * 3.0 }
    })
    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, MAX_GLOBE_MARKERS).map((s) => s.evt)
  }, [events, dataLayers, timeFilter, globeMode, zoomLevel, investigation])

  const tacticalAircraft = useMemo(() => {
    if (!isLayerEnabled(dataLayers, 'adsb')) return []
    const showMil = isLayerEnabled(dataLayers, 'adsbMilitary')
    return events
      .filter((evt) => {
        if (evt.trackKind !== 'aircraft') return false
        if (evt.isMilitary && !showMil) return false
        return hasPreciseGeolocation(evt)
      })
      .slice(0, MAX_TACTICAL_AIRCRAFT)
  }, [events, dataLayers])

  const tacticalVessels = useMemo(() => {
    if (!isLayerEnabled(dataLayers, 'ais')) return []
    return events
      .filter((evt) => evt.trackKind === 'vessel' && hasPreciseGeolocation(evt))
      .slice(0, MAX_TACTICAL_VESSELS)
  }, [events, dataLayers])

  const stormOverlays = useMemo(() => {
    if (!isLayerEnabled(dataLayers, 'nhcStorms')) return []
    return events.filter((evt) => evt.trackKind === 'storm' && (evt.trackCoords?.length || evt.coneCoords?.length))
  }, [events, dataLayers])

  const tacticalSatellites = useMemo(() => {
    if (!isLayerEnabled(dataLayers, 'satellites')) return []
    const now = new Date()
    const list = events
      .filter((evt) => evt.trackKind === 'satellite' && evt.tleLine1 && evt.tleLine2)
      .map((evt) => {
        const pos = propagateTle(evt.tleLine1, evt.tleLine2, now)
        if (!pos) return null
        return {
          ...evt,
          lat: pos.lat,
          lng: pos.lng,
          altitudeM: pos.altKm * 1000,
        }
      })
      .filter(Boolean)
    const groupRank = { stations: 0, military: 1, 'gps-ops': 2, starlink: 3, active: 4 }
    list.sort((a, b) => {
      const ga = groupRank[a.satelliteGroup] ?? 5
      const gb = groupRank[b.satelliteGroup] ?? 5
      return ga - gb || (a.noradId || 0) - (b.noradId || 0)
    })
    return list.slice(0, MAX_TACTICAL_SATELLITES)
  }, [events, dataLayers?.satellites, propagationTick])

  return {
    globePlottedEvents,
    tacticalAircraft,
    tacticalVessels,
    tacticalSatellites,
    stormOverlays,
    propagationTick,
  }
}

export default useGlobeLayerEvents
