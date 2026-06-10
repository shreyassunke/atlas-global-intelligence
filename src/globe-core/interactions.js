/**
 * globe-core/interactions — renderer-agnostic interaction intents.
 *
 * Hover, click, and fly-to semantics live here so all three renderers
 * behave identically; adapters only translate camera framing into their
 * native units (altitude / range / zoom).
 */
import { useAtlasStore } from '../store/atlasStore'
import { loadCountryIndex, findCountry } from '../services/countryIndex'

/**
 * What clicking a marker should open.
 * GDELT-derived signals open as NewsCards (narrative evidence); everything
 * else (authoritative feeds + tactical tracks) opens the intelligence
 * event panel.
 * @returns {'news'|'event'}
 */
export function markerClickIntent(evt) {
  const src = (evt?.source || '').toLowerCase()
  return src.includes('gdelt') ? 'news' : 'event'
}

/** Apply a marker click to the store (Inspector routing). */
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

/**
 * Apply a background (non-marker) click: dismiss any open selection.
 * @returns {boolean} true if a selection was dismissed
 */
export function applyBackgroundClick() {
  const store = useAtlasStore.getState()
  const hadSelection = Boolean(store.selectedMarker || store.selectedEvent)
  if (store.selectedMarker) store.setSelectedMarker(null)
  if (store.selectedEvent) store.setSelectedEvent(null)
  return hadSelection
}

/**
 * Phase 5 — clicking a choropleth country opens its Dossier.
 * Accepts whatever identity the renderer's polygon datum carries
 * (`fips` / `iso` / `name`); the country index fills in the centroid.
 */
export function applyCountryClick({ fips, iso, name } = {}) {
  if (!fips && !name) return
  const store = useAtlasStore.getState()
  loadCountryIndex()
    .then((index) => {
      const hit = findCountry(index, { fips, text: name || iso })
      store.openDossier(hit || { fips, iso, name })
    })
    .catch(() => {
      // No centroid available — open with what we have (fly-to disabled).
      store.openDossier({ fips, iso, name })
    })
}

/**
 * Apply marker hover to the store. Pass `null` to clear.
 * `screenX/screenY` position the HoverLabel tooltip.
 */
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

/**
 * Resolve a place-search / share fly-to target into a renderer-agnostic
 * framing: center plus angular spans (degrees) from the viewport bbox.
 * Renderers convert spans into altitude (Globe.GL), camera range (Map3D),
 * or zoom (MapLibre).
 *
 * @param {{ lat?: number, lng?: number, viewport?: object, bbox?: object }} target
 * @returns {{ lat: number, lng: number, latSpanDeg: number|null, lngSpanDeg: number|null, spanDeg: number|null } | null}
 */
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
