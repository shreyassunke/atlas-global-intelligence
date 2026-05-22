/**
 * GET /api/bluesky-posts
 * Bluesky Jetstream firehose collector ($0, no key).
 * Collects posts for ~8s via WebSocket, filters crisis/news signals, geocodes by place keywords.
 *
 * Rate: worker polls every 30s; each poll opens a short-lived WS session.
 */

export const config = {
  maxDuration: 30,
}

const COLLECT_MS = 8_000
const WS_OPEN_TIMEOUT_MS = 8_000
const MAX_POSTS = 80

/** Jetstream endpoints — rotate if one fails. */
const JETSTREAM_URLS = [
  'wss://jetstream1.us-west.bsky.network/subscribe?wantedCollections=app.bsky.feed.post',
  'wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.post',
]

const SIGNAL_RE = /\b(war|conflict|explosion|earthquake|flood|attack|protest|election|sanctions|missile|invasion|humanitarian|crisis|breaking|urgent|airstrike|ceasefire|nato|refugee|wildfire|hurricane|cyclone|tsunami|pandemic|outbreak|nuclear|terror|hostage|diplomat|summit|embargo|blockade|occupation|shelling|drone|strike|evacuat|casualt|killed|wounded)\b/i

/** @type {Record<string, { lat: number, lng: number, name: string }>} */
const PLACES = {
  ukraine: { lat: 49, lng: 32, name: 'Ukraine' },
  kyiv: { lat: 50.45, lng: 30.52, name: 'Kyiv' },
  russia: { lat: 60, lng: 100, name: 'Russia' },
  gaza: { lat: 31.5, lng: 34.47, name: 'Gaza' },
  israel: { lat: 31.5, lng: 34.8, name: 'Israel' },
  iran: { lat: 32, lng: 53, name: 'Iran' },
  china: { lat: 35, lng: 105, name: 'China' },
  taiwan: { lat: 23.5, lng: 121, name: 'Taiwan' },
  'united states': { lat: 38, lng: -97, name: 'United States' },
  washington: { lat: 38.9, lng: -77.04, name: 'Washington DC' },
  london: { lat: 51.51, lng: -0.13, name: 'London' },
  france: { lat: 46, lng: 2, name: 'France' },
  germany: { lat: 51, lng: 9, name: 'Germany' },
  india: { lat: 20, lng: 77, name: 'India' },
  syria: { lat: 35, lng: 38, name: 'Syria' },
  lebanon: { lat: 33.8, lng: 35.8, name: 'Lebanon' },
  sudan: { lat: 15, lng: 30, name: 'Sudan' },
  japan: { lat: 36, lng: 138, name: 'Japan' },
  korea: { lat: 37, lng: 127.5, name: 'Korea' },
  turkey: { lat: 39, lng: 35, name: 'Turkey' },
  egypt: { lat: 27, lng: 30, name: 'Egypt' },
  afghanistan: { lat: 33, lng: 65, name: 'Afghanistan' },
  iraq: { lat: 33, lng: 44, name: 'Iraq' },
  libya: { lat: 25, lng: 17, name: 'Libya' },
  mexico: { lat: 23, lng: -102, name: 'Mexico' },
  brazil: { lat: -10, lng: -55, name: 'Brazil' },
}

function geocodeText(text) {
  const lower = (text || '').toLowerCase()
  const keys = Object.keys(PLACES).sort((a, b) => b.length - a.length)
  for (const key of keys) {
    if (lower.includes(key)) return PLACES[key]
  }
  return null
}

/**
 * @param {string} wsUrl
 * @returns {Promise<object[]>}
 */
function collectPosts(wsUrl) {
  return new Promise((resolve, reject) => {
    /** @type {Map<string, object>} */
    const posts = new Map()
    let settled = false
    /** @type {WebSocket | null} */
    let ws = null

    const finish = (result, err) => {
      if (settled) return
      settled = true
      clearTimeout(collectTimer)
      clearTimeout(openTimer)
      try { ws?.close() } catch { /* ignore */ }
      if (err) reject(err)
      else resolve(result)
    }

    const collectTimer = setTimeout(() => {
      finish([...posts.values()])
    }, COLLECT_MS)

    const openTimer = setTimeout(() => {
      if (posts.size > 0) finish([...posts.values()])
      else finish([], new Error('Bluesky Jetstream connection timed out'))
    }, WS_OPEN_TIMEOUT_MS)

    try {
      ws = new WebSocket(wsUrl)
    } catch (err) {
      finish([], err)
      return
    }

    ws.addEventListener('open', () => clearTimeout(openTimer))

    ws.addEventListener('message', (evt) => {
      if (posts.size >= MAX_POSTS) return
      try {
        const msg = JSON.parse(String(evt.data))
        const commit = msg?.commit
        if (commit?.operation !== 'create') return
        if (commit?.collection !== 'app.bsky.feed.post') return
        const record = commit.record
        const text = record?.text || ''
        if (!text || text.length < 20) return
        if (!SIGNAL_RE.test(text)) return

        const geo = geocodeText(text)
        if (!geo) return

        const uri = `at://${msg.did}/${commit.collection}/${commit.rkey}`
        if (posts.has(uri)) return

        posts.set(uri, {
          uri,
          text: text.slice(0, 280),
          author: msg.did || '',
          createdAt: record.createdAt || new Date().toISOString(),
          lat: geo.lat,
          lng: geo.lng,
          latApproximate: true,
          locationName: geo.name,
          likes: 0,
          reposts: 0,
          replies: 0,
        })
      } catch { /* ignore malformed */ }
    })

    ws.addEventListener('error', () => {
      if (posts.size > 0) finish([...posts.values()])
      else finish([], new Error('Bluesky Jetstream WebSocket error'))
    })

    ws.addEventListener('close', () => {
      finish([...posts.values()])
    })
  })
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'content-type',
      },
    })
  }

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let lastErr
  for (const url of JETSTREAM_URLS) {
    try {
      const posts = await collectPosts(url)
      return new Response(JSON.stringify({ posts, count: posts.length }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=15',
        },
      })
    } catch (err) {
      lastErr = err
    }
  }

  return new Response(JSON.stringify({
    posts: [],
    warning: lastErr?.message || 'Bluesky Jetstream temporarily unavailable — will retry',
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    },
  })
}
