/**
 * FlatMap — 2D map via MapLibre GL JS.
 * Carto Dark Matter greyscale basemap with subtle admin borders (no graph coloring).
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
  applyCursorCoords,
  clearCursorCoords,
  applyGlobeMapClick,
  applyGlobeMapContextMenu,
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

/** Carto Dark Matter — dark greyscale basemap (no labels; labels layered above admin lines) */
const BASE_TILES = [
  'https://a.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png',
  'https://b.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png',
  'https://c.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png',
  'https://d.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png',
]

/** Carto Dark Matter labels only (countries → cities) */
const BASE_LABEL_TILES = [
  'https://a.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}.png',
  'https://b.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}.png',
  'https://c.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}.png',
  'https://d.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}.png',
]

/** Match app --bg so the canvas and HUD header read the same as other globe modes */
const OCEAN_BG = '#030712'

/** Soft charcoal land tint — Dark Matter tiles carry roads/terrain detail */
const LAND_FILL = '#1a2332'
const LAND_FILL_OPACITY = 0.28
const LAND_FILL_OPACITY_GIBS = 0.1

/** Admin borders — cool grey hairlines on dark basemap */
const BORDER_COLOR = 'rgba(180, 190, 210, 0.42)'
const BORDER_HALO = 'rgba(3, 7, 18, 0.75)'

const DEFAULT_ZOOM = 2.5
const MIN_ZOOM = 1.5
const MAX_ZOOM = 12

function regionKeyForCountry(feat) {
  const p = feat.properties || {}
  const a3 = (p.ADM0_A3 || p.adm0_a3 || '').toString()
  if (!a3 || a3 === 'ATA' || a3 === '-99') return null
  return a3
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
      const resC = await fetch(URL_COUNTRIES)
      if (cancelled) return
      if (!resC.ok) throw new Error(`countries ${resC.status}`)

      const countries = await resC.json()
      if (cancelled) return

      const countryFeatures = (countries.features || []).filter((f) => regionKeyForCountry(f) != null)
      const landCountriesFc = { type: 'FeatureCollection', features: countryFeatures }

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

        map.addSource('basemap', {
          type: 'raster',
          tiles: BASE_TILES,
          tileSize: 256,
          attribution:
            '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a> © CARTO',
        })
        map.addSource('countries', { type: 'geojson', data: landCountriesFc })
        map.addSource('events', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
        const dl0 = useAtlasStore.getState().dataLayers || {}
        let anyGibs = false
        for (const key of GIBS_IMAGERY_LAYER_KEYS) {
          if (dl0[key] === true) anyGibs = true
        }

        map.addLayer({
          id: 'basemap',
          type: 'raster',
          source: 'basemap',
          paint: {
            'raster-opacity': anyGibs ? 0.35 : 1,
            'raster-fade-duration': 150,
          },
        })

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
            'line-color': 'rgba(120, 180, 220, 0.55)',
            'line-width': 1.5,
            'line-dasharray': [2.5, 2.5],
            'line-blur': 0.3,
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
            'fill-opacity': anyGibs ? LAND_FILL_OPACITY_GIBS : LAND_FILL_OPACITY,
            'fill-antialias': true,
          },
        })
        map.addLayer({
          id: 'countries-line-back',
          type: 'line',
          source: 'countries',
          paint: {
            'line-color': BORDER_HALO,
            'line-opacity': 0.9,
            'line-blur': 0.15,
            'line-width': ['interpolate', ['linear'], ['zoom'], 1, 1.6, 4, 2.6, 10, 4],
          },
        })
        map.addLayer({
          id: 'countries-line',
          type: 'line',
          source: 'countries',
          paint: {
            'line-color': BORDER_COLOR,
            'line-opacity': 1,
            'line-blur': 0,
            'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.55, 4, 0.9, 10, 1.5],
          },
        })
        map.addLayer({
          id: 'basemap-labels',
          type: 'raster',
          source: 'basemap-labels',
          paint: {
            'raster-opacity': 0.92,
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
            'circle-stroke-color': 'rgba(255,255,255,0.28)',
            'circle-stroke-width': 0.9,
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

      map.on('click', (e) => {
        const hits = map.queryRenderedFeatures(e.point, { layers: ['events-circle'] })
        if (hits.length) return
        applyGlobeMapClick({ lat: e.lngLat.lat, lng: e.lngLat.lng })
      })

      map.on('contextmenu', (e) => {
        e.preventDefault()
        const canvas = map.getCanvas()
        const rect = canvas?.getBoundingClientRect?.()
        applyGlobeMapContextMenu({
          lat: e.lngLat.lat,
          lng: e.lngLat.lng,
          screenX: rect ? rect.left + e.point.x : e.point.x,
          screenY: rect ? rect.top + e.point.y : e.point.y,
        })
      })

      map.on('mousemove', (e) => {
        applyCursorCoords(e.lngLat.lat, e.lngLat.lng)
      })
      map.on('mouseout', () => clearCursorCoords())

      map.on('mouseenter', 'countries-fill', () => {
        if (mapRef.current) mapRef.current.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', 'countries-fill', () => {
        if (mapRef.current) mapRef.current.getCanvas().style.cursor = ''
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
      clearCursorCoords()
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
        detectionMode ? 'rgba(136, 255, 170, 0.55)' : 'rgba(255,255,255,0.28)',
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
    if (m.getLayer('basemap')) {
      m.setPaintProperty('basemap', 'raster-opacity', anyGibs ? 0.35 : 1)
    }
    if (m.getLayer('countries-fill')) {
      m.setPaintProperty(
        'countries-fill',
        'fill-opacity',
        anyGibs ? LAND_FILL_OPACITY_GIBS : LAND_FILL_OPACITY,
      )
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
