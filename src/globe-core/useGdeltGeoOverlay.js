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
        if (!res.ok) {
          throw new Error(
            `Country polygons missing (HTTP ${res.status}). Run: npm run geo:ensure`,
          )
        }
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
        if (!out.length) {
          throw new Error('Country polygons file has no usable features — run: npm run geo:ensure')
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

function friendlyHeatmapError(message) {
  const msg = String(message || '')
  if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
    return 'GDELT GEO API unreachable — rate limit or network; retry in a few minutes'
  }
  if (msg.includes('429') || msg.toLowerCase().includes('limit')) {
    return 'GDELT GEO rate limited — retry in a few minutes'
  }
  return msg || 'GDELT heatmap unavailable'
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
  const [choroplethError, setChoroplethError] = useState(null)
  const [heatmapError, setHeatmapError] = useState(null)

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
    if (!choroOn) {
      setChoroplethError(null)
      return undefined
    }
    if (countryPolygons) return undefined

    let cancelled = false
    loadCountryPolygons()
      .then((polys) => {
        if (!cancelled && mountedRef.current) {
          setCountryPolygons(polys)
          setChoroplethError(null)
        }
      })
      .catch((err) => {
        if (!cancelled && mountedRef.current) {
          setChoroplethError(String(err?.message || err))
        }
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
      setHeatmapError(null)
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
        if (res.heatmapPoints.length > 0) {
          setHeatmapError(res.errors.length ? res.errors.join(' · ') : null)
        } else if (res.errors.length) {
          setHeatmapError(friendlyHeatmapError(res.errors.join(' · ')))
        } else {
          setHeatmapError(null)
        }
      } catch (e) {
        if (!cancelled && mountedRef.current) {
          setHeatmapError(friendlyHeatmapError(e?.message || e))
        }
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

  const choroLoading = choroOn && !countryPolygons && !choroplethError
  const choroplethReady = !choroOn || (Boolean(countryPolygons) && choroplethRows.length > 0)
  const heatmapReady = !heatOn || heatmapPoints.length > 0

  useEffect(() => {
    if (!anyOn) {
      setGdeltGeoBootstrap({
        loading: false,
        heatmapReady: false,
        choroplethReady: false,
        choroplethError: null,
        heatmapError: null,
        error: null,
      })
      return
    }
    setGdeltGeoBootstrap({
      loading: heatLoading || choroLoading,
      heatmapReady,
      choroplethReady,
      choroplethError,
      heatmapError,
      error: null,
    })
  }, [
    anyOn,
    choroOn,
    heatOn,
    choroplethRows.length,
    heatmapPoints.length,
    heatLoading,
    choroLoading,
    choroplethReady,
    heatmapReady,
    choroplethError,
    heatmapError,
    setGdeltGeoBootstrap,
  ])

  const toneRange = useMemo(() => choroplethToneRange(choroplethRows), [choroplethRows])

  return {
    heatmapPoints,
    choroplethRows,
    toneRange,
    loading: heatLoading || choroLoading,
    error: choroplethError || heatmapError,
    choroplethError,
    heatmapError,
  }
}
