/**
 * Vite dev middleware — serves /api/* handlers without requiring `vercel dev`.
 * Loads `.env` / `.env.local` so server-only keys work in `npm run dev`.
 */
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { loadEnv } from 'vite'

const pluginRoot = path.dirname(fileURLToPath(import.meta.url))

/** @param {import('http').IncomingMessage} req */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

/** @param {import('http').IncomingMessage} req @param {import('http').ServerResponse} res @param {Response} response */
async function sendWebResponse(req, res, response) {
  res.statusCode = response.status
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'transfer-encoding') return
    res.setHeader(key, value)
  })
  const buf = Buffer.from(await response.arrayBuffer())
  res.end(buf)
}

/** @param {import('http').IncomingMessage} req */
async function toWebRequest(req, url) {
  const method = req.method || 'GET'
  /** @type {Record<string, string>} */
  const headers = {}
  for (const [k, v] of Object.entries(req.headers)) {
    if (v != null) headers[k] = Array.isArray(v) ? v.join(', ') : v
  }
  let body
  if (method !== 'GET' && method !== 'HEAD') {
    body = await readBody(req)
  }
  return new Request(url, { method, headers, body })
}

// `style` selects how the handler is invoked:
//   - 'web'  → Edge-style `handler(Request) => Response` (default)
//   - 'node' → Node-style `handler(req, res)` (Vercel Node serverless functions)
const DEV_API_ROUTES = [
  { method: 'GET', match: /^\/api\/opensky-states\/?$/, module: path.join(pluginRoot, 'api/opensky-states.js') },
  { method: 'GET', match: /^\/api\/celestrak-tle\/?$/, module: path.join(pluginRoot, 'api/celestrak-tle.js') },
  { method: 'GET', match: /^\/api\/aisstream-ships\/?$/, module: path.join(pluginRoot, 'api/aisstream-ships.js') },
  { method: 'GET', match: /^\/api\/nhc-storms\/?$/, module: path.join(pluginRoot, 'api/nhc-storms.js') },
  { method: 'GET', match: /^\/api\/gdacs-rss\/?$/, module: path.join(pluginRoot, 'api/gdacs-rss.js') },
  { methods: ['GET', 'OPTIONS'], match: /^\/api\/feed-proxy\/?$/, module: path.join(pluginRoot, 'api/feed-proxy.js') },
  { methods: ['GET', 'OPTIONS'], match: /^\/api\/gdelt-api\/?$/, module: path.join(pluginRoot, 'api/gdelt-api.js') },
  { methods: ['GET', 'OPTIONS'], match: /^\/api\/gdelt-data\/?$/, module: path.join(pluginRoot, 'api/gdelt-data.js') },
  { methods: ['GET', 'OPTIONS'], match: /^\/api\/news-proxy\/?$/, module: path.join(pluginRoot, 'api/news-proxy.js') },
  { methods: ['GET', 'POST', 'OPTIONS'], match: /^\/api\/feed-snapshots\/?$/, module: path.join(pluginRoot, 'api/feed-snapshots.js') },
  { method: 'POST', match: /^\/api\/overpass-landmarks\/?$/, module: path.join(pluginRoot, 'api/overpass-landmarks.js') },
  // BigQuery proxy (Historical / Imagery / Network tabs). Served here so the
  // main `npm run dev` server fully covers /api and `vercel dev` is optional.
  { methods: ['GET', 'POST', 'OPTIONS'], match: /^\/api\/gdelt-query\/?$/, module: path.join(pluginRoot, 'api/gdelt-query.js'), style: 'node' },
  { methods: ['GET', 'OPTIONS'], match: /^\/api\/indicators\/?$/, module: path.join(pluginRoot, 'api/indicators.js') },
  { methods: ['GET', 'OPTIONS'], match: /^\/api\/bluesky-posts\/?$/, module: path.join(pluginRoot, 'api/bluesky-posts.js') },
  { methods: ['GET', 'OPTIONS'], match: /^\/api\/fact-check-claims\/?$/, module: path.join(pluginRoot, 'api/fact-check-claims.js') },
  { methods: ['GET', 'POST', 'OPTIONS'], match: /^\/api\/entities\/?$/, module: path.join(pluginRoot, 'api/entities.js') },
  { methods: ['POST', 'OPTIONS'], match: /^\/api\/export-report\/?$/, module: path.join(pluginRoot, 'api/export-report.js'), style: 'node' },
  { methods: ['GET', 'OPTIONS'], match: /^\/api\/export-report-status\/?$/, module: path.join(pluginRoot, 'api/export-report-status.js'), style: 'node' },
]

/** @type {Map<string, { default: Function }>} */
const handlerCache = new Map()

async function loadHandler(modulePath) {
  if (handlerCache.has(modulePath)) return handlerCache.get(modulePath)
  const mod = await import(pathToFileURL(modulePath).href)
  handlerCache.set(modulePath, mod)
  return mod
}

export default function atlasApiDevPlugin() {
  return {
    name: 'atlas-api-dev',
    configureServer(server) {
      const env = loadEnv(server.config.mode, server.config.root || process.cwd(), '')
      for (const [key, val] of Object.entries(env)) {
        if (val) process.env[key] = val
      }

      server.middlewares.use(async (req, res, next) => {
        const pathname = (req.url || '').split('?')[0]
        const route = DEV_API_ROUTES.find((r) => {
          const methods = r.methods || [r.method]
          return methods.includes(req.method) && r.match.test(pathname)
        })
        if (!route) return next()

        try {
          const mod = await loadHandler(route.module)
          const handler = mod.default
          if (typeof handler !== 'function') return next()

          if (route.style === 'node') {
            // Vercel Node serverless functions accept the raw (req, res) and
            // write the response themselves, so hand the dev server's objects
            // straight through.
            await handler(req, res)
            return
          }

          const host = req.headers.host || 'localhost:5173'
          const url = `http://${host}${req.url}`
          const webReq = await toWebRequest(req, url)
          const webRes = await handler(webReq)
          await sendWebResponse(req, res, webRes)
        } catch (err) {
          res.statusCode = 502
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: err?.message || 'Dev API handler failed' }))
        }
      })
    },
  }
}
