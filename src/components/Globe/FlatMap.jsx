/**
 * FlatMap — 2D map via MapLibre GL JS. Countries and US states share a uniform dark land fill (no graph coloring).
 */
import { useEffect, useRef, useMemo, useState } from 'react'
import useShareCameraBridge from '../../hooks/useShareCameraBridge'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useAtlasStore } from '../../store/atlasStore'
import { getTimezoneViewCenter } from '../../utils/geo'
import { isMobileDevice } from '../../config/qualityTiers'
import { GIBS_IMAGERY_LAYERS, GIBS_IMAGERY_LAYER_KEYS, gibsMaplibreTiles } from '../../config/gibsBasemap'
import { terminatorGeoJsonLine } from '../../core/solarTerminator'
import {
  useGlobeViewModels,
  applyMarkerClick,
  resolveFlyToTarget,
} from '../../globe-core'
import { showDetectionLabel as getDetectionLabel } from '../../core/detectionLabels'

function buildDetectionLabelFeatures(events, opts) {
  if (!opts.detectionMode) return []
  return events
    .map((e, idx) => {
      const label = getDetectionLabel(e, idx, opts)
      if (!label || e.lat == null || e.lng == null) return null
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [e.lng, e.lat] },
        properties: { label },
      }
    })
    .filter(Boolean)
}

const URL_COUNTRIES =
  'https://d2ad6b4ur7yvpq.cloudfront.net/naturalearth-3.3.0/ne_50m_admin_0_countries.geojson'
const URL_STATES =
  'https://d2ad6b4ur7yvpq.cloudfront.net/naturalearth-3.3.0/ne_50m_admin_1_states_provinces_shp.geojson'

/** Carto OSM labels only (countries → cities); tint baked for dark basemaps */
const BASE_LABEL_TILES = [
  'https://a.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}.png',
  'https://b.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}.png',
  'https://c.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}.png',
  'https://d.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}.png',
]

/** Navy-tinted canvas; aligns with Carto dark_no_labels oceans when tiles load */
const OCEAN_BG = '#0a1426'

/** Landmass fill — near-ocean charcoal so the map reads as a single dark plot with subtle borders */
const LAND_FILL = '#0c1628'

const DEFAULT_ZOOM = 2.5
const MIN_ZOOM = 1.5
const MAX_ZOOM = 12

function regionKeyForCountry(feat) {
  const p = feat.properties || {}
  const a3 = (p.ADM0_A3 || p.adm0_a3 || '').toString()
  if (!a3 || a3 === 'ATA' || a3 === '-99') return null
  return a3
}

function regionKeyForState(feat) {
  const p = feat.properties || {}
  if ((p.iso_a2 || p.ISO_A2 || '').toString().toUpperCase() !== 'US') return null
  const abbr = (p.postal || p.POSTAL || '').toString().toUpperCase()
  if (abbr.length === 2) return `US_${abbr}`
  const iso2 = (p.iso_3166_2 || p.ISO_3166_2 || '').toString().toUpperCase()
  const m = iso2.match(/^US-([A-Z]{2})$/i)
  if (m) return `US_${m[1].toUpperCase()}`
  return null
}

/** Marker view-models (globe-core) → MapLibre circle features. */
function buildEventFeatures(markers) {
  return markers
    .filter((vm) => vm.lat != null && vm.lng != null)
    .map((vm) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [vm.lng, vm.lat] },
      properties: {
        color: vm.color,
        radius_min: Math.max(3, (vm.severity || 1) * 1.5),
        radius_max: Math.max(6, (vm.severity || 1) * 4),
        opacity: vm.raw?.opacity ?? 0.8,
        _isEvent: true,
        _eventData: JSON.stringify(vm.raw),
      },
    }))
}

export default function FlatMap({ onGlobeReady }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const [mapReady, setMapReady] = useState(false)
  const onReadyRef = useRef(onGlobeReady)
  onReadyRef.current = onGlobeReady

  const dataLayers = useAtlasStore((s) => s.dataLayers)
  const sentinel2Scene = useAtlasStore((s) => s.sentinel2Scene)
  const tacticalMode = useAtlasStore((s) => s.tacticalMode)
  const detectionMode = useAtlasStore((s) => s.detectionMode)
  const detectionLabelDensity = useAtlasStore((s) => s.detectionLabelDensity)
  const selectedEvent = useAtlasStore((s) => s.selectedEvent)
  // No field layers on the 2D map — skip GDELT geo overlay fetching entirely.
  const { allMarkers } = useGlobeViewModels({ withFields: false })
  const visibleEvents = useMemo(() => allMarkers.map((vm) => vm.raw), [allMarkers])
  const setZoomLevel = useAtlasStore((s) => s.setZoomLevel)
  const setOnResetView = useAtlasStore((s) => s.setOnResetView)
  const setOnFlyToLocation = useAtlasStore((s) => s.setOnFlyToLocation)

  // Latest markers for the async map-load seed (init effect runs once).
  const markersRef = useRef(allMarkers)
  markersRef.current = allMarkers

  useShareCameraBridge({
    ready: mapReady,
    apply: (cam) => {
      const m = mapRef.current
      if (!m || cam?.lat == null) return
      const z = useAtlasStore.getState().zoomLevel
      const zoom = Number.isFinite(z)
        ? MIN_ZOOM + z * (MAX_ZOOM - MIN_ZOOM)
        : DEFAULT_ZOOM
      m.jumpTo({ center: [cam.lng, cam.lat], zoom })
    },
    report: () => {
      const m = mapRef.current
      if (!m) return null
      const c = m.getCenter()
      const z = m.getZoom()
      return {
        lat: c.lat,
        lng: c.lng,
        rangeM: undefined,
      }
    },
  })

  useEffect(() => {
    const el = containerRef.current
    if (!el) return undefined

    let map = null
    let cancelled = false

    const home = getTimezoneViewCenter()
    const center = [home.lng, home.lat]
    const pr = isMobileDevice() ? 1 : Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 1, 2)

    ;(async () => {
      const [resC, resS] = await Promise.all([fetch(URL_COUNTRIES), fetch(URL_STATES)])
      if (cancelled) return
      if (!resC.ok) throw new Error(`countries ${resC.status}`)
      if (!resS.ok) throw new Error(`states ${resS.status}`)

      const countries = await resC.json()
      const admin1 = await resS.json()
      if (cancelled) return

      const countryFeatures = (countries.features || []).filter((f) => regionKeyForCountry(f) != null)
      const stateFeatures = (admin1.features || []).filter((f) => regionKeyForState(f) != null)

      const landCountriesFc = { type: 'FeatureCollection', features: countryFeatures }
      const landStatesFc = { type: 'FeatureCollection', features: stateFeatures }

      if (cancelled) return

      map = new maplibregl.Map({
        container: el,
        style: {
          version: 8,
          glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
          sources: {},
          layers: [
            {
              id: 'background',
              type: 'background',
              paint: { 'background-color': OCEAN_BG },
            },
          ],
        },
        center,
        zoom: DEFAULT_ZOOM,
        minZoom: MIN_ZOOM,
        maxZoom: MAX_ZOOM,
        maxPitch: 0,
        minPitch: 0,
        pitch: 0,
        pixelRatio: pr,
        attributionControl: false,
        maplibreLogo: false,
        dragRotate: false,
        pitchWithRotate: false,
      })
      mapRef.current = map

      map.on('load', () => {
        if (cancelled) return
        map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')

        map.addSource('countries', { type: 'geojson', data: landCountriesFc })
        map.addSource('states', { type: 'geojson', data: landStatesFc })
        map.addSource('events', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
        const dl0 = useAtlasStore.getState().dataLayers || {}
        let anyGibs = false
        for (const key of GIBS_IMAGERY_LAYER_KEYS) {
          const cfg = GIBS_IMAGERY_LAYERS[key]
          const srcId = `gibs-${key}`
          map.addSource(srcId, {
            type: 'raster',
            tiles: gibsMaplibreTiles(key),
            tileSize: 256,
            attribution: cfg.attribution,
            maxzoom: key === 'gibsTrueColor' || key === 'gibsFires' ? 9 : 6,
          })
          const visible = dl0[key] === true
          if (visible) anyGibs = true
          map.addLayer({
            id: srcId,
            type: 'raster',
            source: srcId,
            layout: { visibility: visible ? 'visible' : 'none' },
            paint: { 'raster-opacity': cfg.opacity, 'raster-fade-duration': 200 },
          })
        }

        map.addSource('terminator', {
          type: 'geojson',
          data: terminatorGeoJsonLine(),
        })
        const termOn = dl0.terminator !== false
        map.addLayer({
          id: 'terminator-line',
          type: 'line',
          source: 'terminator',
          layout: { visibility: termOn ? 'visible' : 'none' },
          paint: {
            'line-color': 'rgba(120, 220, 255, 0.75)',
            'line-width': 2,
            'line-blur': 0.5,
          },
        })
        map.addSource('basemap-labels', {
          type: 'raster',
          tiles: BASE_LABEL_TILES,
          tileSize: 256,
          attribution:
            '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a> © CARTO',
        })

        map.addLayer({
          id: 'countries-fill',
          type: 'fill',
          source: 'countries',
          paint: {
            'fill-color': LAND_FILL,
            'fill-opacity': anyGibs ? 0.12 : 0.92,
            'fill-antialias': true,
          },
        })
        map.addLayer({
          id: 'countries-line-back',
          type: 'line',
          source: 'countries',
          paint: {
            'line-color': '#040814',
            'line-opacity': 0.92,
            'line-blur': 0.25,
            'line-width': ['interpolate', ['linear'], ['zoom'], 1, 2.4, 4, 4.5, 10, 7],
          },
        })
        map.addLayer({
          id: 'countries-line',
          type: 'line',
          source: 'countries',
          paint: {
            'line-color': 'rgba(236, 242, 255, 0.78)',
            'line-opacity': 1,
            'line-blur': 0,
            'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.85, 4, 1.35, 10, 2.35],
          },
        })
        map.addLayer({
          id: 'states-fill',
          type: 'fill',
          source: 'states',
          minzoom: 3,
          paint: {
            'fill-color': LAND_FILL,
            'fill-opacity': anyGibs ? 0.12 : 0.92,
            'fill-antialias': true,
          },
        })
        map.addLayer({
          id: 'states-line-back',
          type: 'line',
          source: 'states',
          minzoom: 3,
          paint: {
            'line-color': '#03060f',
            'line-opacity': 0.88,
            'line-blur': 0.2,
            'line-width': ['interpolate', ['linear'], ['zoom'], 3, 2.2, 6, 4.2, 10, 6],
          },
        })
        map.addLayer({
          id: 'states-line',
          type: 'line',
          source: 'states',
          minzoom: 3,
          paint: {
            'line-color': 'rgba(232, 238, 252, 0.72)',
            'line-opacity': 1,
            'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.75, 7, 1.35, 11, 2.2],
          },
        })
        map.addLayer({
          id: 'basemap-labels',
          type: 'raster',
          source: 'basemap-labels',
          paint: {
            'raster-opacity': 1,
            'raster-fade-duration': 150,
          },
        })
        map.addLayer({
          id: 'events-circle',
          type: 'circle',
          source: 'events',
          paint: {
            'circle-color': ['get', 'color'],
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['zoom'],
              2,
              ['get', 'radius_min'],
              10,
              ['get', 'radius_max'],
            ],
            'circle-opacity': ['get', 'opacity'],
            'circle-stroke-color': 'rgba(255,255,255,0.3)',
            'circle-stroke-width': 0.8,
          },
        })
        map.addSource('events-detection', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        })
        map.addLayer({
          id: 'events-detection-labels',
          type: 'symbol',
          source: 'events-detection',
          layout: {
            visibility: 'none',
            'text-field': ['get', 'label'],
            'text-size': 10,
            'text-offset': [0, -1.4],
            'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
            'text-allow-overlap': true,
          },
          paint: {
            'text-color': '#88ffaa',
            'text-halo-color': 'rgba(0,0,0,0.85)',
            'text-halo-width': 1.2,
          },
        })

        const evSrc = map.getSource('events')
        if (evSrc && typeof evSrc.setData === 'function') {
          evSrc.setData({
            type: 'FeatureCollection',
            features: buildEventFeatures(markersRef.current),
          })
        }

        setOnResetView(() => {
          if (!mapRef.current) return
          mapRef.current.flyTo({ center, zoom: DEFAULT_ZOOM, duration: 1200 })
        })

        setOnFlyToLocation((target) => {
          const m = mapRef.current
          if (!m) return
          const t = resolveFlyToTarget(target)
          if (!t) return
          let zoom = 12
          if (t.spanDeg != null) {
            if (t.spanDeg > 8) zoom = 5
            else if (t.spanDeg > 2) zoom = 8
            else if (t.spanDeg > 0.5) zoom = 10
            else zoom = 13
          }
          m.flyTo({ center: [t.lng, t.lat], zoom, duration: 1400 })
        })

        setMapReady(true)
        onReadyRef.current?.()
      })

      const syncZoom = () => {
        if (!mapRef.current) return
        const z = mapRef.current.getZoom()
        setZoomLevel(Math.max(0, Math.min(1, (z - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM))))
      }
      map.on('zoom', syncZoom)
      syncZoom()

      map.on('click', 'events-circle', (e) => {
        if (!e.features?.length) return
        const props = e.features[0].properties
        if (props?._eventData) {
          try {
            applyMarkerClick(JSON.parse(props._eventData))
          } catch {
            /* ignore */
          }
        }
      })
      map.on('mouseenter', 'events-circle', () => {
        if (mapRef.current) mapRef.current.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', 'events-circle', () => {
        if (mapRef.current) mapRef.current.getCanvas().style.cursor = ''
      })
    })().catch((err) => {
      console.error('[FlatMap] init failed', err)
    })

    return () => {
      cancelled = true
      setMapReady(false)
      setOnResetView(null)
      setOnFlyToLocation(null)
      mapRef.current = null
      if (map) {
        map.remove()
        map = null
      }
    }
  }, [setOnResetView, setOnFlyToLocation, setZoomLevel])

  useEffect(() => {
    const m = mapRef.current
    if (!m) return
    const src = m.getSource('events')
    if (src && typeof src.setData === 'function') {
      src.setData({
        type: 'FeatureCollection',
        features: buildEventFeatures(allMarkers),
      })
    }
  }, [allMarkers])

  useEffect(() => {
    const m = mapRef.current
    if (!m || !mapReady) return
    const src = m.getSource('events-detection')
    if (!src || typeof src.setData !== 'function') return
    const detOpts = {
      detectionMode,
      detectionLabelDensity,
      selectedEventId: selectedEvent?.id,
    }
    src.setData({
      type: 'FeatureCollection',
      features: buildDetectionLabelFeatures(visibleEvents, detOpts),
    })
    if (m.getLayer('events-detection-labels')) {
      m.setLayoutProperty(
        'events-detection-labels',
        'visibility',
        detectionMode ? 'visible' : 'none',
      )
    }
    if (m.getLayer('events-circle')) {
      m.setPaintProperty(
        'events-circle',
        'circle-stroke-width',
        detectionMode ? 1.6 : 0.8,
      )
      m.setPaintProperty(
        'events-circle',
        'circle-stroke-color',
        detectionMode ? 'rgba(136, 255, 170, 0.55)' : 'rgba(255,255,255,0.3)',
      )
    }
  }, [visibleEvents, detectionMode, detectionLabelDensity, selectedEvent?.id, mapReady])

  useEffect(() => {
    const m = mapRef.current
    if (!m) return
    let anyGibs = false
    for (const key of GIBS_IMAGERY_LAYER_KEYS) {
      const layerId = `gibs-${key}`
      if (!m.getLayer(layerId)) continue
      const on = dataLayers?.[key] === true
      if (on) anyGibs = true
      m.setLayoutProperty(layerId, 'visibility', on ? 'visible' : 'none')
    }
    if (m.getLayer('terminator-line')) {
      const termOn = dataLayers?.terminator !== false
      m.setLayoutProperty('terminator-line', 'visibility', termOn ? 'visible' : 'none')
    }
    if (m.getLayer('countries-fill')) {
      m.setPaintProperty('countries-fill', 'fill-opacity', anyGibs ? 0.12 : 0.92)
    }
    if (m.getLayer('states-fill')) {
      m.setPaintProperty('states-fill', 'fill-opacity', anyGibs ? 0.12 : 0.92)
    }
  }, [dataLayers])

  useEffect(() => {
    const m = mapRef.current
    if (!m?.getSource('terminator')) return
    const tick = () => {
      const src = m.getSource('terminator')
      if (src && typeof src.setData === 'function') {
        src.setData(terminatorGeoJsonLine())
      }
    }
    tick()
    const id = setInterval(tick, 60_000)
    return () => clearInterval(id)
  }, [])

  /** Phase 6 — on-demand Sentinel-2 thumbnail overlay (Copernicus STAC bbox) */
  useEffect(() => {
    const m = mapRef.current
    if (!m || !mapReady) return

    const removeSentinel = () => {
      if (m.getLayer('sentinel2-scene')) m.removeLayer('sentinel2-scene')
      if (m.getSource('sentinel2-scene')) m.removeSource('sentinel2-scene')
    }

    const scene = sentinel2Scene
    if (!scene?.thumbnailUrl || !Array.isArray(scene.bbox) || scene.bbox.length < 4) {
      removeSentinel()
      return
    }

    const [west, south, east, north] = scene.bbox
    const coordinates = [
      [west, north],
      [east, north],
      [east, south],
      [west, south],
    ]

    if (m.getSource('sentinel2-scene')) {
      removeSentinel()
    }

    m.addSource('sentinel2-scene', {
      type: 'image',
      url: scene.thumbnailUrl,
      coordinates,
    })
    m.addLayer({
      id: 'sentinel2-scene',
      type: 'raster',
      source: 'sentinel2-scene',
      paint: { 'raster-opacity': 0.88, 'raster-fade-duration': 300 },
    })
  }, [sentinel2Scene, mapReady])

  return (
    <div
      ref={containerRef}
      className={`fixed inset-0 z-0 flatmap-container${tacticalMode ? ' atlas-tactical-mode' : ''}`}
    />
  )
}
