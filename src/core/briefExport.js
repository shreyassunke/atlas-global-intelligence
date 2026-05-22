import { DIMENSION_LABELS, PRIORITY_LABELS, formatToneScore } from './eventSchema'
import { buildShareUrl } from './urlState'
import { eventSourceToGlobeDataLayerKey } from './globeLayers'

const TIME_FILTER_MAX_AGE_MS = {
  live: 2 * 3600_000,
  '24h': 24 * 3600_000,
  '7d': 7 * 24 * 3600_000,
  '30d': 30 * 24 * 3600_000,
}

function passesTimeFilter(evt, timeFilter) {
  const maxAgeMs = TIME_FILTER_MAX_AGE_MS[timeFilter] ?? TIME_FILTER_MAX_AGE_MS.live
  const now = Date.now()
  const tsMs = evt.timestamp ? new Date(evt.timestamp).getTime() : NaN
  const refMs = Number.isFinite(tsMs) ? tsMs : now
  return now - refMs <= maxAgeMs
}

function passesPriorityFilter(evt, priorityFilter) {
  if (priorityFilter === 'p1' && evt.priority !== 'p1') return false
  if (priorityFilter === 'p1p2' && evt.priority === 'p3') return false
  return true
}

/**
 * Events visible on the globe under current HUD filters (mirrors useGlobeLayerEvents).
 * @param {Object} state — atlas store slice
 * @param {number} [limit=40]
 */
export function getVisibleGlobeEvents(state, limit = 40) {
  const { events, dataLayers, activeDimensions, priorityFilter, timeFilter } = state
  const dims = activeDimensions?.size ? activeDimensions : new Set(['safety', 'governance', 'economy', 'people', 'environment', 'narrative'])
  const list = []

  for (const evt of events) {
    if (evt.trackKind) continue
    if (evt.lat == null || evt.lng == null) continue
    const layerKey = eventSourceToGlobeDataLayerKey(evt.source)
    if (!layerKey || dataLayers?.[layerKey] === false) continue
    if (!dims.has(evt.dimension)) continue
    if (!passesPriorityFilter(evt, priorityFilter)) continue
    if (!passesTimeFilter(evt, timeFilter)) continue
    list.push(evt)
  }

  list.sort((a, b) => {
    const pr = { p1: 3, p2: 2, p3: 1 }
    const pd = (pr[b.priority] || 0) - (pr[a.priority] || 0)
    if (pd !== 0) return pd
    return new Date(b.timestamp || 0) - new Date(a.timestamp || 0)
  })

  return list.slice(0, limit)
}

/**
 * @param {Object} state
 * @returns {string}
 */
export function buildBriefMarkdown(state) {
  const now = new Date()
  const visible = getVisibleGlobeEvents(state, 50)
  const shareUrl = typeof window !== 'undefined' ? buildShareUrl({
    activeDimensions: state.activeDimensions,
    priorityFilter: state.priorityFilter,
    timeFilter: state.timeFilter,
    dataLayers: state.dataLayers,
    globeMode: state.globeMode,
    tacticalMode: state.tacticalMode,
    detectionMode: state.detectionMode,
    detectionLabelDensity: state.detectionLabelDensity,
    shareCamera: state.shareCamera,
    zoomLevel: state.zoomLevel,
    selectedEventId: state.selectedEvent?.id ?? null,
  }) : ''

  const lines = [
    '# ATLAS Intelligence Brief',
    '',
    `Generated: ${now.toISOString()}`,
    '',
    '## View context',
    `- Globe mode: ${state.globeMode || 'cesium'}`,
    `- Priority filter: ${state.priorityFilter || 'all'}`,
    `- Time window: ${state.timeFilter || 'live'}`,
    `- Active dimensions: ${[...(state.activeDimensions || [])].join(', ') || 'all'}`,
    shareUrl ? `- Shareable link: ${shareUrl}` : '',
    '',
    `## Visible signals (${visible.length})`,
    '',
  ]

  if (visible.length === 0) {
    lines.push('_No events match the current filters and layer toggles._')
  } else {
    for (const evt of visible) {
      const dim = DIMENSION_LABELS[evt.dimension] || evt.dimension
      const pri = PRIORITY_LABELS[evt.priority] || evt.priority
      const tone = evt.tone != null ? formatToneScore(evt.tone) : '—'
      const loc = evt.location || evt.country || (evt.lat != null ? `${evt.lat.toFixed(2)}, ${evt.lng.toFixed(2)}` : '—')
      const approx = evt.latApproximate ? ' (~approx)' : ''
      const corr = evt.corroborationScore != null ? ` · corroboration ${evt.corroborationScore}` : ''
      lines.push(
        `### ${evt.title || 'Untitled'}`,
        `- **${pri}** · ${dim} · ${evt.source || 'unknown'}`,
        `- Location: ${loc}${approx}`,
        `- Tone: ${tone}${corr}`,
        evt.url ? `- [Source](${evt.url})` : '',
        '',
      )
    }
  }

  if (state.selectedEvent) {
    const e = state.selectedEvent
    lines.push('## Selected event', '', `**${e.title}**`, `- ${e.source} · ${e.timestamp || ''}`, '')
  }

  lines.push('---', '_Client-side snapshot from ATLAS. Verify critical claims against primary sources._')
  return lines.filter((l) => l !== undefined).join('\n')
}

/**
 * @param {string} markdown
 * @param {string} [filename]
 */
export function downloadMarkdownBrief(markdown, filename) {
  const name = filename || `atlas-brief-${new Date().toISOString().slice(0, 10)}.md`
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * PDF export via html2pdf.js (dynamic import).
 * @param {Object} state
 */
export async function exportBriefPdf(state) {
  const markdown = buildBriefMarkdown(state)
  const html = `
    <div style="font-family: system-ui, sans-serif; font-size: 11px; color: #111; padding: 24px; max-width: 720px;">
      <h1 style="font-size: 18px; margin: 0 0 8px;">ATLAS Intelligence Brief</h1>
      <pre style="white-space: pre-wrap; font-family: ui-monospace, monospace; font-size: 10px; line-height: 1.45;">${markdown.replace(/</g, '&lt;')}</pre>
    </div>
  `
  const wrap = document.createElement('div')
  wrap.innerHTML = html
  wrap.style.position = 'fixed'
  wrap.style.left = '-9999px'
  document.body.appendChild(wrap)

  try {
    const mod = await import('html2pdf.js')
    const html2pdf = mod.default || mod
    await html2pdf()
      .set({
        margin: 10,
        filename: `atlas-brief-${new Date().toISOString().slice(0, 10)}.pdf`,
        image: { type: 'jpeg', quality: 0.92 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      })
      .from(wrap.firstElementChild)
      .save()
  } finally {
    document.body.removeChild(wrap)
  }
}
