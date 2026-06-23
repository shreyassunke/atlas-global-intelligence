/**
 * TheNewsAPI adapter - headlines endpoint.
 * https://www.thenewsapi.com/documentation
 *
 * Production uses /api/news-proxy (server-side key, no CORS).
 */

import { normalizeTheNewsApiArticle } from '../normalizer'
import { newsProxyUrl, useNewsProxy } from '../../../utils/newsProxyUrl.js'

const THENEWSAPI_COUNTRIES = ['us', 'gb', 'in', 'au', 'ca', 'de', 'fr', 'jp', 'cn', 'br', 'mx', 'za', 'ng', 'eg', 'ae', 'sa', 'il', 'ru', 'ua', 'kr', 'sg', 'hk', 'tw', 'id', 'my', 'th', 'ph', 'pk', 'tr', 'it', 'es', 'nl', 'pl', 'ar', 'co', 'cl', 'pe']
const DEFAULT_LOCALES = ['us', 'gb', 'au', 'in', 'ca', 'de', 'fr', 'jp', 'br', 'mx', 'za', 'ng', 'eg', 'ae', 'sa', 'il', 'ru', 'ua', 'kr', 'sg', 'hk', 'tw', 'id', 'pk', 'tr', 'it', 'es', 'nl', 'ar', 'co', 'cl', 'pe']

const FETCH_TIMEOUT_MS = 8000

export function isRateLimited(res, data) {
  if (res?.status === 429) return true
  if (res?.status === 402) return true
  if (data?.message?.toLowerCase?.().includes('limit')) return true
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
    if (cc && THENEWSAPI_COUNTRIES.includes(cc)) countries.add(cc)
  }
  return Array.from(countries)
}

function flattenHeadlinesResponse(data) {
  const articles = []
  if (!data?.data || typeof data.data !== 'object') return articles
  for (const categoryArticles of Object.values(data.data)) {
    if (Array.isArray(categoryArticles)) {
      for (const a of categoryArticles) {
        const norm = normalizeTheNewsApiArticle(a)
        if (norm) articles.push(norm)
      }
    }
  }
  return articles
}

async function fetchLocale(apiKey, locale, headlinesPerCategory) {
  const params = {
    locale,
    language: 'en',
    headlines_per_category: String(headlinesPerCategory),
  }

  const url = useNewsProxy()
    ? newsProxyUrl('thenewsapi', params)
    : (() => {
        const sp = new URLSearchParams({ ...params, api_token: apiKey })
        return `https://api.thenewsapi.com/v1/news/headlines?${sp}`
      })()

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timer)
    const data = await res.json()
    if (isRateLimited(res, data)) return { rateLimited: true, articles: [] }
    return { rateLimited: false, articles: flattenHeadlinesResponse(data) }
  } catch {
    clearTimeout(timer)
    return { rateLimited: false, articles: [] }
  }
}

export async function fetchTheNewsApi(apiKey, {
  selectedSources = [],
  catalog = [],
  targetArticles = 90,
  headlinesPerCategory = 10,
  maxLocaleRequests = 2,
  localesPerRequest = 4,
} = {}) {
  const hinted = getCountriesFromSources(selectedSources, catalog)
  const localeList = uniq([...hinted, ...DEFAULT_LOCALES]).filter((cc) => THENEWSAPI_COUNTRIES.includes(cc))

  const localeGroups = []
  for (let i = 0; i < localeList.length && localeGroups.length < maxLocaleRequests; i += localesPerRequest) {
    const locale = localeList.slice(i, i + localesPerRequest).join(',')
    if (locale) localeGroups.push(locale)
  }

  const results = await Promise.all(
    localeGroups.map((locale) => fetchLocale(apiKey, locale, headlinesPerCategory)),
  )

  const articles = []
  const seen = new Set()
  for (const result of results) {
    if (result.rateLimited) return { articles: [], rateLimited: true }
    for (const a of result.articles) {
      if (!a?.url || seen.has(a.url)) continue
      seen.add(a.url)
      articles.push(a)
      if (articles.length >= targetArticles) break
    }
    if (articles.length >= targetArticles) break
  }

  return { articles, rateLimited: false }
}
