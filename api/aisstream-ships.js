/**
 * GET /api/aisstream-ships
 * Server-side AISStream.io WebSocket collector ($0 free tier, registration only).
 * Browser cannot connect directly (CORS + API key protection per AISStream docs).
 *
 * Env: AISSTREAM_API_KEY (server-only, set in Vercel dashboard or .env.local for vercel dev)
 */

export const config = {
  maxDuration: 30,
}

/** AISStream expects [[minLng, minLat], [maxLng, maxLat]] — NOT lat/lng order. */
const CHOKEPOINT_BBOXES = [
  [[54.8, 25.1], [57.8, 28.1]],     // Hormuz
  [[30.8, 28.5], [33.8, 31.5]],     // Suez
  [[100.3, 1.0], [103.3, 4.0]],     // Malacca
  [[41.8, 11.1], [44.8, 14.1]],     // Bab-el-Mandeb
  [[-81.1, 7.5], [-78.1, 10.5]],    // Panama
  [[119.0, 23.0], [122.0, 26.0]],   // Taiwan Strait
  [[27.5, 39.6], [30.5, 42.6]],     // Bosphorus
  [[113.5, 13.5], [116.5, 16.5]],   // South China Sea
]

const COLLECT_MS = 10_000
const WS_OPEN_TIMEOUT_MS = 10_000

/**
 * @param {string} apiKey
 * @returns {Promise<object[]>}
 */
function collectAisVessels(apiKey) {
  return new Promise((resolve, reject) => {
    /** @type {Map<string, object>} */
    const vessels = new Map()
    let settled = false
    /** @type {WebSocket | null} */
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
        BoundingBoxes: CHOKEPOINT_BBOXES,
        FilterMessageTypes: ['PositionReport'],
      }))
    })

    ws.addEventListener('message', (evt) => {
      try {
        const msg = JSON.parse(String(evt.data))
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
    return new Response(JSON.stringify({
      vessels: [],
      warning: 'AISSTREAM_API_KEY not configured — register free at aisstream.io',
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      },
    })
  }

  try {
    const vessels = await collectAisVessels(apiKey)
    return new Response(JSON.stringify({ vessels, count: vessels.length }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=10',
      },
    })
  } catch (err) {
    return new Response(JSON.stringify({
      vessels: [],
      warning: err.message || 'AISStream temporarily unavailable — will retry',
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      },
    })
  }
}
