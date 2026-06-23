import { DIMENSION_LABELS, PRIORITY_LABELS, formatToneScore } from './eventSchema'
import { buildShareUrl } from './urlState'
import { eventSourceToGlobeDataLayerKey, hasPreciseGeolocation } from './globeLayers'

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
    if (!hasPreciseGeolocation(evt)) continue
    const layerKey = eventSourceToGlobeDataLayerKey(evt)
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
 * Phase 5 — Dossier brief: renders the composed dossier (trend, live
 * signals, narrative, evidence) rather than the visible-pin snapshot.
 *
 * @param {Object} d
 * @param {{ fips, iso, name }} d.target
 * @param {{ avgGoldstein?: number, events?: number }|null} d.stability
 * @param {{ zScore: number, date: string }|null} d.surge
 * @param {Array<{ x: string, v: number }>} d.volumeRows
 * @param {Array<{ x: string, v: number }>} d.toneRows
 * @param {Array} d.signals — store events scoped to the country
 * @param {Array} d.sentences — Context API sentences
 * @param {Array<{ name, value }>} d.sourceCountries
 * @param {Array} d.articles — DOC artlist evidence
 * @param {Array} d.clips — TV clip evidence
 * @param {string} d.timeFilter
 * @param {string} [d.shareUrl] — deep link with ?dossier= (caller builds from full view state)
 * @returns {string}
 */
export function buildDossierBriefMarkdown(d) {
  const now = new Date()
  const name = d.target?.name || 'Unknown'
  const code = d.target?.iso || d.target?.fips || ''
  const shareUrl = d.shareUrl || ''

  const lines = [
    `# ATLAS Dossier — ${name}${code ? ` (${code})` : ''}`,
    '',
    `Generated: ${now.toISOString()}`,
    `Window: ${d.timeFilter || 'live'}`,
    shareUrl ? `Shareable link: ${shareUrl}` : '',
    '',
    '## Stability',
  ]

  if (d.stability) {
    const g = Number(d.stability.avgGoldstein)
    lines.push(
      `- Avg Goldstein (5y): ${Number.isFinite(g) ? g.toFixed(2) : '—'} (−10 conflict … +10 cooperation)`,
      `- Events (5y): ${Number(d.stability.events || 0).toLocaleString()}`,
    )
  } else {
    lines.push('_No stability data (BigQuery proxy unavailable)._')
  }

  lines.push('', '## Activity surge')
  if (d.surge && Number.isFinite(d.surge.zScore)) {
    lines.push(`- Latest z-score vs 30-day baseline: ${d.surge.zScore.toFixed(2)} (${d.surge.date || 'latest day'})`)
  } else {
    lines.push('_No surge data._')
  }

  const volTail = (d.volumeRows || []).slice(-7)
  if (volTail.length) {
    lines.push('', '## Coverage volume (last points)')
    for (const r of volTail) lines.push(`- ${r.x}: ${r.v}`)
  }

  lines.push('', `## Live signals (${(d.signals || []).length})`, '')
  if (!d.signals?.length) {
    lines.push('_No live events scoped to this country._')
  } else {
    for (const evt of d.signals.slice(0, 25)) {
      const dim = DIMENSION_LABELS[evt.dimension] || evt.dimension
      const pri = PRIORITY_LABELS[evt.priority] || evt.priority
      const corr = evt.corroborationScore != null ? ` · corroboration ${Math.round(evt.corroborationScore * 100)}%` : ''
      lines.push(
        `- **${evt.title || 'Untitled'}** — ${pri} · ${dim} · ${evt.source || 'unknown'}${corr}`,
      )
    }
  }

  if (d.sentences?.length) {
    lines.push('', '## Narrative (Context sentences)', '')
    for (const s of d.sentences.slice(0, 8)) {
      lines.push(`> ${s.text}`, s.url ? `> — [${s.domain || s.url}](${s.url})` : '', '')
    }
  }

  if (d.sourceCountries?.length) {
    lines.push('', '## Who is covering this', '')
    for (const sc of d.sourceCountries.slice(0, 10)) {
      lines.push(`- ${sc.name}: ${Math.round(sc.value)}`)
    }
  }

  if (d.articles?.length) {
    lines.push('', '## Evidence — articles', '')
    for (const a of d.articles.slice(0, 12)) {
      lines.push(`- [${a.title || a.url}](${a.url})${a.domain ? ` — ${a.domain}` : ''}`)
    }
  }

  if (d.clips?.length) {
    lines.push('', '## Evidence — TV clips', '')
    for (const c of d.clips.slice(0, 8)) {
      const label = [c.station, c.show].filter(Boolean).join(' · ')
      lines.push(`- ${label || 'Clip'}${c.archiveUrl ? ` — [archive](${c.archiveUrl})` : ''}`)
    }
  }

  lines.push('', '---', '_Client-side dossier snapshot from ATLAS. Verify critical claims against primary sources._')
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
