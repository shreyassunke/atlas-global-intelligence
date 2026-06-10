/**
 * globe-core/useGdeltGeoOverlay — GDELT field-layer data for the globe
 * renderers.
 *
 * The country choropleth is built locally — in-worker CAMEO country
 * aggregates (`gdeltCountryAggregates` in the store) joined to the bundled
 * Natural Earth admin-0 polygons by FIPS 10-4. No GEO API calls.
 *
 * The opt-in heatmap still polls the GDELT GEO PointHeatmap endpoint (the
 * only remaining GEO API consumer here).
 *
 * Pass `{ enabled: false }` from renderers that draw no field layers
 * (FlatMap) to skip polygon loading and heatmap polling entirely.
 *
 * Returns `{ heatmapPoints, choroplethRows, toneRange, loading, error }`.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAtlasStore } from '../store/atlasStore'
import {
  buildGdeltGeoQueryFromDimensions,
  choroplethToneRange,
  fetchGdeltGeoOverlaySequential,
  geoTimespanFromTimeFilter,
} from '../services/gdelt/geoService'

const HEATMAP_REFRESH_MS = 15 * 60 * 1000
const HEATMAP_TOGGLE_DEBOUNCE_MS = 300

/** Same bundled Natural Earth asset used by `src/map/mapColoring.js` (GEO_URLS.country). */
const COUNTRY_POLYGONS_URL = '/geo/ne_110m_admin_0_countries.geojson'

/** Module-level cache — the polygon mesh is static and shared across renderer remounts. */
let countryPolygonsPromise = null

function loadCountryPolygons() {
  if (!countryPolygonsPromise) {
    countryPolygonsPromise = fetch(COUNTRY_POLYGONS_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`Country polygons HTTP ${res.status}`)
        return res.json()
      })
      .then((geojson) => {
        const out = []
        for (const f of geojson?.features || []) {
          const g = f?.geometry
          if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) continue
          const props = f.properties || {}
          const fips = String(props.FIPS_10 || '').trim().toUpperCase()
          if (!fips || fips === '-99') continue
          out.push({
            geometry: g,
            fips,
            iso: String(props.ISO_A2_EH || props.ISO_A2 || ''),
            name: String(props.NAME || props.ADMIN || ''),
          })
        }
        return out
      })
      .catch((err) => {
        countryPolygonsPromise = null
        throw err
      })
  }
  return countryPolygonsPromise
}

export default function useGdeltGeoOverlay({ enabled = true } = {}) {
  const activeDimensions = useAtlasStore((s) => s.activeDimensions)
  const timeFilter = useAtlasStore((s) => s.timeFilter)
  const dataLayers = useAtlasStore((s) => s.dataLayers)
  const countryAggregates = useAtlasStore((s) => s.gdeltCountryAggregates)
  const setGdeltGeoBootstrap = useAtlasStore((s) => s.setGdeltGeoBootstrap)

  const heatOn = enabled && dataLayers?.gdeltHeatmap === true
  const choroOn = enabled && dataLayers?.gdeltChoropleth === true
  const anyOn = heatOn || choroOn

  const [heatmapPoints, setHeatmapPoints] = useState([])
  const [countryPolygons, setCountryPolygons] = useState(null)
  const [heatLoading, setHeatLoading] = useState(false)
  const [error, setError] = useState(null)

  const abortRef = useRef(null)
  const timerRef = useRef(null)
  const debounceRef = useRef(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // ── Choropleth: bundled polygons + in-worker CAMEO country aggregates ──

  useEffect(() => {
    if (!choroOn || countryPolygons) return
    let cancelled = false
    loadCountryPolygons()
      .then((polys) => {
        if (!cancelled && mountedRef.current) setCountryPolygons(polys)
      })
      .catch((err) => {
        if (!cancelled && mountedRef.current) setError(String(err?.message || err))
      })
    return () => {
      cancelled = true
    }
  }, [choroOn, countryPolygons])

  const choroplethRows = useMemo(() => {
    if (!choroOn || !countryPolygons || !countryAggregates?.byFips) return []
    const rows = []
    for (const country of countryPolygons) {
      const agg = countryAggregates.byFips[country.fips]
      if (!agg || !agg.events) continue
      rows.push({
        geometry: country.geometry,
        tone: Number.isFinite(agg.avgTone) ? agg.avgTone : 0,
        count: agg.events,
        name: country.name,
        iso: country.iso,
        props: {
          fips: country.fips,
          avgGoldstein: agg.avgGoldstein,
          quad: agg.quad,
          exportTsMs: countryAggregates.exportTsMs,
        },
      })
    }
    return rows
  }, [choroOn, countryPolygons, countryAggregates])

  // ── Heatmap: GDELT GEO PointHeatmap (opt-in) ──

  const query = useMemo(
    () => buildGdeltGeoQueryFromDimensions(activeDimensions),
    [activeDimensions],
  )
  const timespan = useMemo(() => geoTimespanFromTimeFilter(timeFilter), [timeFilter])

  useEffect(() => {
    if (!heatOn) {
      setHeatmapPoints([])
      setHeatLoading(false)
      clearTimeout(debounceRef.current)
      return undefined
    }

    let cancelled = false
    let controller = null

    async function run() {
      controller = new AbortController()
      abortRef.current?.abort?.()
      abortRef.current = controller
      setHeatLoading(true)
      try {
        const res = await fetchGdeltGeoOverlaySequential({
          query,
          timespan,
          wantHeatmap: true,
          wantPolygons: false,
          signal: controller.signal,
        })
        if (cancelled || !mountedRef.current) return
        setHeatmapPoints(res.heatmapPoints)
        if (res.errors.length) setError(res.errors.join(' · '))
      } catch (e) {
        if (!cancelled && mountedRef.current) setError(String(e?.message || e))
      } finally {
        if (!cancelled && mountedRef.current) setHeatLoading(false)
      }
    }

    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      run()
      clearInterval(timerRef.current)
      timerRef.current = setInterval(run, HEATMAP_REFRESH_MS)
    }, HEATMAP_TOGGLE_DEBOUNCE_MS)

    return () => {
      cancelled = true
      clearTimeout(debounceRef.current)
      controller?.abort()
      clearInterval(timerRef.current)
    }
  }, [heatOn, query, timespan])

  // ── Bootstrap readiness ──

  useEffect(() => {
    if (!anyOn) {
      setGdeltGeoBootstrap({
        loading: false,
        heatmapReady: false,
        choroplethReady: false,
        error: null,
      })
      return
    }
    const choroplethReady = !choroOn || choroplethRows.length > 0
    const heatmapReady = !heatOn || heatmapPoints.length > 0
    setGdeltGeoBootstrap({
      loading: heatLoading || (choroOn && !choroplethReady),
      heatmapReady,
      choroplethReady,
      error,
    })
  }, [anyOn, choroOn, heatOn, choroplethRows.length, heatmapPoints.length, heatLoading, error, setGdeltGeoBootstrap])

  const toneRange = useMemo(() => choroplethToneRange(choroplethRows), [choroplethRows])

  return {
    heatmapPoints,
    choroplethRows,
    toneRange,
    loading: heatLoading || (choroOn && choroplethRows.length === 0 && !error),
    error,
  }
}
