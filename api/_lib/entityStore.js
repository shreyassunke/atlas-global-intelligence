/**
 * Supabase entity store — Intelligence plane persistence (Phase 4).
 */
import { createClient } from '@supabase/supabase-js'

/** @type {import('@supabase/supabase-js').SupabaseClient | null} */
let adminClient = null

function getAdminClient() {
  if (adminClient) return adminClient
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  adminClient = createClient(url, key, { auth: { persistSession: false } })
  return adminClient
}

/**
 * @param {import('../src/core/entityResolution.js').ResolvedEntity} entity
 */
export async function upsertEntity(entity) {
  const client = getAdminClient()
  if (!client) return { ok: false, reason: 'no_supabase_admin' }

  const { data, error } = await client
    .from('entities')
    .upsert({
      canonical_id: entity.canonicalId,
      label: entity.label,
      kind: entity.kind,
      iso: entity.iso || null,
      lat: entity.lat ?? null,
      lng: entity.lng ?? null,
      aliases: entity.aliases || [],
      source_ids: entity.sourceIds || [],
      updated_at: new Date().toISOString(),
    }, { onConflict: 'canonical_id' })
    .select('id, canonical_id, label, kind, iso, lat, lng, aliases, source_ids')
    .single()

  if (error) return { ok: false, reason: error.message }
  return { ok: true, entity: data }
}

/**
 * @param {{ kind?: string, iso?: string, query?: string, limit?: number }} params
 */
export async function queryEntitiesDb(params = {}) {
  const client = getAdminClient()
  if (!client) return { ok: false, reason: 'no_supabase_admin', entities: [] }

  let q = client.from('entities').select('id, canonical_id, label, kind, iso, lat, lng, aliases, source_ids')
  if (params.kind) q = q.eq('kind', params.kind)
  if (params.iso) q = q.eq('iso', params.iso.toUpperCase())
  if (params.query) q = q.ilike('label', `%${params.query}%`)
  q = q.limit(params.limit || 50)

  const { data, error } = await q
  if (error) return { ok: false, reason: error.message, entities: [] }
  return { ok: true, entities: data || [] }
}

/**
 * @param {string} entityUuid
 * @param {number} [depth]
 */
export async function queryEntityGraph(entityUuid, depth = 2) {
  const client = getAdminClient()
  if (!client) return { ok: false, reason: 'no_supabase_admin', nodes: [], links: [] }

  const { data: links, error } = await client
    .from('entity_links')
    .select('id, from_entity, to_entity, link_type, label, source, event_id, confidence')
    .or(`from_entity.eq.${entityUuid},to_entity.eq.${entityUuid}`)

  if (error) return { ok: false, reason: error.message, nodes: [], links: [] }

  const entityIds = new Set([entityUuid])
  for (const link of links || []) {
    entityIds.add(link.from_entity)
    entityIds.add(link.to_entity)
  }

  const { data: nodes } = await client
    .from('entities')
    .select('id, canonical_id, label, kind, iso')
    .in('id', [...entityIds])

  return { ok: true, nodes: nodes || [], links: links || [], depth }
}

/**
 * @param {import('../src/core/entityResolution.js').EntityLink} link
 * @param {string} fromUuid
 * @param {string} toUuid
 */
export async function upsertEntityLink(link, fromUuid, toUuid) {
  const client = getAdminClient()
  if (!client) return { ok: false, reason: 'no_supabase_admin' }

  const { error } = await client.from('entity_links').insert({
    from_entity: fromUuid,
    to_entity: toUuid,
    link_type: link.type,
    label: link.label || null,
    source: link.source || null,
    event_id: link.eventId || null,
    confidence: link.confidence ?? 0.5,
  })

  if (error) return { ok: false, reason: error.message }
  return { ok: true }
}
