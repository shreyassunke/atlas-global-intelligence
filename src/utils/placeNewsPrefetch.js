/**
 * Intent-based TOP NEWS prefetch (moderate eagerness).
 * Prefers GDELT GEO near when lat/lng are known; otherwise warms DOC compound.
 */

import { timespanFromTimeFilter } from '../services/gdelt/analyticsService'
import { prefetchDocArticles } from '../services/gdelt/analyticsService'
import { fetchGeoLocalArticles, DEFAULT_LOCAL_RADIUS_KM } from '../services/gdelt/localGeoNews'
import { placeNewsPrefetchQuery } from './placeHierarchy'
import { useAtlasStore } from '../store/atlasStore'

/** @type {AbortController | null} */
let activeController = null
/** @type {string | null} */
let lastKey = null

/**
 * Prefetch local headlines for a place. No-ops in low-bandwidth mode.
 */
export function prefetchPlaceTopNews({ place, country, lat, lng } = {}) {
  const store = useAtlasStore.getState()
  if (store.lowBandwidthMode) return null

  const timespan = timespanFromTimeFilter(store.timeFilter)
  const haveCoords = Number.isFinite(lat) && Number.isFinite(lng)
  const step = placeNewsPrefetchQuery(place, country)
  const key = haveCoords
    ? `geo:${Number(lat).toFixed(3)},${Number(lng).toFixed(3)}|${timespan}`
    : step
      ? `${step.query}|${timespan}`
      : null
  if (!key) return null

  if (key === lastKey && activeController && !activeController.signal.aborted) {
    return activeController
  }

  if (activeController && lastKey && lastKey !== key) {
    try {
      activeController.abort()
    } catch {
      /* ignore */
    }
  }

  const controller = new AbortController()
  activeController = controller
  lastKey = key

  const run = haveCoords
    ? fetchGeoLocalArticles(lat, lng, {
        timespan,
        radiusKm: DEFAULT_LOCAL_RADIUS_KM,
        maxArticles: 14,
        signal: controller.signal,
      })
    : prefetchDocArticles(step.query, timespan, {
        maxrecords: 14,
        signal: controller.signal,
        priority: 'interactive',
      })

  void Promise.resolve(run).finally(() => {
    if (activeController === controller) {
      activeController = null
    }
  })

  return controller
}

/** Soft clear — does not abort in-flight (lets cache warm for panel open). */
export function abortPlaceTopNewsPrefetch() {
  lastKey = null
  activeController = null
}
