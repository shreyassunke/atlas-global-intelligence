/**
 * Client-side report export — POST blueprint to /api/export-report.
 */
import { blueprintToMarkdown } from '../core/reportBlueprint.js'
import { blueprintToStixBundle } from '../core/stixExport.js'
import { downloadMarkdownBrief } from '../core/briefExport.js'

const ASYNC_POLL_MS = 1500
const ASYNC_MAX_POLLS = 40

/**
 * @param {import('../core/reportBlueprint.js').ReportBlueprint} blueprint
 * @param {'pdf' | 'html' | 'markdown' | 'json' | 'stix'} format
 * @param {{ async?: boolean }} [options]
 * @returns {Promise<{ ok: boolean, blob?: Blob, error?: string, html?: string, jobId?: string }>}
 */
export async function exportReport(blueprint, format = 'pdf', options = {}) {
  if (format === 'markdown') {
    const md = blueprintToMarkdown(blueprint)
    downloadMarkdownBrief(md, `atlas-report-${blueprint.templateId}-${Date.now()}.md`)
    return { ok: true }
  }

  if (format === 'json') {
    const blob = new Blob([JSON.stringify(blueprint, null, 2)], { type: 'application/json' })
    triggerDownload(blob, `atlas-report-${Date.now()}.json`)
    return { ok: true }
  }

  if (format === 'stix') {
    const bundle = blueprintToStixBundle(blueprint)
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/stix+json' })
    triggerDownload(blob, `atlas-report-${blueprint.templateId}-${Date.now()}.stix.json`)
    return { ok: true }
  }

  if (format === 'pdf' && options.async) {
    return pollAsyncPdfExport(blueprint)
  }

  try {
    const res = await fetch('/api/export-report', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ blueprint, format }),
    })

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}))
      if (errJson.html && format === 'pdf') {
        return { ok: false, error: errJson.message || 'PDF unavailable', html: errJson.html }
      }
      return { ok: false, error: errJson.error || `HTTP ${res.status}` }
    }

    const contentType = res.headers.get('content-type') || ''

    if (contentType.includes('application/pdf')) {
      const blob = await res.blob()
      triggerDownload(blob, `atlas-report-${blueprint.templateId}-${Date.now()}.pdf`)
      return { ok: true, blob }
    }

    if (contentType.includes('text/html')) {
      const html = await res.text()
      if (format === 'html') {
        triggerDownload(new Blob([html], { type: 'text/html' }), `atlas-report-${Date.now()}.html`)
      }
      return { ok: true, html }
    }

    return { ok: true }
  } catch (err) {
    return { ok: false, error: err?.message || 'Export request failed' }
  }
}

/**
 * Queue async PDF job and poll until complete.
 * @param {import('../core/reportBlueprint.js').ReportBlueprint} blueprint
 */
async function pollAsyncPdfExport(blueprint) {
  const createRes = await fetch('/api/export-report', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ blueprint, format: 'pdf', async: true }),
  })

  if (!createRes.ok) {
    const err = await createRes.json().catch(() => ({}))
    return { ok: false, error: err.error || `HTTP ${createRes.status}` }
  }

  const { jobId, pollUrl } = await createRes.json()
  if (!jobId) return { ok: false, error: 'No job ID returned' }

  for (let i = 0; i < ASYNC_MAX_POLLS; i++) {
    await sleep(ASYNC_POLL_MS)
    const statusRes = await fetch(pollUrl || `/api/export-report-status?id=${jobId}`)
    const statusJson = await statusRes.json().catch(() => ({}))

    if (statusJson.status === 'failed') {
      return { ok: false, error: statusJson.error || 'Async export failed', jobId }
    }

    if (statusJson.status === 'complete') {
      const downloadUrl = statusJson.downloadUrl || `/api/export-report-status?id=${jobId}&download=1`
      const pdfRes = await fetch(downloadUrl)
      if (!pdfRes.ok) return { ok: false, error: 'PDF download failed', jobId }
      const blob = await pdfRes.blob()
      triggerDownload(blob, `atlas-report-${blueprint.templateId}-${Date.now()}.pdf`)
      return { ok: true, blob, jobId }
    }
  }

  return { ok: false, error: 'Async export timed out', jobId }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * Client-side PDF fallback via html2pdf when server Chromium unavailable.
 * @param {string} html
 * @param {string} [filename]
 */
export async function exportHtmlAsPdf(html, filename) {
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
        filename: filename || `atlas-report-${Date.now()}.pdf`,
        image: { type: 'jpeg', quality: 0.92 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      })
      .from(wrap.firstElementChild || wrap)
      .save()
    return { ok: true }
  } finally {
    document.body.removeChild(wrap)
  }
}

/**
 * @param {Blob} blob
 * @param {string} filename
 */
function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
