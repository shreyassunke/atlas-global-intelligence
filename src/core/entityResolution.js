/**
 * Phase 4 — Entity resolution MVP.
 * Extracts canonical entities from events/investigations and supports graph queries.
 */

/** @typedef {'place' | 'actor' | 'topic' | 'asset' | 'organization' | 'vessel'} EntityKind */
/** @typedef {'fact' | 'hypothesis' | 'correlation'} LinkType */

/**
 * @typedef {object} ResolvedEntity
 * @property {string} canonicalId
 * @property {string} label
 * @property {EntityKind} kind
 * @property {string} [iso]
 * @property {number} [lat]
 * @property {number} [lng]
 * @property {string[]} aliases
 * @property {string[]} sourceIds
 */

/**
 * @typedef {object} EntityLink
 * @property {string} fromId
 * @property {string} toId
 * @property {LinkType} type
 * @property {string} [label]
 * @property {string} [source]
 * @property {string} [eventId]
 * @property {number} [confidence]
 */

const STOP_WORDS = new Set(['unknown', 'conflict', 'report', 'breaking'])

/**
 * @param {string} label
 * @param {EntityKind} kind
 * @returns {string}
 */
export function buildCanonicalId(label, kind) {
  const stem = (label || 'unknown')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w))
    .slice(0, 6)
    .join('-')
  return `${kind}:${stem || 'unnamed'}`
}

/**
 * @param {object} event
 * @returns {ResolvedEntity[]}
 */
export function extractEntitiesFromEvent(event) {
  /** @type {ResolvedEntity[]} */
  const out = []
  const seen = new Set()

  const add = (label, kind, extra = {}) => {
    if (!label || label.length < 2) return
    const canonicalId = buildCanonicalId(label, kind)
    if (seen.has(canonicalId)) return
    seen.add(canonicalId)
    out.push({
      canonicalId,
      label: label.trim(),
      kind,
      aliases: [],
      sourceIds: [event.id].filter(Boolean),
      ...extra,
    })
  }

  if (event.locationName) add(event.locationName, 'place', { lat: event.lat, lng: event.lng })
  if (event.actor1) add(event.actor1, 'actor')
  if (event.actor2) add(event.actor2, 'actor')
  if (event.callsign) add(event.callsign, 'vessel', { lat: event.lat, lng: event.lng })
  if (event.mmsi) add(`MMSI ${event.mmsi}`, 'vessel', { lat: event.lat, lng: event.lng })

  for (const tag of event.tags || []) {
    if (typeof tag === 'string' && tag.length > 3 && !/^\d+$/.test(tag)) {
      add(tag, 'topic')
    }
  }

  return out
}

/**
 * @param {import('./investigationSchema.js').Investigation} investigation
 * @returns {ResolvedEntity[]}
 */
export function extractEntitiesFromInvestigation(investigation) {
  /** @type {ResolvedEntity[]} */
  const out = []
  const seen = new Set()

  for (const entity of investigation.entities || []) {
    const canonicalId = entity.id || buildCanonicalId(entity.label, entity.kind)
    if (seen.has(canonicalId)) continue
    seen.add(canonicalId)
    out.push({
      canonicalId,
      label: entity.label,
      kind: entity.kind,
      iso: entity.iso,
      lat: entity.lat,
      lng: entity.lng,
      aliases: [],
      sourceIds: [],
    })
  }

  if (investigation.scope?.place?.name) {
    const p = investigation.scope.place
    const id = buildCanonicalId(p.name, 'place')
    if (!seen.has(id)) {
      out.push({
        canonicalId: id,
        label: p.name,
        kind: 'place',
        iso: p.iso,
        lat: p.lat ?? undefined,
        lng: p.lng ?? undefined,
        aliases: [],
        sourceIds: [],
      })
    }
  }

  return out
}

/**
 * Build entity links from investigation connections + corroboration.
 * @param {import('./investigationSchema.js').Investigation} investigation
 * @returns {EntityLink[]}
 */
export function buildLinksFromInvestigation(investigation) {
  return (investigation.connections || []).map((c) => ({
    fromId: c.from,
    toId: c.to,
    type: c.type || 'fact',
    label: c.label,
    source: 'investigation',
    confidence: c.type === 'fact' ? 0.9 : 0.5,
  }))
}

/**
 * In-memory graph query — traverse entity neighbors up to depth.
 * @param {string} startId
 * @param {EntityLink[]} links
 * @param {number} [maxDepth]
 * @returns {{ nodes: Set<string>, edges: EntityLink[] }}
 */
export function traverseEntityGraph(startId, links, maxDepth = 2) {
  const nodes = new Set([startId])
  const edges = []
  let frontier = new Set([startId])

  for (let depth = 0; depth < maxDepth; depth++) {
    const nextFrontier = new Set()
    for (const link of links) {
      const touches = frontier.has(link.fromId) || frontier.has(link.toId)
      if (!touches) continue
      edges.push(link)
      nodes.add(link.fromId)
      nodes.add(link.toId)
      if (frontier.has(link.fromId)) nextFrontier.add(link.toId)
      if (frontier.has(link.toId)) nextFrontier.add(link.fromId)
    }
    frontier = nextFrontier
    if (!frontier.size) break
  }

  return { nodes, edges }
}

/**
 * @param {ResolvedEntity[]} entities
 * @param {{ kind?: EntityKind, iso?: string, query?: string }} filter
 * @returns {ResolvedEntity[]}
 */
export function queryEntities(entities, filter = {}) {
  let result = entities
  if (filter.kind) result = result.filter((e) => e.kind === filter.kind)
  if (filter.iso) result = result.filter((e) => e.iso?.toLowerCase() === filter.iso.toLowerCase())
  if (filter.query) {
    const q = filter.query.toLowerCase()
    result = result.filter((e) =>
      e.label.toLowerCase().includes(q)
      || e.canonicalId.includes(q)
      || e.aliases.some((a) => a.toLowerCase().includes(q)),
    )
  }
  return result
}

/**
 * Merge entity lists by canonicalId.
 * @param {ResolvedEntity[]} lists
 * @returns {ResolvedEntity[]}
 */
export function mergeEntityLists(...lists) {
  const byId = new Map()
  for (const list of lists) {
    for (const entity of list) {
      const existing = byId.get(entity.canonicalId)
      if (!existing) {
        byId.set(entity.canonicalId, { ...entity, sourceIds: [...entity.sourceIds] })
        continue
      }
      existing.sourceIds = [...new Set([...existing.sourceIds, ...entity.sourceIds])]
      existing.aliases = [...new Set([...existing.aliases, ...entity.aliases])]
    }
  }
  return [...byId.values()]
}
