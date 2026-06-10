/**
 * GET /api/nhc-storms
 * Proxy for NOAA NHC active tropical cyclone KML/RSS ($0, no key).
 */
import { fetchNhcStormsBundle } from '../src/core/fetchNhcStorms.js'
import { upsertFeedSnapshot } from './_lib/feedSnapshotStore.js'

export const config = {
  runtime: 'edge',
}

/** @type {{ storms: object[], ts: number } | null} */
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
    return new Response(JSON.stringify({ storms: cache.storms, count: cache.storms.length, cached: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=120, stale-while-revalidate=600',
        'X-Atlas-Cache': 'hit',
      },
    })
  }

  try {
    const list = await fetchNhcStormsBundle()
    cache = { storms: list, ts: Date.now() }
    void upsertFeedSnapshot('noaa-nhc', { storms: list }, list.length)
    return new Response(JSON.stringify({ storms: list, count: list.length }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=120, stale-while-revalidate=600',
      },
    })
  } catch (err) {
    if (cache) {
      return new Response(JSON.stringify({
        storms: cache.storms,
        count: cache.storms.length,
        warning: err.message,
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=60, stale-while-revalidate=600',
          'X-Atlas-Stale': 'nhc-cache',
        },
      })
    }
    return new Response(JSON.stringify({ storms: [], error: err.message }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    })
  }
}
