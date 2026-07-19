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

/** Suppress background dismiss immediately after a country / context-menu pick. */
let lastCountryClickMs = 0
/** Map3D often synthesizes gmp-click after contextmenu; keep the menu open. */
const COUNTRY_PICK_SUPPRESS_MS = 450

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
  const hadSelection = Boolean(
    store.selectedMarker || store.selectedEvent || store.selectedPlace || store.countryContextMenu,
  )
  if (store.selectedMarker) store.setSelectedMarker(null)
  if (store.selectedEvent) store.setSelectedEvent(null)
  if (store.selectedPlace) store.setSelectedPlace(null)
  if (store.countryContextMenu) store.closeCountryContextMenu()
  return hadSelection
}

/**
 * Select a country for dossier / place investigation.
 * Enriches centroid async when needed.
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
 * Reverse-geocode cursor lat/lng and patch the open context menu.
 * Opens immediately with country; upgrades title/labels when place resolves.
 */
function resolvePlaceForContextMenu(lat, lng) {
  void import('../utils/googleMaps.js')
    .then(({ reverseGeocodeLatLng }) => reverseGeocodeLatLng(lat, lng))
    .then((place) => {
      useAtlasStore.getState().updateCountryContextMenuPlace(lat, lng, place)
    })
    .catch(() => {
      useAtlasStore.getState().updateCountryContextMenuPlace(lat, lng, null)
    })
}

/**
 * Shared lat/lng → country + place hierarchy used by right-click menu and
 * place-search card actions (economy / news / weather).
 *
 * @param {number} lat
 * @param {number} lng
 * @param {{ label?: string, formattedAddress?: string, choroplethRows?: unknown[] }} [opts]
 * @returns {Promise<{ country: object|null, place: object|null, lat: number, lng: number }>}
 */
export async function resolveLocationInspectContext(lat, lng, opts = {}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { country: null, place: null, lat, lng }
  }

  let country = resolveCountryAtPoint(lat, lng, opts.choroplethRows)
  if (!country?.fips && !country?.name) {
    country = await findCountryAtPointAsync(lat, lng)
  }

  let place = null
  try {
    const { reverseGeocodeLatLng } = await import('../utils/googleMaps.js')
    place = await reverseGeocodeLatLng(lat, lng)
  } catch {
    place = null
  }

  const searched = String(opts.label || '').trim()
  if (place && searched) {
    place = { ...place, label: searched }
  } else if (!place && searched) {
    const { buildPlaceHierarchy } = await import('../utils/placeHierarchy.js')
    place = buildPlaceHierarchy({
      city: searched,
      formattedAddress: opts.formattedAddress || '',
      source: 'places-search',
    })
  }

  return { country: country || null, place, lat, lng }
}

/**
 * Right-click on the globe — open country context menu at cursor.
 * @returns {'menu'|'miss'|'pending'}
 */
export function applyGlobeMapContextMenu({
  lat,
  lng,
  screenX,
  screenY,
  choroplethRows,
} = {}) {
  const store = useAtlasStore.getState()

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    store.closeCountryContextMenu()
    return 'miss'
  }

  // Stamp early so a synthetic Map3D click after contextmenu cannot dismiss
  // the menu (or clear selection) before / while the hit-test finishes.
  lastCountryClickMs = Date.now()

  const country = resolveCountryAtPoint(lat, lng, choroplethRows)
  if (country?.fips || country?.name) {
    store.openCountryContextMenu({
      x: screenX,
      y: screenY,
      lat,
      lng,
      country,
      placeStatus: 'pending',
    })
    resolvePlaceForContextMenu(lat, lng)
    return 'menu'
  }

  if (!getCountryPolygonsSync()) {
    void findCountryAtPointAsync(lat, lng).then((asyncHit) => {
      if (!asyncHit) {
        store.closeCountryContextMenu()
        return
      }
      lastCountryClickMs = Date.now()
      useAtlasStore.getState().openCountryContextMenu({
        x: screenX,
        y: screenY,
        lat,
        lng,
        country: asyncHit,
        placeStatus: 'pending',
      })
      resolvePlaceForContextMenu(lat, lng)
    })
    return 'pending'
  }

  store.closeCountryContextMenu()
  return 'miss'
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
 * Globe background left-click — Street View when enabled; otherwise dismiss
 * selections / context menu. Country investigation is via right-click menu.
 * @returns {'streetview'|'dismiss'|'suppress'}
 */
export function applyGlobeMapClick({ lat, lng, streetViewMode }) {
  const store = useAtlasStore.getState()

  // Right-click opens the context menu and Map3D may also emit gmp-click.
  // Ignore that synthetic click so the menu is not immediately dismissed.
  if (Date.now() - lastCountryClickMs < COUNTRY_PICK_SUPPRESS_MS) {
    return 'suppress'
  }

  store.closeCountryContextMenu()

  if (streetViewMode) {
    store.openStreetView({ lat, lng, source: 'globe' })
    return 'streetview'
  }

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

/** rAF-coalesced cursor lat/lng updates for the mission-clock HUD. */
let pendingCursorCoords = undefined
let cursorCoordsRaf = 0

/**
 * Publish live cursor ground coordinates (throttled to animation frames).
 * Pass null to clear when the pointer leaves the globe.
 */
export function applyCursorCoords(lat, lng) {
  if (lat == null || lng == null) {
    pendingCursorCoords = null
  } else if (Number.isFinite(lat) && Number.isFinite(lng)) {
    pendingCursorCoords = { lat, lng }
  } else {
    pendingCursorCoords = null
  }

  if (cursorCoordsRaf) return
  cursorCoordsRaf = requestAnimationFrame(() => {
    cursorCoordsRaf = 0
    const next = pendingCursorCoords
    pendingCursorCoords = undefined
    if (next === undefined) return

    const store = useAtlasStore.getState()
    const prev = store.cursorCoords
    if (next == null) {
      if (prev != null) store.setCursorCoords(null)
      return
    }
    // Skip store writes when the displayed hundredths of a degree are unchanged.
    if (
      prev &&
      prev.lat.toFixed(2) === next.lat.toFixed(2) &&
      prev.lng.toFixed(2) === next.lng.toFixed(2)
    ) {
      return
    }
    store.setCursorCoords(next)
  })
}

export function clearCursorCoords() {
  applyCursorCoords(null, null)
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
