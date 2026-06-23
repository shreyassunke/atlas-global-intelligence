/**
 * GET /api/aisstream-ships
 * Server-side AISStream.io WebSocket collector with L3 in-memory cache.
 *
 * Env: AISSTREAM_API_KEY (server-only)
 * Query: ?regions=hormuz,suez (optional filter by chokepoint name slug)
 */

import { AIS_CHOKEPOINT_BBOXES, CHOKEPOINTS } from '../src/core/chokepoints.js'

export const config = {
  maxDuration: 30,
}

const COLLECT_MS = 6_000
const WS_OPEN_TIMEOUT_MS = 8_000
const CACHE_MS = 30_000

/** @type {{ vessels: object[], ts: number, bboxCount: number } | null} */
let cache = null

async function readWsPayload(data) {
  if (typeof data === 'string') return data
  if (data instanceof Blob) return data.text()
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data)
  return String(data)
}

/**
 * @param {string} apiKey
 * @param {[number, number][][]} boundingBoxes
 */
function collectAisVessels(apiKey, boundingBoxes) {
  return new Promise((resolve, reject) => {
    const vessels = new Map()
    let settled = false
    let ws = null

    const finish = (result, err) => {
      if (settled) return
      settled = true
      clearTimeout(collectTimer)
      clearTimeout(openTimer)
      try { ws?.close() } catch { /* ignore */ }
      if (err) reject(err)
      else resolve(result)
    }

    const collectTimer = setTimeout(() => {
      finish([...vessels.values()])
    }, COLLECT_MS)

    const openTimer = setTimeout(() => {
      if (vessels.size > 0) finish([...vessels.values()])
      else finish([], new Error('AISStream connection timed out'))
    }, WS_OPEN_TIMEOUT_MS)

    try {
      ws = new WebSocket('wss://stream.aisstream.io/v0/stream')
    } catch (err) {
      finish([], err)
      return
    }

    ws.addEventListener('open', () => {
      clearTimeout(openTimer)
      ws.send(JSON.stringify({
        APIKey: apiKey,
        BoundingBoxes: boundingBoxes,
        FilterMessageTypes: ['PositionReport'],
      }))
    })

    ws.addEventListener('message', (evt) => {
      void (async () => {
        try {
          const msg = JSON.parse(await readWsPayload(evt.data))
          if (msg?.error) {
            finish([], new Error(String(msg.error)))
            return
          }
          const pr = msg?.Message?.PositionReport
          if (!pr) return
          const meta = msg.Metadata || {}
          const mmsi = String(pr.UserID || meta.MMSI || meta.ShipMMSI || '')
          const lat = meta.Latitude ?? pr.Latitude
          const lng = meta.Longitude ?? pr.Longitude
          if (!mmsi || lat == null || lng == null) return
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
          vessels.set(mmsi, {
            mmsi,
            lat,
            lng,
            cog: pr.Cog != null ? pr.Cog : meta.Cog,
            sog: pr.Sog != null ? pr.Sog : meta.Sog,
            shipName: (meta.ShipName || '').trim(),
          })
        } catch { /* ignore malformed */ }
      })()
    })

    ws.addEventListener('error', () => {
      if (vessels.size > 0) finish([...vessels.values()])
      else finish([], new Error('AISStream WebSocket error — check AISSTREAM_API_KEY'))
    })

    ws.addEventListener('close', () => {
      finish([...vessels.values()])
    })
  })
}

function jsonResponse(body, { stale = false, status = 200 } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': stale
        ? 'public, max-age=15, stale-while-revalidate=120'
        : 'public, max-age=30, stale-while-revalidate=120',
      ...(stale ? { 'X-Atlas-Stale': 'ais-cache' } : {}),
    },
  })
}

/**
 * @param {URL} url
 * @returns {[number, number][][]}
 */
function resolveBoundingBoxes(url) {
  const regionParam = url.searchParams.get('regions')?.trim()
  if (!regionParam) return AIS_CHOKEPOINT_BBOXES

  const slugs = regionParam.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  const matched = CHOKEPOINTS.filter((cp) =>
    slugs.some((slug) => cp.name.toLowerCase().replace(/\s+/g, '-') === slug
      || cp.name.toLowerCase().includes(slug)
      || cp.region === slug),
  )
  if (!matched.length) return AIS_CHOKEPOINT_BBOXES

  const d = 1.5
  return matched.map((cp) => [
    [cp.lng - d, cp.lat - d],
    [cp.lng + d, cp.lat + d],
  ])
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'content-type',
      },
    })
  }

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const apiKey = process.env.AISSTREAM_API_KEY?.trim()
  if (!apiKey) {
    return jsonResponse({
      vessels: [],
      warning: 'AISSTREAM_API_KEY not configured — register free at aisstream.io',
    }, { status: 200 })
  }

  const url = new URL(req.url)
  const boundingBoxes = resolveBoundingBoxes(url)

  if (cache && Date.now() - cache.ts < CACHE_MS && cache.bboxCount === boundingBoxes.length) {
    return jsonResponse({
      vessels: cache.vessels,
      count: cache.vessels.length,
      cached: true,
      bboxCount: boundingBoxes.length,
    }, { stale: true })
  }

  try {
    const vessels = await collectAisVessels(apiKey, boundingBoxes)
    cache = { vessels, ts: Date.now(), bboxCount: boundingBoxes.length }
    return jsonResponse({
      vessels,
      count: vessels.length,
      bboxCount: boundingBoxes.length,
      chokepointCount: CHOKEPOINTS.length,
    })
  } catch (err) {
    if (cache?.vessels?.length) {
      return jsonResponse({
        vessels: cache.vessels,
        count: cache.vessels.length,
        warning: err.message || 'AISStream temporarily unavailable — showing cached vessels',
        bboxCount: boundingBoxes.length,
      }, { stale: true })
    }
    return jsonResponse({
      vessels: [],
      warning: err.message || 'AISStream temporarily unavailable — will retry',
    }, { status: 200 })
  }
}
