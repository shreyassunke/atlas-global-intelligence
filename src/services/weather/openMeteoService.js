/**
 * Point weather via Open-Meteo (no API key).
 * https://open-meteo.com/en/docs
 */

const WMO_LABELS = {
  0: 'Clear',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Rime fog',
  51: 'Light drizzle',
  53: 'Drizzle',
  55: 'Heavy drizzle',
  61: 'Light rain',
  63: 'Rain',
  65: 'Heavy rain',
  71: 'Light snow',
  73: 'Snow',
  75: 'Heavy snow',
  80: 'Rain showers',
  81: 'Rain showers',
  82: 'Violent rain showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with hail',
  99: 'Thunderstorm with hail',
}

export function wmoLabel(code) {
  const n = Number(code)
  if (!Number.isFinite(n)) return 'Unknown'
  return WMO_LABELS[n] || `Code ${n}`
}

/**
 * @param {{ lat: number, lng: number, signal?: AbortSignal }} opts
 * @returns {Promise<{
 *   lat: number,
 *   lng: number,
 *   temperatureC: number | null,
 *   windKmh: number | null,
 *   weatherCode: number | null,
 *   weatherLabel: string,
 *   humidity: number | null,
 *   apparentC: number | null,
 *   precipMm: number | null,
 *   observedAt: string | null,
 * }>}
 */
export async function fetchLocalWeather({ lat, lng, signal } = {}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error('lat/lng required')
  }

  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    current: [
      'temperature_2m',
      'relative_humidity_2m',
      'apparent_temperature',
      'precipitation',
      'weather_code',
      'wind_speed_10m',
    ].join(','),
    wind_speed_unit: 'kmh',
    timezone: 'auto',
  })

  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal })
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`)
  const json = await res.json()
  const cur = json.current || {}

  return {
    lat,
    lng,
    temperatureC: Number.isFinite(cur.temperature_2m) ? cur.temperature_2m : null,
    windKmh: Number.isFinite(cur.wind_speed_10m) ? cur.wind_speed_10m : null,
    weatherCode: Number.isFinite(cur.weather_code) ? cur.weather_code : null,
    weatherLabel: wmoLabel(cur.weather_code),
    humidity: Number.isFinite(cur.relative_humidity_2m) ? cur.relative_humidity_2m : null,
    apparentC: Number.isFinite(cur.apparent_temperature) ? cur.apparent_temperature : null,
    precipMm: Number.isFinite(cur.precipitation) ? cur.precipitation : null,
    observedAt: cur.time || null,
  }
}
