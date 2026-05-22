import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAtlasStore } from '../store/atlasStore'
import { eventSourceToGlobeDataLayerKey } from '../core/globeLayers'
import { propagateTle } from '../core/satellitePropagation'

const TIME_FILTER_MAX_AGE_MS = {
  live: 2 * 3600_000,
  '24h': 24 * 3600_000,
  '7d': 7 * 24 * 3600_000,
  '30d': 30 * 24 * 3600_000,
}

const DEFAULT_DIMENSIONS = ['safety', 'governance', 'economy', 'people', 'environment', 'narrative']
const MAX_GLOBE_MARKERS = 2500
const MAX_TACTICAL_AIRCRAFT = 500
const MAX_TACTICAL_VESSELS = 400
const MAX_TACTICAL_SATELLITES = 400
export const SAT_PROPAGATION_INTERVAL_MS = 2000

function effectiveDimensions(activeDimensions) {
  if (!activeDimensions || activeDimensions.size === 0) {
    return new Set(DEFAULT_DIMENSIONS)
  }
  return activeDimensions
}

function isLayerEnabled(dataLayers, layerKey) {
  if (!layerKey) return false
  return dataLayers?.[layerKey] !== false
}

function passesTimeFilter(evt, timeFilter) {
  const maxAgeMs = TIME_FILTER_MAX_AGE_MS[timeFilter] ?? TIME_FILTER_MAX_AGE_MS.live
  const now = Date.now()
  const tsMs = evt.timestamp ? new Date(evt.timestamp).getTime() : NaN
  const fMs = evt.fetchedAt ? new Date(evt.fetchedAt).getTime() : NaN
  const refMs = Math.max(
    Number.isFinite(tsMs) ? tsMs : -Infinity,
    Number.isFinite(fMs) ? fMs : -Infinity,
  )
  if (Number.isFinite(refMs) && refMs > -Infinity && now - refMs > maxAgeMs) return false
  return true
}

function passesPriorityFilter(evt, priorityFilter) {
  if (priorityFilter === 'p1' && evt.priority !== 'p1') return false
  if (priorityFilter === 'p1p2' && evt.priority === 'p3') return false
  return true
}

/**
 * Shared globe event filtering for Google Map3D and Globe.GL.
 * Respects Settings → Data Layers, dimension filters, time/priority HUD tiers.
 */
export function useGlobeLayerEvents() {
  const events = useAtlasStore((s) => s.events)
  const dataLayers = useAtlasStore((s) => s.dataLayers)
  const activeDimensions = useAtlasStore((s) => s.activeDimensions)
  const priorityFilter = useAtlasStore((s) => s.priorityFilter)
  const timeFilter = useAtlasStore((s) => s.timeFilter)

  const [propagationTick, setPropagationTick] = useState(0)
  useEffect(() => {
    if (dataLayers?.satellites === false) return undefined
    const id = setInterval(() => setPropagationTick((t) => t + 1), SAT_PROPAGATION_INTERVAL_MS)
    return () => clearInterval(id)
  }, [dataLayers?.satellites])

  const dims = useMemo(() => effectiveDimensions(activeDimensions), [activeDimensions])

  const globePlottedEvents = useMemo(() => {
    const list = []
    const now = Date.now()
    for (const evt of events) {
      if (evt.trackKind === 'aircraft' || evt.trackKind === 'satellite' || evt.trackKind === 'vessel' || evt.trackKind === 'storm') continue
      if (evt.lat == null || evt.lng == null) continue
      if (evt.lat === 0 && evt.lng === 0 && evt.latApproximate) continue

      const layerKey = eventSourceToGlobeDataLayerKey(evt.source)
      if (!layerKey || !isLayerEnabled(dataLayers, layerKey)) continue
      if (!dims.has(evt.dimension)) continue
      if (!passesPriorityFilter(evt, priorityFilter)) continue
      if (!passesTimeFilter(evt, timeFilter)) continue
      list.push(evt)
    }

    if (list.length <= MAX_GLOBE_MARKERS) return list

    const priorityRank = { p1: 3, p2: 2, p3: 1 }
    const scored = list.map((evt) => {
      const tsRaw = evt.timestamp ? new Date(evt.timestamp).getTime() : NaN
      const fAt = evt.fetchedAt ? new Date(evt.fetchedAt).getTime() : NaN
      const ts = Math.max(
        Number.isFinite(tsRaw) ? tsRaw : -Infinity,
        Number.isFinite(fAt) ? fAt : -Infinity,
      )
      const tsForRank = Number.isFinite(ts) && ts > -Infinity ? ts : now
      const ageMin = Math.max(0, (now - tsForRank) / 60_000)
      const recency = Math.exp(-ageMin / 60)
      const sev = (evt.severity || 1) / 5
      const pri = priorityRank[evt.priority] || 1
      return { evt, score: recency * 2 + sev * 1.5 + pri }
    })
    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, MAX_GLOBE_MARKERS).map((s) => s.evt)
  }, [events, dataLayers, dims, priorityFilter, timeFilter])

  const tacticalAircraft = useMemo(() => {
    if (!isLayerEnabled(dataLayers, 'adsb')) return []
    const showMil = isLayerEnabled(dataLayers, 'adsbMilitary')
    return events
      .filter((evt) => {
        if (evt.trackKind !== 'aircraft') return false
        if (evt.isMilitary && !showMil) return false
        return evt.lat != null && evt.lng != null
      })
      .slice(0, MAX_TACTICAL_AIRCRAFT)
  }, [events, dataLayers])

  const tacticalVessels = useMemo(() => {
    if (!isLayerEnabled(dataLayers, 'ais')) return []
    return events
      .filter((evt) => evt.trackKind === 'vessel' && evt.lat != null && evt.lng != null)
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

  const filterFlatMapEvents = useCallback(() => {
    const out = []
    for (const evt of events) {
      if (evt.lat == null || evt.lng == null) continue
      if (evt.lat === 0 && evt.lng === 0 && evt.latApproximate) continue

      if (evt.trackKind === 'aircraft') {
        if (!isLayerEnabled(dataLayers, 'adsb')) continue
        if (evt.isMilitary && !isLayerEnabled(dataLayers, 'adsbMilitary')) continue
        out.push(evt)
        continue
      }
      if (evt.trackKind === 'satellite') {
        if (!isLayerEnabled(dataLayers, 'satellites')) continue
        if (!evt.tleLine1 || !evt.tleLine2) continue
        const pos = propagateTle(evt.tleLine1, evt.tleLine2, new Date())
        if (!pos) continue
        out.push({ ...evt, lat: pos.lat, lng: pos.lng })
        continue
      }
      if (evt.trackKind === 'vessel') {
        if (!isLayerEnabled(dataLayers, 'ais')) continue
        out.push(evt)
        continue
      }
      if (evt.trackKind === 'storm') {
        if (!isLayerEnabled(dataLayers, 'nhcStorms')) continue
        if (evt.lat != null && evt.lng != null) out.push(evt)
        continue
      }

      const layerKey = eventSourceToGlobeDataLayerKey(evt.source)
      if (!layerKey || !isLayerEnabled(dataLayers, layerKey)) continue
      if (!dims.has(evt.dimension)) continue
      if (!passesPriorityFilter(evt, priorityFilter)) continue
      if (!passesTimeFilter(evt, timeFilter)) continue
      out.push(evt)
    }
    return out
  }, [events, dataLayers, dims, priorityFilter, timeFilter])

  return {
    globePlottedEvents,
    tacticalAircraft,
    tacticalVessels,
    tacticalSatellites,
    stormOverlays,
    propagationTick,
    filterFlatMapEvents,
  }
}

export default useGlobeLayerEvents
