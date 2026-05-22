/**
 * POST /api/overpass-landmarks
 * Browser-safe proxy for OSM Overpass (landmark bbox refinement). $0, rate-limited.
 * Body: { query: string } — Overpass QL from landmarkPresets.
 */

export const config = {
  runtime: 'edge',
}

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'
const MAX_QUERY_LEN = 4000

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
  }
}

function bboxFromElement(el) {
  if (el.bounds) {
    return {
      south: el.bounds.minlat,
      west: el.bounds.minlon,
      north: el.bounds.maxlat,
      east: el.bounds.maxlon,
    }
  }
  const lat = el.lat ?? el.center?.lat
  const lng = el.lon ?? el.center?.lon
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  const pad = 0.004
  return { south: lat - pad, west: lng - pad, north: lat + pad, east: lng + pad }
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() })
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    })
  }

  let body
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    })
  }

  const query = typeof body?.query === 'string' ? body.query.trim() : ''
  if (!query || query.length > MAX_QUERY_LEN) {
    return new Response(JSON.stringify({ error: 'Invalid query' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    })
  }

  try {
    const upstream = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
    })
    const text = await upstream.text()
    if (!upstream.ok) {
      return new Response(JSON.stringify({ error: 'Overpass upstream error', status: upstream.status }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      })
    }
    const json = JSON.parse(text)
    const elements = Array.isArray(json.elements) ? json.elements : []
    let best = null
    for (const el of elements) {
      const bb = bboxFromElement(el)
      if (!bb) continue
      const lat = (bb.south + bb.north) / 2
      const lng = (bb.west + bb.east) / 2
      const area = Math.abs(bb.north - bb.south) * Math.abs(bb.east - bb.west)
      if (!best || area < best.area) {
        best = { lat, lng, bbox: bb, area, name: el.tags?.name || null }
      }
    }
    return new Response(JSON.stringify({ ok: true, result: best }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err?.message || 'Overpass failed' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    })
  }
}
