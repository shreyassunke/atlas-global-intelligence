/**
 * Delivery plane — assembles structured report blueprints from investigations.
 * Evolves briefExport.js from flat markdown to industry template sections.
 */
import {
  DIMENSION_LABELS,
  formatToneScore,
} from './eventSchema.js'
import { defaultTemplateForIndustry } from './investigationSchema.js'

export const REPORT_TEMPLATE_IDS = [
  'sitrep',
  'executive-brief',
  'ngo-situation',
  'journalism-dossier',
  'general',
]

export const REPORT_TEMPLATE_LABELS = {
  sitrep: 'SITREP (Government / Defense)',
  'executive-brief': 'Executive Brief (Corporate Risk)',
  'ngo-situation': 'Situation Report (NGO / Humanitarian)',
  'journalism-dossier': 'Investigation Dossier (Journalism)',
  general: 'OSINT Summary (General)',
}

export const CLASSIFICATION_LABELS = {
  unclassified: 'UNCLASSIFIED',
  internal: 'INTERNAL USE ONLY',
  confidential: 'CONFIDENTIAL',
}

/**
 * @typedef {Object} ReportSection
 * @property {string} id
 * @property {string} title
 * @property {string} kind — summary | judgments | evidence | timeline | map | gaps | sources | macro | risks
 * @property {string} [body] — markdown/plain text
 * @property {Object[]} [rows] — tabular evidence
 * @property {Object} [meta]
 */

/**
 * @typedef {Object} ReportBlueprint
 * @property {string} templateId
 * @property {string} investigationId
 * @property {string} title
 * @property {string} [classification]
 * @property {string} generatedAt
 * @property {ReportSection[]} sections
 * @property {{ canvasPng?: string, globePng?: string, mapExtent?: Object }} snapshots
 * @property {{ hideSources?: boolean, hideHypotheses?: boolean }} redaction
 * @property {Object} provenance
 */

function formatEvidenceRow(item, hideSources) {
  const pri = PRIORITY_LABELS[item.priority] || item.priority || '—'
  const dim = DIMENSION_LABELS[item.dimension] || item.dimension || '—'
  const conf = item.confidence != null
    ? `${Math.round(item.confidence * 100)}%`
    : '—'
  const ts = item.timestamp
    ? new Date(item.timestamp).toISOString().slice(0, 16).replace('T', ' ')
    : '—'
  return {
    title: item.title,
    kind: item.kind,
    priority: pri,
    dimension: dim,
    source: hideSources ? '—' : (item.source || '—'),
    sourceUrl: hideSources ? undefined : item.sourceUrl,
    confidence: conf,
    timestamp: ts,
    lowConfidence: item.confidence != null && item.confidence < 0.35,
  }
}

function buildTimelineSection(investigation) {
  const events = investigation.evidence
    .filter((e) => e.kind === 'event' && e.timestamp)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    .slice(0, 20)

  if (!events.length) return null

  return {
    id: 'timeline',
    title: 'Timeline',
    kind: 'timeline',
    rows: events.map((e) => ({
      date: new Date(e.timestamp).toISOString().slice(0, 10),
      time: new Date(e.timestamp).toISOString().slice(11, 16),
      title: e.title,
      source: e.source,
    })),
  }
}

function buildEvidenceSection(investigation, redaction) {
  const rows = investigation.evidence
    .slice(0, 40)
    .map((item) => formatEvidenceRow(item, redaction.hideSources))

  return {
    id: 'evidence',
    title: 'Evidence',
    kind: 'evidence',
    rows,
    meta: { count: investigation.evidence.length },
  }
}

function buildSourceAppendix(investigation, redaction) {
  if (redaction.hideSources) return null

  const sources = new Map()
  for (const item of investigation.evidence) {
    const key = item.source || 'unknown'
    if (!sources.has(key)) {
      sources.set(key, { name: key, url: item.sourceUrl, count: 0 })
    }
    sources.get(key).count += 1
  }

  const rows = [...sources.values()].sort((a, b) => b.count - a.count)
  if (!rows.length) return null

  return {
    id: 'sources',
    title: 'Source Appendix',
    kind: 'sources',
    rows,
  }
}

function buildMacroSection(investigation) {
  const indicators = investigation.meta?.indicators || []
  if (!indicators.length) return null

  return {
    id: 'macro',
    title: 'Macro Indicators',
    kind: 'macro',
    rows: indicators.map((ind) => ({
      label: ind.label,
      value: ind.value,
      unit: ind.unit || '',
      cadence: ind.cadence || '',
      source: ind.source,
    })),
  }
}

function buildSituationSummary(investigation) {
  const place = investigation.scope?.place?.name || investigation.title
  const signalCount = investigation.evidence.filter((e) => e.kind === 'event').length
  const surge = investigation.meta?.surge
  const stability = investigation.meta?.stability

  const parts = [
    `Assessment covers ${place} under a ${investigation.scope?.timeRange || 'live'} window.`,
    `${signalCount} live signal${signalCount === 1 ? '' : 's'} captured in this investigation.`,
  ]

  if (stability?.avgGoldstein != null) {
    parts.push(`Five-year Goldstein stability index: ${Number(stability.avgGoldstein).toFixed(2)} (−10 conflict … +10 cooperation).`)
  }
  if (surge?.zScore != null) {
    parts.push(`Activity surge z-score vs 30-day baseline: ${Number(surge.zScore).toFixed(1)}.`)
  }

  const narrative = investigation.blocks?.find((b) => b.kind === 'narrative')
  if (narrative?.content) {
    parts.push('', narrative.content)
  }

  return parts.join(' ')
}

function buildKeyJudgments(investigation, templateId) {
  const breaking = investigation.evidence.filter((e) => e.priority === 'p1').slice(0, 5)
  const hypotheses = investigation.connections
    .filter((c) => c.type === 'hypothesis')
    .slice(0, 5)

  const lines = []
  if (breaking.length) {
    lines.push('High-priority signals requiring immediate attention:')
    for (const e of breaking) {
      const qualifier = e.confidence != null && e.confidence < 0.35 ? ' (low confidence — verify)' : ''
      lines.push(`• ${e.title}${qualifier}`)
    }
  } else {
    lines.push('No P1 breaking signals in the current evidence set.')
  }

  if (templateId === 'executive-brief') {
    const economySignals = investigation.evidence.filter((e) => e.dimension === 'economy').length
    lines.push('', `Economy-dimension signals: ${economySignals}. Review macro section for market context.`)
  }

  if (templateId === 'ngo-situation') {
    const peopleSignals = investigation.evidence.filter((e) => e.dimension === 'people').length
    const envSignals = investigation.evidence.filter((e) => e.dimension === 'environment').length
    lines.push('', `People-affecting signals: ${peopleSignals}. Environmental hazards: ${envSignals}.`)
  }

  if (hypotheses.length && templateId !== 'journalism-dossier') {
    lines.push('', 'Analyst hypotheses (unverified):')
    for (const h of hypotheses) lines.push(`• ${h.label || `${h.from} → ${h.to}`}`)
  }

  return lines.join('\n')
}

function buildGapsSection(investigation) {
  const gaps = []
  if (!investigation.meta?.stability) gaps.push('Historical stability data unavailable (BigQuery proxy not configured).')
  if (!investigation.evidence.some((e) => e.kind === 'article')) gaps.push('Limited documentary evidence — consider adding GDELT DOC articles.')
  if (investigation.evidence.length < 3) gaps.push('Evidence set is thin — corroborate with additional sources before external release.')

  if (!gaps.length) return null
  return {
    id: 'gaps',
    title: 'Information Gaps',
    kind: 'gaps',
    body: gaps.map((g) => `• ${g}`).join('\n'),
  }
}

function buildUnverifiedSection(investigation, redaction) {
  if (redaction.hideHypotheses) return null
  const lowConf = investigation.evidence.filter((e) => e.confidence != null && e.confidence < 0.35)
  const hypotheses = investigation.connections.filter((c) => c.type === 'hypothesis')
  if (!lowConf.length && !hypotheses.length) return null

  const lines = []
  if (lowConf.length) {
    lines.push('Low-confidence signals (do not state as fact):')
    for (const e of lowConf) lines.push(`• ${e.title} (${Math.round(e.confidence * 100)}% corroboration)`)
  }
  if (hypotheses.length) {
    lines.push('', 'Unverified analyst hypotheses:')
    for (const h of hypotheses) lines.push(`• ${h.label || `${h.from} → ${h.to}`}`)
  }

  return {
    id: 'unverified',
    title: 'Unverified Claims',
    kind: 'gaps',
    body: lines.join('\n'),
  }
}

/**
 * Template-specific section ordering.
 * @param {string} templateId
 * @param {import('./investigationSchema.js').Investigation} investigation
 * @param {{ hideSources?: boolean, hideHypotheses?: boolean }} redaction
 * @returns {ReportSection[]}
 */
function buildSectionsForTemplate(templateId, investigation, redaction) {
  const summary = {
    id: 'summary',
    title: templateId === 'executive-brief' ? 'BLUF' : 'Situation Summary',
    kind: 'summary',
    body: buildSituationSummary(investigation),
  }

  const judgments = {
    id: 'judgments',
    title: templateId === 'executive-brief' ? 'Risk Assessment' : 'Key Judgments',
    kind: 'judgments',
    body: buildKeyJudgments(investigation, templateId),
  }

  const evidence = buildEvidenceSection(investigation, redaction)
  const timeline = buildTimelineSection(investigation)
  const macro = buildMacroSection(investigation)
  const gaps = buildGapsSection(investigation)
  const sources = buildSourceAppendix(investigation, redaction)
  const unverified = buildUnverifiedSection(investigation, redaction)

  const recommendations = templateId === 'executive-brief' ? {
    id: 'recommendations',
    title: 'Recommendations',
    kind: 'judgments',
    body: [
      'Monitor breaking signals daily until situation stabilizes.',
      'Validate low-confidence items against primary sources before executive briefing.',
      'Review macro indicators for second-order economic exposure.',
    ].join('\n'),
  } : null

  const responseGaps = templateId === 'ngo-situation' ? {
    id: 'response-gaps',
    title: 'Response Gaps',
    kind: 'gaps',
    body: gaps?.body || 'No significant information gaps identified at this time.',
  } : null

  switch (templateId) {
    case 'sitrep':
      return [summary, judgments, evidence, timeline, gaps, sources].filter(Boolean)
    case 'executive-brief':
      return [summary, judgments, macro, evidence, recommendations, sources].filter(Boolean)
    case 'ngo-situation':
      return [summary, judgments, evidence, responseGaps, sources].filter(Boolean)
    case 'journalism-dossier':
      return [summary, timeline, evidence, unverified, sources].filter(Boolean)
    default:
      return [summary, evidence, timeline, sources].filter(Boolean)
  }
}

/**
 * Assemble a report blueprint from an investigation document.
 *
 * @param {import('./investigationSchema.js').Investigation} investigation
 * @param {Object} [options]
 * @param {string} [options.templateId]
 * @param {string} [options.classification]
 * @param {{ hideSources?: boolean, hideHypotheses?: boolean }} [options.redaction]
 * @param {{ canvasPng?: string, globePng?: string }} [options.snapshots]
 * @returns {ReportBlueprint}
 */
export function buildReportBlueprint(investigation, options = {}) {
  const templateId = options.templateId || defaultTemplateForIndustry(investigation.industry)
  const redaction = {
    hideSources: options.redaction?.hideSources ?? false,
    hideHypotheses: options.redaction?.hideHypotheses ?? (templateId !== 'journalism-dossier'),
  }

  const sourceCount = new Set(
    investigation.evidence.map((e) => e.source).filter(Boolean),
  ).size

  return {
    templateId,
    investigationId: investigation.id,
    title: investigation.title,
    classification: options.classification || 'unclassified',
    generatedAt: new Date().toISOString(),
    sections: buildSectionsForTemplate(templateId, investigation, redaction),
    snapshots: options.snapshots || {},
    redaction,
    provenance: {
      generator: 'ATLAS',
      revision: investigation.audit?.revision ?? 1,
      sourceCount,
      evidenceCount: investigation.evidence.length,
      place: investigation.scope?.place?.name,
      timeRange: investigation.scope?.timeRange,
    },
  }
}

/**
 * Render blueprint as plain Markdown (client download / server parallel export).
 * @param {ReportBlueprint} blueprint
 * @returns {string}
 */
export function blueprintToMarkdown(blueprint) {
  const classLabel = CLASSIFICATION_LABELS[blueprint.classification] || blueprint.classification
  const lines = [
    `# ${blueprint.title}`,
    '',
    `**Template:** ${REPORT_TEMPLATE_LABELS[blueprint.templateId] || blueprint.templateId}`,
    `**Classification:** ${classLabel}`,
    `**Generated:** ${blueprint.generatedAt}`,
    '',
  ]

  if (blueprint.provenance?.place) {
    lines.push(`**Scope:** ${blueprint.provenance.place} · ${blueprint.provenance.timeRange || 'live'}`, '')
  }

  for (const section of blueprint.sections) {
    lines.push(`## ${section.title}`, '')
    if (section.body) {
      lines.push(section.body, '')
    }
    if (section.rows?.length) {
      if (section.kind === 'evidence') {
        lines.push('| Signal | Priority | Dimension | Source | Confidence |', '| --- | --- | --- | --- | --- |')
        for (const row of section.rows) {
          const flag = row.lowConfidence ? ' ⚠' : ''
          lines.push(`| ${row.title}${flag} | ${row.priority} | ${row.dimension} | ${row.source} | ${row.confidence} |`)
        }
      } else if (section.kind === 'timeline') {
        for (const row of section.rows) {
          lines.push(`- **${row.date} ${row.time}** — ${row.title} (${row.source || '—'})`)
        }
      } else if (section.kind === 'sources') {
        for (const row of section.rows) {
          lines.push(`- ${row.name}: ${row.count} item${row.count === 1 ? '' : 's'}${row.url ? ` — ${row.url}` : ''}`)
        }
      } else if (section.kind === 'macro') {
        for (const row of section.rows) {
          lines.push(`- **${row.label}:** ${row.value}${row.unit ? ` ${row.unit}` : ''} (${row.cadence || row.source})`)
        }
      }
      lines.push('')
    }
  }

  lines.push(
    '---',
    `_Generated by ATLAS · ${blueprint.generatedAt} · ${blueprint.provenance?.sourceCount ?? 0} sources · ${blueprint.provenance?.evidenceCount ?? 0} evidence items_`,
    '_Verify critical claims against primary sources before external distribution._',
  )

  return lines.join('\n')
}
