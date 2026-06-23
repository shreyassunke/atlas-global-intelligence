/**
 * GET /api/entities
 * Entity resolution graph queries (Phase 4).
 *
 * Query params:
 *   ?kind=actor&iso=UA&query=ukraine  — search entities
 *   ?id=<uuid>&depth=2                — graph neighborhood
 *   POST body with events[]           — extract + optionally persist entities
 */
import {
  extractEntitiesFromEvent,
  mergeEntityLists,
  queryEntities,
  traverseEntityGraph,
  buildLinksFromInvestigation,
} from '../src/core/entityResolution.js'
import { queryEntitiesDb, queryEntityGraph, upsertEntity } from './_lib/entityStore.js'

export const config = {
  maxDuration: 30,
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  })
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body
  return await new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (c) => { data += c })
    req.on('end', () => {
      if (!data) return resolve({})
      try { resolve(JSON.parse(data)) } catch (e) { reject(e) }
    })
    req.on('error', reject)
  })
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() })
  }

  const url = new URL(req.url)

  if (req.method === 'GET') {
    const entityId = url.searchParams.get('id')
    const depth = parseInt(url.searchParams.get('depth') || '2', 10)

    if (entityId) {
      const graph = await queryEntityGraph(entityId, depth)
      return json(graph, graph.ok ? 200 : 503)
    }

    const dbResult = await queryEntitiesDb({
      kind: url.searchParams.get('kind') || undefined,
      iso: url.searchParams.get('iso') || undefined,
      query: url.searchParams.get('query') || undefined,
      limit: parseInt(url.searchParams.get('limit') || '50', 10),
    })

    if (dbResult.ok && dbResult.entities.length) {
      return json(dbResult)
    }

    return json({ ok: true, entities: [], hint: dbResult.reason || 'No entities indexed yet' })
  }

  if (req.method === 'POST') {
    try {
      const body = await readJsonBody(req)
      const events = body.events || []
      const investigation = body.investigation
      const persist = body.persist === true

      let entities = events.flatMap((e) => extractEntitiesFromEvent(e))
      if (investigation?.entities) {
        entities = mergeEntityLists(entities, investigation.entities.map((e) => ({
          canonicalId: e.id,
          label: e.label,
          kind: e.kind,
          iso: e.iso,
          lat: e.lat,
          lng: e.lng,
          aliases: [],
          sourceIds: [],
        })))
      }

      const filtered = queryEntities(entities, {
        kind: body.kind,
        iso: body.iso,
        query: body.query,
      })

      const links = investigation ? buildLinksFromInvestigation(investigation) : []
      const graph = body.startId
        ? traverseEntityGraph(body.startId, links, body.depth || 2)
        : null

      if (persist) {
        const results = await Promise.all(filtered.map((e) => upsertEntity(e)))
        const persisted = results.filter((r) => r.ok).length
        return json({ ok: true, entities: filtered, persisted, graph })
      }

      return json({ ok: true, entities: filtered, count: filtered.length, graph })
    } catch (err) {
      return json({ ok: false, error: err.message || 'Entity extraction failed' }, 500)
    }
  }

  return json({ error: 'Method not allowed' }, 405)
}
