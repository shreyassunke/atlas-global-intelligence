/**
 * GNews API adapter - top-headlines endpoint.
 * https://docs.gnews.io/
 *
 * Production uses /api/news-proxy (server-side key, no CORS).
 */

import { normalizeGNewsArticle } from '../normalizer'
import { newsProxyUrl, useNewsProxy } from '../../../utils/newsProxyUrl.js'

const GNEWS_COUNTRIES = ['us', 'gb', 'in', 'au', 'ca', 'de', 'fr', 'jp', 'cn', 'br', 'mx', 'za', 'ng', 'eg', 'ke', 'ae', 'sa', 'il', 'ru', 'ua', 'kr', 'sg', 'hk', 'tw', 'id', 'my', 'th', 'ph', 'pk', 'tr', 'it', 'es', 'nl', 'pl', 'se', 'no', 'ar', 'co', 'cl', 'pe']
const DEFAULT_CATEGORIES = ['world', 'general', 'business']

const BATCH_CONCURRENCY = 2
const FETCH_TIMEOUT_MS = 8000

export function isRateLimited(res, data) {
  if (res?.status === 429) return true
  if (data?.errors) return true
  return false
}

function uniq(arr) {
  return Array.from(new Set(arr.filter(Boolean)))
}

function getCountriesFromSources(selectedSources, catalog) {
  const countries = new Set()
  for (const s of selectedSources) {
    if (s.type === 'dimension') continue
    const meta = catalog?.find((c) => c.id === s.id)
    const cc = (meta?.country || '').toLowerCase()
    if (cc && GNEWS_COUNTRIES.includes(cc)) countries.add(cc)
  }
  return Array.from(countries)
}

async function fetchOne(apiKey, country, category, maxPerRequest) {
  const params = { category, max: String(maxPerRequest), lang: 'en' }
  if (country) params.country = country

  const url = useNewsProxy()
    ? newsProxyUrl('gnews', params)
    : (() => {
        const sp = new URLSearchParams({ ...params, apikey: apiKey })
        return `https://gnews.io/api/v4/top-headlines?${sp}`
      })()

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timer)
    const data = await res.json()
    if (isRateLimited(res, data)) return { rateLimited: true, articles: [] }
    const articles = []
    if (Array.isArray(data.articles)) {
      for (const a of data.articles) {
        const norm = normalizeGNewsArticle(a)
        if (norm?.url) {
          if (country && norm.source) norm.source.country = country
          articles.push(norm)
        }
      }
    }
    return { rateLimited: false, articles }
  } catch {
    clearTimeout(timer)
    return { rateLimited: false, articles: [] }
  }
}

export async function fetchGNews(apiKey, {
  selectedSources = [],
  catalog = [],
  targetArticles = 90,
  maxCountries = 6,
  maxPerRequest = 10,
  categories = DEFAULT_CATEGORIES,
} = {}) {
  const hintedCountries = getCountriesFromSources(selectedSources, catalog)
  const countries = uniq([...hintedCountries, ...GNEWS_COUNTRIES]).slice(0, maxCountries)

  const requestPlan = []
  if (hintedCountries.length < 2) {
    requestPlan.push({ country: undefined, category: 'world' })
    requestPlan.push({ country: undefined, category: 'general' })
  }
  for (const country of countries) {
    for (const category of categories) {
      requestPlan.push({ country, category })
    }
  }

  const articles = []
  const seen = new Set()

  for (let i = 0; i < requestPlan.length; i += BATCH_CONCURRENCY) {
    if (articles.length >= targetArticles) break
    const batch = requestPlan.slice(i, i + BATCH_CONCURRENCY)
    const results = await Promise.all(
      batch.map(({ country, category }) => fetchOne(apiKey, country, category, maxPerRequest)),
    )
    for (const result of results) {
      if (result.rateLimited) return { articles: [], rateLimited: true }
      for (const a of result.articles) {
        if (seen.has(a.url)) continue
        seen.add(a.url)
        articles.push(a)
      }
    }
  }

  return { articles, rateLimited: false }
}
