/**
 * GET /api/celestrak-tle?group=active
 * Browser-safe proxy for CelesTrak TLE catalogs (avoids CORS in the fetch worker).
 * Tries JSON first (more reliable), then classic TLE/3LE text formats.
 */

export const config = {
  runtime: 'edge',
}

const ALLOWED = new Set(['active', 'stations', 'starlink', 'gps-ops', 'military'])
const FETCH_TIMEOUT_MS = 25_000

/** @type {Map<string, { body: string, ts: number }>} */
const cache = new Map()
const CACHE_MS = 3600_000

function jsonGpToTleText(data) {
  const rows = Array.isArray(data) ? data : data?.data || data?.satellites || []
  const lines = []
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue
    const name = r.OBJECT_NAME || r.object_name || r.objectName || r.name || 'UNKNOWN'
    const l1 = r.TLE_LINE1 || r.tle_line1 || r.line1
    const l2 = r.TLE_LINE2 || r.tle_line2 || r.line2
    if (typeof l1 === 'string' && l1.startsWith('1 ') && typeof l2 === 'string' && l2.startsWith('2 ')) {
      lines.push(name, l1, l2)
    }
  }
  return lines.length >= 3 ? lines.join('\n') : null
}

async function fetchTleGroup(group) {
  const cached = cache.get(group)
  if (cached && Date.now() - cached.ts < CACHE_MS) {
    return cached.body
  }

  const attempts = [
    `https://celestrak.org/NORAD/elements/gp.php?GROUP=${encodeURIComponent(group)}&FORMAT=json`,
    `https://celestrak.org/NORAD/elements/gp.php?GROUP=${encodeURIComponent(group)}&FORMAT=JSON`,
    `https://celestrak.org/NORAD/elements/gp.php?GROUP=${encodeURIComponent(group)}&FORMAT=tle`,
    `https://celestrak.org/NORAD/elements/gp.php?GROUP=${encodeURIComponent(group)}&FORMAT=3le`,
  ]

  let lastErr
  for (const url of attempts) {
    try {
      const isJson = url.includes('FORMAT=json') || url.includes('FORMAT=JSON')
      const upstream = await fetch(url, {
        headers: { Accept: isJson ? 'application/json' : 'text/plain' },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })
      if (!upstream.ok) {
        lastErr = new Error(`HTTP ${upstream.status}`)
        continue
      }
      if (isJson) {
        const data = await upstream.json()
        const text = jsonGpToTleText(data)
        if (text) {
          cache.set(group, { body: text, ts: Date.now() })
          return text
        }
        lastErr = new Error('JSON response had no TLE lines')
        continue
      }
      const body = await upstream.text()
      if (body && !body.trimStart().startsWith('<') && body.includes('1 ')) {
        cache.set(group, { body, ts: Date.now() })
        return body
      }
      lastErr = new Error('Invalid TLE response')
    } catch (err) {
      lastErr = err
    }
  }

  if (cached) return cached.body
  throw lastErr || new Error('CelesTrak fetch failed')
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

  const url = new URL(req.url)
  const group = url.searchParams.get('group') || 'active'
  if (!ALLOWED.has(group)) {
    return new Response(JSON.stringify({ error: 'Invalid group' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }

  try {
    const body = await fetchTleGroup(group)
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=21600',
      },
    })
  } catch (err) {
    const cached = cache.get(group)
    if (cached) {
      return new Response(cached.body, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=1800, stale-while-revalidate=21600',
          'X-Atlas-Stale': 'celestrak-cache',
        },
      })
    }
    return new Response(err.message || 'CelesTrak proxy failed', {
      status: 502,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'text/plain' },
    })
  }
}
