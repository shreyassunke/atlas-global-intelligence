/**
 * YouTube Data API v3 adapter — search + optional live filter.
 * Production uses /api/news-proxy (server-side key, no CORS).
 */

import { newsProxyUrl, useNewsProxy } from '../../../utils/newsProxyUrl.js'

const FETCH_TIMEOUT_MS = 8000
const DEFAULT_QUERIES = ['breaking news live', 'world conflict live', 'geopolitical crisis']
const MAX_RESULTS_PER_QUERY = 8

function fetchWithTimeout(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer))
}

function normalizeVideoItem(item) {
  const snippet = item.snippet || {}
  const videoId = typeof item.id === 'object' ? item.id?.videoId : item.id
  if (!videoId) return null

  const isLive = snippet.liveBroadcastContent === 'live'
  const thumbnails = snippet.thumbnails || {}
  const thumb = thumbnails.high?.url || thumbnails.medium?.url || thumbnails.default?.url || ''

  return {
    title: snippet.title || '',
    description: snippet.description || '',
    url: `https://www.youtube.com/watch?v=${videoId}`,
    publishedAt: snippet.publishedAt || new Date().toISOString(),
    source: {
      id: `yt-${snippet.channelId || 'unknown'}`,
      name: snippet.channelTitle || 'YouTube',
    },
    mediaType: 'video',
    thumbnailUrl: thumb,
    isLive,
  }
}

function buildSearchUrl(apiKey, q, maxPerQuery) {
  const params = {
    part: 'snippet',
    q,
    type: 'video',
    order: 'date',
    maxResults: String(maxPerQuery),
    relevanceLanguage: 'en',
  }
  if (useNewsProxy()) return newsProxyUrl('youtube', params)
  const sp = new URLSearchParams({ ...params, key: apiKey })
  return `https://www.googleapis.com/youtube/v3/search?${sp}`
}

export async function fetchYouTubeVideos(apiKey, { queries, maxPerQuery = MAX_RESULTS_PER_QUERY } = {}) {
  const hasKey = useNewsProxy() || apiKey
  if (!hasKey) return { articles: [], rateLimited: false }

  const searchQueries = queries && queries.length > 0
    ? queries
    : (import.meta.env.VITE_YOUTUBE_SEARCH_QUERIES || '').split(',').map((s) => s.trim()).filter(Boolean)

  const effectiveQueries = searchQueries.length > 0 ? searchQueries : DEFAULT_QUERIES

  const articles = []
  const seen = new Set()

  const fetches = effectiveQueries.map((q) =>
    fetchWithTimeout(buildSearchUrl(apiKey, q, maxPerQuery))
      .then(async (res) => {
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          if (import.meta.env.DEV) {
            console.warn(
              '[TATVA] YouTube search failed:',
              res.status,
              data?.error?.message || data?.error || res.statusText,
            )
          }
          return null
        }
        if (data.error && import.meta.env.DEV) {
          console.warn('[TATVA] YouTube API error:', data.error)
        }
        if (!data.items?.length) return null
        for (const item of data.items) {
          const norm = normalizeVideoItem(item)
          if (norm && !seen.has(norm.url)) {
            seen.add(norm.url)
            articles.push(norm)
          }
        }
      })
      .catch((err) => {
        if (import.meta.env.DEV) console.warn('[TATVA] YouTube search request failed:', err?.message || err)
        return null
      }),
  )

  await Promise.allSettled(fetches)

  return { articles, rateLimited: false }
}
