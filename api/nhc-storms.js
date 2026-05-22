/**
 * GET /api/nhc-storms
 * Proxy for NOAA NHC active tropical cyclone KML/RSS ($0, no key).
 */
import { fetchNhcStormsBundle } from '../src/core/fetchNhcStorms.js'

export const config = {
  runtime: 'edge',
}

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

  try {
    const list = await fetchNhcStormsBundle()
    return new Response(JSON.stringify({ storms: list, count: list.length }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=120',
      },
    })
  } catch (err) {
    return new Response(JSON.stringify({ storms: [], error: err.message }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    })
  }
}
