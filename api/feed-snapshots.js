/**
 * GET  /api/feed-snapshots?sources=usgs,gdacs,...
 * POST /api/feed-snapshots  { sourceId, payload, eventCount?, status? }
 *
 * L2 shared cache backed by Supabase feed_snapshots.
 */

import {
  L2_FEED_SOURCES,
  readFeedSnapshots,
  upsertFeedSnapshot,
} from './_lib/feedSnapshotStore.js'

export const config = {
  runtime: 'edge',
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'content-type',
      },
    })
  }

  if (req.method === 'GET') {
    const url = new URL(req.url)
    const raw = url.searchParams.get('sources') || ''
    const sourceIds = raw.split(',').map((s) => s.trim()).filter(Boolean)
    const snapshots = await readFeedSnapshots(sourceIds)

    return new Response(JSON.stringify({ snapshots }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=30, stale-while-revalidate=120',
      },
    })
  }

  if (req.method === 'POST') {
    let body
    try {
      body = await req.json()
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    const sourceId = body?.sourceId
    if (!sourceId || !L2_FEED_SOURCES.has(sourceId)) {
      return new Response(JSON.stringify({ error: 'Invalid or non-L2 sourceId' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    const result = await upsertFeedSnapshot(
      sourceId,
      body.payload || {},
      body.eventCount ?? body.payload?.events?.length ?? 0,
      body.status || 'fresh',
    )

    return new Response(JSON.stringify(result), {
      status: result.ok ? 200 : 503,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    })
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
}
