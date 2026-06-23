/**
 * globe-core/interactions — renderer-agnostic interaction intents.
 */
import booleanPointInPolygon from '@turf/boolean-point-in-polygon'
import { point } from '@turf/helpers'
import { useAtlasStore } from '../store/atlasStore'
import {
  findCountry,
  findCountryAtPoint,
  findCountryAtPointAsync,
  getCountryPolygonsSync,
  loadCountryIndex,
  loadCountryPolygons,
} from '../services/countryIndex'

/** Preload polygons so first country click is instant. */
loadCountryPolygons().catch(() => {})

/** Suppress background dismiss immediately after a country polygon click. */
let lastCountryClickMs = 0

export function markerClickIntent(evt) {
  const src = (evt?.source || '').toLowerCase()
  return src.includes('gdelt') ? 'news' : 'event'
}

export function applyMarkerClick(evt) {
  const store = useAtlasStore.getState()
  if (markerClickIntent(evt) === 'news') {
    store.setSelectedMarker(evt)
    store.setSelectedEvent(null)
  } else {
    store.setSelectedEvent(evt)
    store.setSelectedMarker(null)
  }
}

export function applyBackgroundClick() {
  const store = useAtlasStore.getState()
  const hadSelection = Boolean(store.selectedMarker || store.selectedEvent || store.selectedPlace)
  if (store.selectedMarker) store.setSelectedMarker(null)
  if (store.selectedEvent) store.setSelectedEvent(null)
  if (store.selectedPlace) store.setSelectedPlace(null)
  return hadSelection
}

/**
 * Select a country for macro indicators + optional dossier.
 * Updates HUD immediately; enriches centroid async when needed.
 */
export function applyCountryClick({ fips, iso, name, lat, lng } = {}, options = {}) {
  const { openWorkbench = false } = options
  if (!fips && !name) return

  lastCountryClickMs = Date.now()
  const store = useAtlasStore.getState()

  const immediate = {
    fips: fips || '',
    iso: iso || '',
    name: name || iso || fips || 'Unknown',
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
  }

  store.setSelectedPlace(immediate)
  store.openDossier(immediate, { openWorkbench })

  if (Number.isFinite(immediate.lat) && Number.isFinite(immediate.lng) && immediate.iso) return

  loadCountryIndex()
    .then((index) => {
      const hit = findCountry(index, { fips, text: name || iso, lat, lng })
      if (!hit) return
      const enriched = {
        fips: hit.fips,
        iso: hit.iso,
        name: hit.name,
        lat: hit.lat,
        lng: hit.lng,
      }
      store.setSelectedPlace(enriched)
      store.openDossier(enriched, { openWorkbench })
    })
    .catch(() => { /* keep optimistic selection */ })
}

/**
 * Hit-test against choropleth view-models (legacy fallback).
 */
export function findChoroplethCountryAtPoint(lat, lng, choroplethRows) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !choroplethRows?.length) return null
  const pt = point([lng, lat])
  for (const row of choroplethRows) {
    if (!row?.geometry) continue
    try {
      if (booleanPointInPolygon(pt, row.geometry)) {
        return {
          fips: row.props?.fips,
          iso: row.iso,
          name: row.name,
        }
      }
    } catch {
      /* skip malformed geometry */
    }
  }
  return null
}

/**
 * Resolve country at lat/lng — uses full Natural Earth polygons (all countries).
 * @returns {{ fips, iso, name, lat, lng } | null}
 */
export function resolveCountryAtPoint(lat, lng, choroplethRows) {
  const cached = getCountryPolygonsSync()
  if (cached) {
    const hit = findCountryAtPoint(lat, lng, cached)
    if (hit) return hit
  }
  return findChoroplethCountryAtPoint(lat, lng, choroplethRows)
}

/**
 * Globe background click — country selection on any renderer; Street View when enabled.
 * @returns {'streetview'|'country'|'dismiss'|'pending'}
 */
export function applyGlobeMapClick({ lat, lng, choroplethRows, streetViewMode }) {
  const store = useAtlasStore.getState()

  if (streetViewMode) {
    store.openStreetView({ lat, lng, source: 'globe' })
    return 'streetview'
  }

  const country = resolveCountryAtPoint(lat, lng, choroplethRows)
  if (country?.fips || country?.name) {
    applyCountryClick(country)
    return 'country'
  }

  if (!getCountryPolygonsSync()) {
    void findCountryAtPointAsync(lat, lng).then((asyncHit) => {
      if (asyncHit) applyCountryClick(asyncHit)
    })
    if (Date.now() - lastCountryClickMs < 400) return 'country'
    return 'pending'
  }

  if (Date.now() - lastCountryClickMs < 400) return 'country'

  applyBackgroundClick()
  return 'dismiss'
}

export function applyMarkerHover(evt, screenX, screenY) {
  const store = useAtlasStore.getState()
  if (!evt) {
    store.setHoveredMarker(null)
    return
  }
  store.setHoveredMarker({
    ...evt,
    _screenX: screenX ?? (typeof window !== 'undefined' ? window.innerWidth / 2 : 0),
    _screenY: screenY ?? (typeof window !== 'undefined' ? window.innerHeight / 2 : 0),
    _isEvent: true,
  })
}

export function resolveFlyToTarget(target) {
  if (!target) return null
  const box = target.bbox || target.viewport
  const lat = Number.isFinite(target.lat)
    ? target.lat
    : box
      ? (box.south + box.north) / 2
      : NaN
  const lng = Number.isFinite(target.lng)
    ? target.lng
    : box
      ? (box.west + box.east) / 2
      : NaN
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null

  let latSpanDeg = null
  let lngSpanDeg = null
  if (
    box &&
    Number.isFinite(box.north) && Number.isFinite(box.south) &&
    Number.isFinite(box.east) && Number.isFinite(box.west)
  ) {
    latSpanDeg = Math.abs(box.north - box.south)
    lngSpanDeg = Math.abs(box.east - box.west)
  }
  const spanDeg = latSpanDeg != null ? Math.max(latSpanDeg, lngSpanDeg) : null
  return { lat, lng, latSpanDeg, lngSpanDeg, spanDeg }
}
