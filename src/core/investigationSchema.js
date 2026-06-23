/**
 * Investigation document model — Analysis plane schema (Phase 2/3).
 * Zod-validated; bridges dossier, workspace, and canvas export.
 */
import { z } from 'zod'

export const INDUSTRY_TYPES = ['government', 'corporate', 'journalism', 'ngo', 'general']

export const CONNECTION_TYPES = ['fact', 'hypothesis', 'correlation']

export const EvidenceItemSchema = z.object({
  id: z.string(),
  kind: z.enum(['event', 'article', 'clip', 'indicator', 'entity', 'block']).default('event'),
  title: z.string(),
  source: z.string().optional(),
  sourceUrl: z.string().optional(),
  timestamp: z.string().optional(),
  dimension: z.string().optional(),
  priority: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  summary: z.string().optional(),
  corroborationSources: z.array(z.string()).optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
})

export const EntityRefSchema = z.object({
  id: z.string(),
  label: z.string(),
  kind: z.enum(['place', 'actor', 'topic', 'asset', 'organization']).default('place'),
  iso: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
})

export const ConnectionSchema = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  label: z.string().optional(),
  type: z.enum(CONNECTION_TYPES).default('fact'),
})

export const CanvasBlockSchema = z.object({
  id: z.string(),
  kind: z.enum(['narrative', 'chart', 'map', 'timeline', 'macro']).default('narrative'),
  title: z.string().optional(),
  content: z.string().optional(),
  refIds: z.array(z.string()).optional(),
})

export const InvestigationScopeSchema = z.object({
  place: z.object({
    fips: z.string().optional(),
    iso: z.string().optional(),
    name: z.string(),
    lat: z.number().nullable().optional(),
    lng: z.number().nullable().optional(),
  }).optional(),
  timeRange: z.string().optional(),
  dimensions: z.array(z.string()).optional(),
  query: z.string().optional(),
})

export const InvestigationSchema = z.object({
  id: z.string(),
  title: z.string(),
  industry: z.enum(INDUSTRY_TYPES).default('general'),
  scope: InvestigationScopeSchema.default({}),
  evidence: z.array(EvidenceItemSchema).default([]),
  entities: z.array(EntityRefSchema).default([]),
  connections: z.array(ConnectionSchema).default([]),
  blocks: z.array(CanvasBlockSchema).default([]),
  audit: z.object({
    createdAt: z.string(),
    updatedAt: z.string(),
    author: z.string().optional(),
    revision: z.number().int().min(1).default(1),
  }),
  meta: z.object({
    stability: z.unknown().optional(),
    surge: z.unknown().optional(),
    volumeRows: z.array(z.object({ x: z.string(), v: z.number() })).optional(),
    toneRows: z.array(z.object({ x: z.string(), v: z.number() })).optional(),
    sentences: z.array(z.object({
      text: z.string(),
      url: z.string().optional(),
      domain: z.string().optional(),
    })).optional(),
    sourceCountries: z.array(z.object({
      name: z.string(),
      value: z.number(),
    })).optional(),
    articles: z.array(z.object({
      title: z.string().optional(),
      url: z.string(),
      domain: z.string().optional(),
    })).optional(),
    clips: z.array(z.record(z.string(), z.unknown())).optional(),
    indicators: z.array(z.record(z.string(), z.unknown())).optional(),
  }).optional(),
})

/** @typedef {z.infer<typeof InvestigationSchema>} Investigation */

/**
 * @param {unknown} data
 * @returns {{ success: true, data: Investigation } | { success: false, error: string }}
 */
export function parseInvestigation(data) {
  const result = InvestigationSchema.safeParse(data)
  if (result.success) return { success: true, data: result.data }
  return { success: false, error: result.error.message }
}

/**
 * Default template for an investigation's industry field.
 * @param {string} [industry]
 * @returns {string}
 */
export function defaultTemplateForIndustry(industry) {
  switch (industry) {
    case 'government': return 'sitrep'
    case 'corporate': return 'executive-brief'
    case 'ngo': return 'ngo-situation'
    case 'journalism': return 'journalism-dossier'
    default: return 'general'
  }
}

/**
 * Map a canonical atlas event to an evidence item.
 * @param {Object} evt
 * @returns {z.infer<typeof EvidenceItemSchema>}
 */
export function eventToEvidence(evt) {
  return {
    id: evt.id,
    kind: 'event',
    title: evt.title || 'Untitled',
    source: evt.source,
    sourceUrl: evt.url || evt.sourceUrl,
    timestamp: evt.timestamp,
    dimension: evt.dimension,
    priority: evt.priority,
    confidence: evt.corroborationScore,
    lat: evt.lat,
    lng: evt.lng,
    summary: evt.detail || evt.description,
    corroborationSources: evt.corroborationSources,
  }
}

/**
 * Build an investigation from dossier tab state (place-centric MVP).
 *
 * @param {Object} params
 * @param {{ fips?, iso?, name, lat?, lng? }} params.target
 * @param {Object} params.dossierData — DossierTab composed fetch output
 * @param {Object[]} params.signals — scoped live events
 * @param {string} [params.timeFilter]
 * @param {string} [params.industry]
 * @returns {Investigation}
 */
export function buildInvestigationFromDossier({
  target,
  dossierData = {},
  signals = [],
  timeFilter = 'live',
  industry = 'general',
}) {
  const now = new Date().toISOString()
  const id = `inv-${(target.iso || target.fips || target.name).toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`

  const evidence = signals.slice(0, 50).map(eventToEvidence)

  for (const article of (dossierData.articles || []).slice(0, 12)) {
    evidence.push({
      id: `art-${article.url || article.title}`,
      kind: 'article',
      title: article.title || article.url,
      source: article.domain || 'GDELT DOC',
      sourceUrl: article.url,
      summary: article.seo || undefined,
    })
  }

  const entities = [{
    id: `place-${target.iso || target.fips || target.name}`,
    label: target.name,
    kind: 'place',
    iso: target.iso,
    lat: target.lat ?? undefined,
    lng: target.lng ?? undefined,
  }]

  const narrativeBlock = (dossierData.sentences || []).slice(0, 3)
    .map((s) => s.text)
    .join('\n\n')

  const blocks = narrativeBlock
    ? [{ id: 'block-narrative-1', kind: 'narrative', title: 'Context', content: narrativeBlock }]
    : []

  return InvestigationSchema.parse({
    id,
    title: `${target.name} — Investigation`,
    industry,
    scope: {
      place: target,
      timeRange: timeFilter,
      query: target.name,
    },
    evidence,
    entities,
    connections: [],
    blocks,
    audit: { createdAt: now, updatedAt: now, revision: 1 },
    meta: {
      stability: dossierData.stability,
      surge: dossierData.surge,
      volumeRows: dossierData.volumeRows,
      toneRows: dossierData.toneRows,
      sentences: dossierData.sentences,
      sourceCountries: dossierData.sourceCountries,
      articles: dossierData.articles,
      clips: dossierData.clips,
      indicators: dossierData.indicators,
    },
  })
}
