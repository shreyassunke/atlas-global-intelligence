/**
 * Shared L2 feed snapshot store (Supabase).
 * Slow/medium feeds only — not ADS-B or AIS.
 */

import { createClient } from '@supabase/supabase-js'

/** @type {import('@supabase/supabase-js').SupabaseClient | null} */
let adminClient = null

/** Source ids eligible for Supabase L2 cache. */
export const L2_FEED_SOURCES = new Set([
  'usgs',
  'gdacs',
  'eonet',
  'firms',
  'noaa-nhc',
  'celestrak-tle',
  'gdelt-cameo',
])

/** TTL seconds per source. */
export const L2_TTL_SECONDS = {
  usgs: 86_400,
  gdacs: 86_400,
  eonet: 86_400,
  firms: 86_400,
  'noaa-nhc': 86_400,
  'celestrak-tle': 172_800,
  'gdelt-cameo': 1800,
}

const MAX_PAYLOAD_BYTES = 500_000

function getAdminClient() {
  if (adminClient) return adminClient
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  adminClient = createClient(url, key, { auth: { persistSession: false } })
  return adminClient
}

/**
 * @param {unknown} payload
 * @returns {unknown}
 */
export function truncatePayload(payload) {
  let json = JSON.stringify(payload)
  if (json.length <= MAX_PAYLOAD_BYTES) return payload

  const copy = structuredClone(payload)
  if (copy && typeof copy === 'object' && Array.isArray(copy.events)) {
    while (copy.events.length > 10 && JSON.stringify(copy).length > MAX_PAYLOAD_BYTES) {
      copy.events = copy.events.slice(0, Math.floor(copy.events.length * 0.75))
    }
  }
  json = JSON.stringify(copy)
  if (json.length > MAX_PAYLOAD_BYTES) {
    return { events: [], truncated: true }
  }
  return copy
}

/**
 * @param {string} sourceId
 * @param {object} payload
 * @param {number} [eventCount]
 * @param {'fresh'|'stale'} [status]
 */
export async function upsertFeedSnapshot(sourceId, payload, eventCount = 0, status = 'fresh') {
  if (!L2_FEED_SOURCES.has(sourceId)) return { ok: false, reason: 'not_l2_source' }
  const client = getAdminClient()
  if (!client) return { ok: false, reason: 'no_supabase_admin' }

  const ttlSec = L2_TTL_SECONDS[sourceId] || 3600
  const now = new Date()
  const expiresAt = new Date(now.getTime() + ttlSec * 1000)
  const trimmed = truncatePayload(payload)

  const { error } = await client.from('feed_snapshots').upsert({
    source_id: sourceId,
    payload: trimmed,
    event_count: eventCount,
    fetched_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
    status,
  })

  if (error) return { ok: false, reason: error.message }
  return { ok: true }
}

/**
 * @param {string[]} sourceIds
 */
export async function readFeedSnapshots(sourceIds) {
  const client = getAdminClient()
  if (!client) return {}

  const ids = sourceIds.filter((id) => L2_FEED_SOURCES.has(id))
  if (!ids.length) return {}

  const { data, error } = await client
    .from('feed_snapshots')
    .select('source_id, payload, event_count, fetched_at, expires_at, status')
    .in('source_id', ids)

  if (error || !data) return {}

  /** @type {Record<string, object>} */
  const out = {}
  const now = Date.now()
  for (const row of data) {
    const expiresMs = new Date(row.expires_at).getTime()
    const stale = expiresMs < now || row.status === 'stale'
    out[row.source_id] = {
      payload: row.payload,
      eventCount: row.event_count,
      fetchedAt: new Date(row.fetched_at).getTime(),
      expiresAt: expiresMs,
      status: stale ? 'stale' : row.status || 'fresh',
    }
  }
  return out
}
