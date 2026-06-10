import { useEffect, useRef } from 'react'
import { useAtlasStore } from '../store/atlasStore'
import { deserializeAtlasUrlState, writeAtlasUrlState } from '../core/urlState'
import { DIMENSION_KEYS } from '../core/eventSchema'
import { loadCountryIndex, findCountry } from '../services/countryIndex'

const SYNC_DEBOUNCE_MS = 450
const CAMERA_DEBOUNCE_MS = 800

function pickUrlSyncState(state) {
  return {
    activeDimensions: state.activeDimensions,
    priorityFilter: state.priorityFilter,
    timeFilter: state.timeFilter,
    dataLayers: state.dataLayers,
    globeMode: state.globeMode,
    tacticalMode: state.tacticalMode,
    detectionMode: state.detectionMode,
    detectionLabelDensity: state.detectionLabelDensity,
    shareCamera: state.shareCamera,
    zoomLevel: state.zoomLevel,
    selectedEventId: state.selectedEvent?.id ?? null,
    dossierCode: state.ui.workbench === 'dossier' && state.dossier
      ? (state.dossier.iso || state.dossier.fips || state.dossier.name)
      : null,
  }
}

/**
 * Hydrate store from URL on load and keep the address bar in sync with view state.
 */
export function useAtlasUrlSync(enabled = true) {
  const hydratedRef = useRef(false)
  const skipWriteRef = useRef(true)
  const timerRef = useRef(null)
  const camTimerRef = useRef(null)

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return

    const params = new URLSearchParams(window.location.search)
    if ([...params.keys()].length === 0) {
      hydratedRef.current = true
      skipWriteRef.current = false
      return
    }

    const partial = deserializeAtlasUrlState(params, useAtlasStore.getState().dataLayers)
    const store = useAtlasStore.getState()

    if (partial.priorityFilter) store.setPriorityFilter(partial.priorityFilter)
    if (partial.timeFilter) store.setTimeFilter(partial.timeFilter)

    if (partial.activeDimensions) {
      const target = partial.activeDimensions
      const current = store.activeDimensions
      for (const d of DIMENSION_KEYS) {
        const inTarget = target.has(d)
        const inCurrent = current.has(d)
        if (inTarget !== inCurrent) store.toggleDimension(d)
      }
    }

    if (partial.dataLayers) {
      for (const [key, val] of Object.entries(partial.dataLayers)) {
        if (store.dataLayers[key] !== val) store.setDataLayer(key, val)
      }
    }

    if (partial.globeMode) store.setGlobeMode(partial.globeMode)
    if (partial.tacticalMode && !store.tacticalMode) store.toggleTacticalMode()
    if (partial.detectionMode && !store.detectionMode) store.toggleDetectionMode()
    if (partial.detectionLabelDensity) store.setDetectionLabelDensity(partial.detectionLabelDensity)
    if (partial.shareCamera) store.setShareCamera(partial.shareCamera)
    if (typeof partial.zoomLevel === 'number') store.setZoomLevel(partial.zoomLevel)
    if (partial.selectedEventId) store.setPendingUrlEventId(partial.selectedEventId)

    // ?dossier= — resolve ISO2/FIPS/name to a country once the index loads
    if (partial.dossierCode) {
      loadCountryIndex()
        .then((index) => {
          const hit = findCountry(index, { text: partial.dossierCode })
          if (hit) useAtlasStore.getState().openDossier(hit)
        })
        .catch(() => { /* dossier deep link is best-effort */ })
    }

    hydratedRef.current = true
    skipWriteRef.current = false
  }, [enabled])

  // Apply event selection once the event exists in the map
  useEffect(() => {
    if (!enabled) return undefined

    const trySelect = () => {
      const { pendingUrlEventId, eventMap, setSelectedEvent, setPendingUrlEventId } = useAtlasStore.getState()
      if (!pendingUrlEventId) return
      const evt = eventMap[pendingUrlEventId]
      if (evt) {
        setSelectedEvent(evt)
        setPendingUrlEventId(null)
      }
    }

    trySelect()
    return useAtlasStore.subscribe((state, prev) => {
      if (state.pendingUrlEventId && state.eventMap !== prev.eventMap) trySelect()
    })
  }, [enabled])

  // Debounced URL writes on store changes
  useEffect(() => {
    if (!enabled) return undefined

    const scheduleWrite = () => {
      if (skipWriteRef.current) return
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        writeAtlasUrlState(pickUrlSyncState(useAtlasStore.getState()))
      }, SYNC_DEBOUNCE_MS)
    }

    const unsub = useAtlasStore.subscribe((state, prev) => {
      if (!hydratedRef.current) return
      const a = pickUrlSyncState(state)
      const b = pickUrlSyncState(prev)
      if (JSON.stringify(a) !== JSON.stringify(b)) scheduleWrite()
    })

    return () => {
      clearTimeout(timerRef.current)
      unsub()
    }
  }, [enabled])

  return {
    reportCamera: (camera) => {
      if (!enabled || skipWriteRef.current) return
      clearTimeout(camTimerRef.current)
      camTimerRef.current = setTimeout(() => {
        useAtlasStore.getState().setShareCamera(camera)
      }, CAMERA_DEBOUNCE_MS)
    },
  }
}

export default useAtlasUrlSync
