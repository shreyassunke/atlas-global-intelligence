/**
 * GET /api/gdacs-rss
 * Proxy for GDACS disaster RSS ($0, no key).
 */

export const config = {
  runtime: 'edge',
}

const GDACS_RSS_URL = 'https://www.gdacs.org/xml/rss.xml'

/** @type {{ body: string, ts: number } | null} */
let cache = null

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
      },
    })
  }

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (cache && Date.now() - cache.ts < 120_000) {
    return new Response(cache.body, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=120, stale-while-revalidate=600',
        'X-Atlas-Cache': 'hit',
      },
    })
  }

  try {
    const upstream = await fetch(GDACS_RSS_URL, {
      headers: { Accept: 'application/xml, text/xml' },
      signal: AbortSignal.timeout(20_000),
    })
    if (!upstream.ok) {
      throw new Error(`GDACS upstream HTTP ${upstream.status}`)
    }
    const xml = await upstream.text()
    cache = { body: xml, ts: Date.now() }
    return new Response(xml, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=120, stale-while-revalidate=600',
      },
    })
  } catch (err) {
    if (cache) {
      return new Response(cache.body, {
        status: 200,
        headers: {
          'Content-Type': 'application/xml; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=60, stale-while-revalidate=600',
          'X-Atlas-Stale': 'gdacs-cache',
        },
      })
    }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    })
  }
}
