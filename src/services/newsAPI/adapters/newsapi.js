/**
 * NewsAPI adapter - top-headlines and everything endpoints.
 * https://newsapi.org/docs
 *
 * Production uses /api/news-proxy (server-side key, no CORS).
 */

import { normalizeNewsApiArticle } from '../normalizer'
import { newsProxyUrl, useNewsProxy } from '../../../utils/newsProxyUrl.js'

const SOURCES_PER_REQUEST = 20
const FETCH_TIMEOUT_MS = 8000

export function isRateLimited(res, data) {
  if (res?.status === 429) return true
  if (res?.status === 426) return true
  if (data?.status === 'error' && ['rateLimited', 'apiKeyExhausted', 'apiKeyInvalid', 'apiKeyDisabled'].includes(data?.code)) {
    return true
  }
  return false
}

function fetchWithTimeout(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer))
}

function buildUrl(apiKey, endpoint, params) {
  if (useNewsProxy()) {
    return newsProxyUrl('newsapi', { endpoint, ...params })
  }
  const sp = new URLSearchParams(params)
  sp.set('apiKey', apiKey)
  return `https://newsapi.org/v2/${endpoint}?${sp}`
}

export async function fetchNewsApi(apiKey, { standardSources = [], dimensions = [], pages = 1 } = {}) {
  const articles = []
  const fetches = []

  if (standardSources.length > 0) {
    for (let i = 0; i < standardSources.length; i += SOURCES_PER_REQUEST) {
      const chunk = standardSources.slice(i, i + SOURCES_PER_REQUEST)
      for (let page = 1; page <= pages; page += 1) {
        fetches.push(
          fetchWithTimeout(
            buildUrl(apiKey, 'top-headlines', {
              sources: chunk.join(','),
              pageSize: '100',
              page: String(page),
            }),
          ),
        )
      }
    }
  }

  if (dimensions.length > 0) {
    for (let page = 1; page <= pages; page += 1) {
      fetches.push(
        fetchWithTimeout(
          buildUrl(apiKey, 'everything', {
            dimensions: dimensions.join(','),
            sortBy: 'publishedAt',
            pageSize: '100',
            page: String(page),
          }),
        ),
      )
    }
  }

  const responses = await Promise.all(fetches.map((p) => p.catch(() => null)))

  for (const res of responses) {
    if (!res) continue
    const data = await res.json()
    if (isRateLimited(res, data)) {
      return { articles: [], rateLimited: true }
    }
    if (data.status === 'ok' && Array.isArray(data.articles)) {
      for (const a of data.articles) {
        const norm = normalizeNewsApiArticle(a)
        if (norm) articles.push(norm)
      }
    }
  }

  return { articles, rateLimited: false }
}
