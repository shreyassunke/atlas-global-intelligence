/**
 * GET /api/gdelt-data?file=gdeltv2/lastupdate.txt
 *
 * Proxies data.gdeltproject.org over HTTP (mixed-content safe on HTTPS pages).
 * Also used for VGKG zip downloads after allowlist validation.
 */

import {
  CORS_HEADERS,
  jsonResponse,
  optionsResponse,
  upstreamFetch,
} from './_lib/proxyCommon.js'

export const config = { runtime: 'edge' }

const FILE_RE = /^gdeltv2(?:_[a-z]+)?\/[\w./-]+$/
const MAX_BYTES = 128 * 1024 * 1024

export default async function handler(req) {
  if (req.method === 'OPTIONS') return optionsResponse()
  if (req.method !== 'GET') return jsonResponse(405, { error: 'method not allowed' })

  const url = new URL(req.url)
  const file = (url.searchParams.get('file') || '').replace(/^\/+/, '')
  if (!file || !FILE_RE.test(file) || file.includes('..')) {
    return jsonResponse(400, { error: 'invalid file path' })
  }

  const upstreamUrl = `http://data.gdeltproject.org/${file}`

  try {
    const upstream = await upstreamFetch(upstreamUrl, { timeoutMs: 60_000 })
    if (!upstream.ok) {
      return jsonResponse(upstream.status, {
        error: 'upstream failed',
        file,
        status: upstream.status,
      })
    }

    const len = Number(upstream.headers.get('content-length') || 0)
    if (len > MAX_BYTES) {
      return jsonResponse(413, { error: 'file too large', file, bytes: len })
    }

    const body = await upstream.arrayBuffer()
    if (body.byteLength > MAX_BYTES) {
      return jsonResponse(413, { error: 'file too large', file, bytes: body.byteLength })
    }

    const contentType = upstream.headers.get('content-type')
      || (file.endsWith('.zip') ? 'application/zip' : 'text/plain; charset=utf-8')

    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        ...CORS_HEADERS,
        'Cache-Control': file.endsWith('.txt')
          ? 'public, max-age=60, stale-while-revalidate=300'
          : 'public, max-age=900, stale-while-revalidate=3600',
      },
    })
  } catch (err) {
    return jsonResponse(502, { error: err?.message || 'gdelt data proxy failed', file })
  }
}
