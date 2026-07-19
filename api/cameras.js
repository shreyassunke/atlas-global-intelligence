/**
 * GET /api/cameras
 * Aggregate public CCTV / webcam feeds for the ATLAS Cameras layer.
 *
 * Providers:
 *   - Windy Webcams (requires WINDY_API_KEY) — global scenic / city cams
 *   - TfL JamCams (optional TFL_APP_KEY) — London traffic CCTV
 *   - Caltrans CWWP2 (no key) — California highway CCTV
 *
 * Response: { cameras: Camera[], meta: { providers, count, fetchedAt } }
 */

import { CORS_HEADERS, envFirst, jsonResponse, optionsResponse, upstreamFetch } from './_lib/proxyCommon.js'

export const config = {
  runtime: 'edge',
}

const CACHE_MS = 240_000
const MAX_CAMERAS = 500

/** @type {{ body: string, ts: number } | null} */
let cache = null

/** Windy continent codes for free-tier sampling (≤50 each, offset ≤1000). */
const WINDY_CONTINENTS = ['EU', 'NA', 'AS', 'SA', 'AF', 'OC']

/** Caltrans districts with dense public CCTV. */
const CALTRANS_DISTRICTS = ['04', '07', '08', '11', '12']

/**
 * @param {object} cam
 * @returns {object|null}
 */
function normalizeCamera(cam) {
  const lat = Number(cam.lat)
  const lng = Number(cam.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (lat === 0 && lng === 0) return null
  const id = String(cam.id || '').trim()
  if (!id) return null
  return {
    id,
    provider: cam.provider,
    title: String(cam.title || 'Camera').slice(0, 160),
    lat,
    lng,
    country: cam.country || '',
    city: cam.city || '',
    imageUrl: cam.imageUrl || '',
    playerUrl: cam.playerUrl || '',
    pageUrl: cam.pageUrl || '',
    streamUrl: cam.streamUrl || '',
  }
}

async function fetchWindy(apiKey) {
  if (!apiKey) {
    return { cameras: [], status: 'skipped', detail: 'WINDY_API_KEY not set' }
  }

  const cameras = []
  const errors = []

  await Promise.all(
    WINDY_CONTINENTS.map(async (continent) => {
      try {
        const url =
          `https://api.windy.com/webcams/api/v3/webcams` +
          `?continents=${continent}&limit=50&offset=0&include=images,location,player,urls`
        const res = await upstreamFetch(url, {
          headers: {
            'x-windy-api-key': apiKey,
            Accept: 'application/json',
          },
          timeoutMs: 18_000,
        })
        if (!res.ok) {
          errors.push(`${continent}: HTTP ${res.status}`)
          return
        }
        const data = await res.json()
        const list = Array.isArray(data?.webcams) ? data.webcams : []
        for (const w of list) {
          if (w?.status && w.status !== 'active') continue
          const loc = w.location || {}
          const images = w.images?.current || {}
          const player = w.player || {}
          const urls = w.urls || {}
          const cam = normalizeCamera({
            id: `windy-${w.webcamId}`,
            provider: 'windy',
            title: w.title || loc.city || `Webcam ${w.webcamId}`,
            lat: loc.latitude,
            lng: loc.longitude,
            country: loc.country_code || loc.country || '',
            city: loc.city || '',
            imageUrl: images.preview || images.thumbnail || images.icon || '',
            playerUrl: player.live || player.day || '',
            pageUrl: urls.detail || w.url?.current?.desktop || '',
          })
          if (cam) cameras.push(cam)
        }
      } catch (err) {
        errors.push(`${continent}: ${err.message || 'fetch failed'}`)
      }
    }),
  )

  return {
    cameras,
    status: cameras.length ? 'ok' : errors.length ? 'error' : 'empty',
    detail: errors.length ? errors.slice(0, 3).join('; ') : undefined,
    count: cameras.length,
  }
}

async function fetchTfl(appKey) {
  try {
    const url = appKey
      ? `https://api.tfl.gov.uk/Place/Type/JamCam?app_key=${encodeURIComponent(appKey)}`
      : 'https://api.tfl.gov.uk/Place/Type/JamCam'
    const res = await upstreamFetch(url, {
      headers: { Accept: 'application/json' },
      timeoutMs: 18_000,
    })
    if (!res.ok) {
      return { cameras: [], status: 'error', detail: `HTTP ${res.status}` }
    }
    const places = await res.json()
    if (!Array.isArray(places)) {
      return { cameras: [], status: 'empty' }
    }

    const cameras = []
    for (const place of places) {
      const props = Array.isArray(place.additionalProperties) ? place.additionalProperties : []
      const byKey = Object.fromEntries(
        props.filter((p) => p?.key).map((p) => [p.key, p.value]),
      )
      const imageUrl = byKey.imageUrl || ''
      const videoUrl = byKey.videoUrl || ''
      if (!imageUrl && !videoUrl) continue
      const cam = normalizeCamera({
        id: `tfl-${place.id || place.commonName || cameras.length}`,
        provider: 'tfl',
        title: place.commonName || place.id || 'TfL JamCam',
        lat: place.lat,
        lng: place.lon,
        country: 'GB',
        city: 'London',
        imageUrl,
        streamUrl: videoUrl,
        pageUrl: 'https://tfl.gov.uk/traffic/status/',
      })
      if (cam) cameras.push(cam)
      if (cameras.length >= 180) break
    }

    return { cameras, status: cameras.length ? 'ok' : 'empty', count: cameras.length }
  } catch (err) {
    return { cameras: [], status: 'error', detail: err.message || 'fetch failed' }
  }
}

async function fetchCaltrans() {
  const cameras = []
  const errors = []
  const perDistrict = Math.ceil(120 / CALTRANS_DISTRICTS.length)

  await Promise.all(
    CALTRANS_DISTRICTS.map(async (district) => {
      try {
        const url = `https://cwwp2.dot.ca.gov/data/d${Number(district)}/cctv/cctvStatusD${district}.json`
        const res = await upstreamFetch(url, {
          headers: { Accept: 'application/json' },
          timeoutMs: 18_000,
        })
        if (!res.ok) {
          errors.push(`D${district}: HTTP ${res.status}`)
          return
        }
        const data = await res.json()
        const rows = Array.isArray(data?.data) ? data.data : []
        let taken = 0
        for (const row of rows) {
          const cctv = row?.cctv
          if (!cctv || String(cctv.inService).toLowerCase() !== 'true') continue
          const loc = cctv.location || {}
          const image = cctv.imageData?.static || {}
          const imageUrl = image.currentImageURL || ''
          const streamUrl =
            cctv.imageData?.streamingVideoURL &&
            cctv.imageData.streamingVideoURL !== 'Not Reported'
              ? cctv.imageData.streamingVideoURL
              : ''
          if (!imageUrl && !streamUrl) continue
          const lat = Number(loc.latitude)
          const lng = Number(loc.longitude)
          const cam = normalizeCamera({
            id: `caltrans-d${district}-${cctv.index || taken}`,
            provider: 'caltrans',
            title:
              loc.locationName ||
              cctv.imageData?.imageDescription ||
              `Caltrans D${district} cam`,
            lat,
            lng,
            country: 'US',
            city: loc.county || 'California',
            imageUrl,
            streamUrl,
            pageUrl: 'https://cwwp2.dot.ca.gov/closed-circuit-television-cameras.html',
          })
          if (cam) {
            cameras.push(cam)
            taken += 1
          }
          if (taken >= perDistrict) break
        }
      } catch (err) {
        errors.push(`D${district}: ${err.message || 'fetch failed'}`)
      }
    }),
  )

  return {
    cameras,
    status: cameras.length ? 'ok' : errors.length ? 'error' : 'empty',
    detail: errors.length ? errors.slice(0, 3).join('; ') : undefined,
    count: cameras.length,
  }
}

/**
 * Round-robin merge so one dense region (London/CA) does not drown global Windy pins.
 * @param {object[][]} groups
 * @param {number} max
 */
function interleave(groups, max) {
  const out = []
  const queues = groups.map((g) => [...g])
  let progressed = true
  while (out.length < max && progressed) {
    progressed = false
    for (const q of queues) {
      if (out.length >= max) break
      if (!q.length) continue
      out.push(q.shift())
      progressed = true
    }
  }
  return out
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return optionsResponse()
  if (req.method !== 'GET') {
    return jsonResponse(405, { error: 'Method not allowed' })
  }

  if (cache && Date.now() - cache.ts < CACHE_MS) {
    return new Response(cache.body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        ...CORS_HEADERS,
        'Cache-Control': 'public, max-age=120, stale-while-revalidate=600',
        'X-Atlas-Cache': 'hit',
      },
    })
  }

  const windyKey = envFirst('WINDY_API_KEY', 'VITE_WINDY_API_KEY')
  const tflKey = envFirst('TFL_APP_KEY', 'VITE_TFL_APP_KEY')

  const [windy, tfl, caltrans] = await Promise.all([
    fetchWindy(windyKey),
    fetchTfl(tflKey),
    fetchCaltrans(),
  ])

  const cameras = interleave(
    [windy.cameras, tfl.cameras, caltrans.cameras],
    MAX_CAMERAS,
  )

  const payload = {
    cameras,
    meta: {
      count: cameras.length,
      fetchedAt: new Date().toISOString(),
      providers: {
        windy: {
          status: windy.status,
          count: windy.count ?? windy.cameras.length,
          detail: windy.detail,
          keyConfigured: Boolean(windyKey),
        },
        tfl: {
          status: tfl.status,
          count: tfl.count ?? tfl.cameras.length,
          detail: tfl.detail,
        },
        caltrans: {
          status: caltrans.status,
          count: caltrans.count ?? caltrans.cameras.length,
          detail: caltrans.detail,
        },
      },
    },
  }

  const body = JSON.stringify(payload)
  cache = { body, ts: Date.now() }

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...CORS_HEADERS,
      'Cache-Control': 'public, max-age=120, stale-while-revalidate=600',
      'X-Atlas-Cache': 'miss',
    },
  })
}
