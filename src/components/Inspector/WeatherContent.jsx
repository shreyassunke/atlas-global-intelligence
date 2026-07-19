/**
 * Inspector — local weather at the right-click cursor lat/lng.
 */
import { useEffect, useMemo, useState } from 'react'
import { MapPin } from 'lucide-react'
import { fetchLocalWeather } from '../../services/weather/openMeteoService.js'
import { placeDisplayLabel } from '../../utils/placeHierarchy'
import { cn } from '../../lib/utils'
import {
  InspectorWindowControls,
  useInspectorWindow,
} from './InspectorWindowContext'

const TEMP_UNIT_KEY = 'atlas_weather_temp_unit'

function formatCoord(n, axis) {
  if (!Number.isFinite(n)) return '—'
  const hemi = axis === 'lat' ? (n >= 0 ? 'N' : 'S') : (n >= 0 ? 'E' : 'W')
  return `${Math.abs(n).toFixed(3)}°${hemi}`
}

function cToF(c) {
  return (c * 9) / 5 + 32
}

function readStoredTempUnit() {
  try {
    const v = localStorage.getItem(TEMP_UNIT_KEY)
    return v === 'f' ? 'f' : 'c'
  } catch {
    return 'c'
  }
}

function Stat({ label, value, unit }) {
  return (
    <div className="rounded-lg border border-line bg-surface/80 px-3 py-2.5">
      <p className="font-data text-[9px] uppercase tracking-[0.1em] text-faint">{label}</p>
      <p className="mt-0.5 font-data text-[18px] font-semibold leading-none text-text">
        {value}
        {unit ? <span className="ml-1 text-[11px] font-normal text-faint">{unit}</span> : null}
      </p>
    </div>
  )
}

function TempUnitToggle({ unit, onChange }) {
  return (
    <div
      className="inline-flex shrink-0 rounded-md border border-line bg-surface p-0.5"
      role="group"
      aria-label="Temperature unit"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {[
        { id: 'c', label: '°C' },
        { id: 'f', label: '°F' },
      ].map((opt) => (
        <button
          key={opt.id}
          type="button"
          aria-pressed={unit === opt.id}
          className={cn(
            'cursor-pointer rounded px-2 py-1 font-data text-[10px] font-semibold leading-none transition-colors',
            unit === opt.id
              ? 'bg-accent-dim text-accent'
              : 'text-muted hover:text-text',
          )}
          onClick={() => onChange(opt.id)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

export default function WeatherContent({ payload, onClose }) {
  const country = payload?.country
  const place = payload?.place
  const lat = payload?.lat
  const lng = payload?.lng
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [tempUnit, setTempUnit] = useState(readStoredTempUnit)

  const title = useMemo(
    () => placeDisplayLabel(place, country),
    [place, country?.name],
  )

  const setUnit = (next) => {
    setTempUnit(next)
    try {
      localStorage.setItem(TEMP_UNIT_KEY, next)
    } catch {
      /* ignore */
    }
  }

  const formatTemp = (celsius) => {
    if (celsius == null || !Number.isFinite(celsius)) return '—'
    const value = tempUnit === 'f' ? cToF(celsius) : celsius
    return value.toFixed(1)
  }
  const tempSuffix = tempUnit === 'f' ? '°F' : '°C'

  useEffect(() => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      setLoading(false)
      setError('Missing cursor coordinates')
      return undefined
    }
    let cancelled = false
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    fetchLocalWeather({ lat, lng, signal: controller.signal })
      .then((row) => {
        if (!cancelled) {
          setData(row)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled && err?.name !== 'AbortError') {
          setError('Could not load weather')
          setData(null)
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [lat, lng])

  const windowApi = useInspectorWindow()

  return (
    <div className="relative flex h-full flex-col">
      <header
        className={cn(
          'flex items-start justify-between gap-3 border-b border-line px-4 py-3',
          windowApi && 'inspector-panel__drag-header',
        )}
        onPointerDown={windowApi?.onDragHandlePointerDown}
      >
        <div className="min-w-0">
          <p className="font-data text-[9px] uppercase tracking-[0.14em] text-faint">
            Weather
          </p>
          <h3 className="mt-0.5 truncate font-ui text-[15px] font-semibold text-text">
            {title}
          </h3>
          <p className="mt-1 inline-flex items-center gap-1 font-data text-[9px] text-faint">
            <MapPin size={10} aria-hidden />
            {formatCoord(lat, 'lat')} · {formatCoord(lng, 'lng')}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <TempUnitToggle unit={tempUnit} onChange={setUnit} />
          <InspectorWindowControls />
        </div>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {loading && (
          <p className="px-1 font-data text-[11px] text-faint">Fetching Open-Meteo…</p>
        )}
        {!loading && error && (
          <p className="px-1 font-data text-[11px] text-p2">{error}</p>
        )}
        {!loading && data && (
          <>
            <div className="rounded-lg border border-accent-border bg-accent-dim/40 px-3 py-3">
              <p className="font-data text-[9px] uppercase tracking-[0.12em] text-accent">Conditions</p>
              <p className="mt-1 font-ui text-[22px] font-semibold leading-none text-text">
                {data.weatherLabel}
              </p>
              {data.observedAt && (
                <p className="mt-1.5 font-data text-[9px] text-faint">Observed {data.observedAt}</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Stat
                label="Temperature"
                value={formatTemp(data.temperatureC)}
                unit={tempSuffix}
              />
              <Stat
                label="Feels like"
                value={formatTemp(data.apparentC)}
                unit={tempSuffix}
              />
              <Stat
                label="Wind"
                value={data.windKmh != null ? data.windKmh.toFixed(0) : '—'}
                unit="km/h"
              />
              <Stat
                label="Humidity"
                value={data.humidity != null ? Math.round(data.humidity) : '—'}
                unit="%"
              />
              <Stat
                label="Precipitation"
                value={data.precipMm != null ? data.precipMm.toFixed(1) : '—'}
                unit="mm"
              />
            </div>
            <p className="px-1 font-data text-[9px] leading-relaxed text-faint">
              Point forecast at the cursor — not the country centroid.
              Source: Open-Meteo.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
