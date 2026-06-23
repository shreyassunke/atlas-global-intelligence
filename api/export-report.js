/**
 * POST /api/export-report
 *
 * Body: { blueprint: ReportBlueprint, format?: 'pdf' | 'html' | 'markdown' | 'json' }
 *
 * Compiles industry Handlebars templates and returns PDF (Chromium) or
 * parallel HTML / Markdown / JSON downloads for client-side fallback.
 */
import { renderReportHtml, htmlToPdf } from './_lib/reportEngine.js'
import { blueprintToMarkdown } from '../src/core/reportBlueprint.js'
import { blueprintToStixBundle } from '../src/core/stixExport.js'
import { createExportJob } from './_lib/exportJobStore.js'

export const config = {
  runtime: 'nodejs',
  maxDuration: 60,
  memory: 1024,
}

function setCors(res) {
  const allowed = process.env.ATLAS_ALLOWED_ORIGIN || '*'
  res.setHeader('Access-Control-Allow-Origin', allowed === '*' ? '*' : allowed)
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'content-type')
  res.setHeader('Vary', 'Origin')
}

function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body
  return await new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (c) => {
      data += c
      if (data.length > 2 * 1024 * 1024) {
        reject(new Error('payload too large'))
        req.destroy()
      }
    })
    req.on('end', () => {
      if (!data) return resolve({})
      try { resolve(JSON.parse(data)) } catch (e) { reject(e) }
    })
    req.on('error', reject)
  })
}

export default async function handler(req, res) {
  setCors(res)

  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'POST required' })
    return
  }

  try {
    const body = await readJsonBody(req)
    const blueprint = body.blueprint || body
    const format = String(body.format || 'pdf').toLowerCase()

    if (!blueprint?.templateId || !blueprint?.sections) {
      sendJson(res, 400, { error: 'Invalid blueprint — templateId and sections required' })
      return
    }

    if (format === 'json') {
      sendJson(res, 200, blueprint)
      return
    }

    if (format === 'stix') {
      const bundle = blueprintToStixBundle(blueprint)
      res.statusCode = 200
      res.setHeader('content-type', 'application/stix+json; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename="atlas-report-${Date.now()}.stix.json"`)
      res.end(JSON.stringify(bundle, null, 2))
      return
    }

    // Async PDF job queue — heavy renders with map snapshots
    if (format === 'pdf' && body.async === true) {
      const { id, storage, warning } = await createExportJob({ format: 'pdf', blueprint })
      sendJson(res, 202, {
        jobId: id,
        status: 'pending',
        pollUrl: `/api/export-report-status?id=${id}`,
        storage,
        ...(warning ? { warning } : {}),
      })
      return
    }

    if (format === 'markdown') {
      const md = blueprintToMarkdown(blueprint)
      res.statusCode = 200
      res.setHeader('content-type', 'text/markdown; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename="atlas-report-${Date.now()}.md"`)
      res.end(md)
      return
    }

    const html = await renderReportHtml(blueprint)

    if (format === 'html') {
      res.statusCode = 200
      res.setHeader('content-type', 'text/html; charset=utf-8')
      res.end(html)
      return
    }

    // PDF — try Chromium; fall back to HTML payload on failure
    try {
      const pdf = await htmlToPdf(html)
      res.statusCode = 200
      res.setHeader('content-type', 'application/pdf')
      res.setHeader('Content-Disposition', `attachment; filename="atlas-report-${Date.now()}.pdf"`)
      res.end(pdf)
    } catch (pdfErr) {
      console.error('[export-report] PDF render failed:', pdfErr?.message || pdfErr)
      sendJson(res, 503, {
        error: 'PDF generation unavailable',
        message: pdfErr?.message || 'Chromium launch failed',
        fallback: 'html',
        html,
      })
    }
  } catch (err) {
    console.error('[export-report]', err)
    sendJson(res, 500, { error: err?.message || 'Export failed' })
  }
}
