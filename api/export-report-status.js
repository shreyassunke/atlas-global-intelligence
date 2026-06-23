/**
 * GET /api/export-report-status?id=<jobId>
 * Poll async export job status; triggers lazy processing for pending jobs.
 */
import { renderReportHtml, htmlToPdf } from './_lib/reportEngine.js'
import {
  getExportJob,
  getExportJobResult,
  storeJobResult,
  updateExportJob,
} from './_lib/exportJobStore.js'

export const config = {
  runtime: 'nodejs',
  maxDuration: 60,
  memory: 1024,
}

function setCors(res) {
  const allowed = process.env.ATLAS_ALLOWED_ORIGIN || '*'
  res.setHeader('Access-Control-Allow-Origin', allowed === '*' ? '*' : allowed)
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'content-type')
}

function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

/** @type {Set<string>} */
const processing = new Set()

async function processJob(jobId, job) {
  if (processing.has(jobId)) return
  processing.add(jobId)

  try {
    await updateExportJob(jobId, 'processing')
    const blueprint = job?.blueprint
    if (!blueprint) throw new Error('Missing blueprint in job')

    if (job?.format === 'pdf') {
      const html = await renderReportHtml(blueprint)
      const pdf = await htmlToPdf(html)
      storeJobResult(jobId, pdf, 'application/pdf')
      await updateExportJob(jobId, 'complete')
      return
    }

    throw new Error(`Unsupported async format: ${job?.format}`)
  } catch (err) {
    await updateExportJob(jobId, 'failed', { error: err?.message || 'Export failed' })
  } finally {
    processing.delete(jobId)
  }
}

export default async function handler(req, res) {
  setCors(res)

  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }

  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'GET required' })
    return
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
  const jobId = url.searchParams.get('id')
  if (!jobId) {
    sendJson(res, 400, { error: 'id query param required' })
    return
  }

  const { ok, job, storage } = await getExportJob(jobId)
  if (!ok) {
    sendJson(res, 404, { error: 'Job not found' })
    return
  }

  const status = job.status
  const download = url.searchParams.get('download') === '1'

  if (status === 'pending') {
    void processJob(jobId, job)
    sendJson(res, 202, { id: jobId, status: 'processing', message: 'Export started' })
    return
  }

  if (status === 'processing') {
    sendJson(res, 202, { id: jobId, status: 'processing' })
    return
  }

  if (status === 'failed') {
    sendJson(res, 500, { id: jobId, status: 'failed', error: job.error })
    return
  }

  if (status === 'complete' && download) {
    const result = await getExportJobResult(jobId)
    if (result.ok && result.result) {
      res.statusCode = 200
      res.setHeader('content-type', result.contentType)
      res.setHeader('Content-Disposition', `attachment; filename="atlas-report-${jobId}.pdf"`)
      res.end(result.result)
      return
    }
  }

  sendJson(res, 200, {
    id: jobId,
    status: 'complete',
    downloadUrl: `/api/export-report-status?id=${jobId}&download=1`,
  })
}
