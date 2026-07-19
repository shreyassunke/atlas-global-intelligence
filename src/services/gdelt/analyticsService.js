/**
 * GDELT DOC 2.0 API — timeline, tone, source-country, tone histogram, word cloud.
 * https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/
 *
 * This module owns DOC-specific response parsing. Query vocabulary and
 * transport live in `./gdeltQueries.js` and `./gdeltHttp.js`.
 */

import { buildGdeltUrl, fetchGdeltJson } from './gdeltHttp.js'
import {
  artlistCacheKey,
  getCachedArticles,
  setCachedArticles,
} from './docArticlesCache.js'
import {
  DIMENSION_GDELT_QUERIES,
  buildGdeltDocQuery,
  formatGdeltDateTick,
  timespanFromTimeFilter,
} from './gdeltQueries.js'

export const GDELT_DOC_BASE = 'https://api.gdeltproject.org/api/v2/doc/doc'

// Re-exports for backwards compatibility with existing callers.
export { DIMENSION_GDELT_QUERIES, buildGdeltDocQuery, formatGdeltDateTick, timespanFromTimeFilter }

function buildDocUrl(query, mode, timespan, extraParams = {}) {
  return buildGdeltUrl(GDELT_DOC_BASE, {
    query: String(query || '').trim(),
    mode,
    format: 'json',
    timespan,
    ...extraParams,
  })
}

function fetchDocJson(query, mode, timespan, opts, extraParams) {
  const priority = opts?.priority || 'interactive'
  return fetchGdeltJson(buildDocUrl(query, mode, timespan, extraParams), {
    ...opts,
    priority,
  })
}

/** GDELT timeline JSON: `{ timeline: [{ series, data: [{ date, value, norm? }] }] }` */
export function parseTimelineJson(json) {
  const timeline = json?.timeline
  if (!Array.isArray(timeline) || timeline.length === 0) {
    return { dates: [], series: [] }
  }
  const firstData = timeline[0]?.data
  if (!Array.isArray(firstData)) return { dates: [], series: [] }
  const dates = firstData.map((d) => d.date)
  const series = timeline.map((s) => ({
    name: String(s.series ?? 'series'),
    values: (s.data || []).map((d) => (Number.isFinite(d.value) ? d.value : parseFloat(d.value) || 0)),
  }))
  return { dates, series }
}

/** Aggregate each country series across the whole window (share of attention). */
export function aggregateSourceCountryTotals(parsed) {
  const { dates, series } = parsed
  if (!dates.length || !series.length) return []
  const totals = series.map((s) => ({
    name: s.name,
    value: s.values.reduce((a, b) => a + Math.abs(b), 0),
  }))
  totals.sort((a, b) => b.value - a.value)
  return totals.slice(0, 14)
}

function parseToneChartJson(json) {
  const candidates = [json?.tonechart, json?.toneChart, json?.histogram, json?.chart].find((x) => Array.isArray(x))
  if (!candidates) return []
  return candidates
    .map((row) => {
      if (typeof row !== 'object' || row === null) return null
      const bin = row.bin ?? row.tone ?? row.x ?? row.label ?? row.range
      const count = row.count ?? row.value ?? row.y ?? row.freq
      return {
        bin: bin != null ? String(bin) : '',
        count: Number.isFinite(count) ? count : parseFloat(count) || 0,
      }
    })
    .filter(Boolean)
}

function parseWordCloudJson(json) {
  const candidates = [json?.wordcloud, json?.wordCloud, json?.themes, json?.words].find((x) => Array.isArray(x))
  if (!candidates) return []
  return candidates
    .map((row) => {
      if (typeof row !== 'object' || row === null) return null
      const word = row.word ?? row.term ?? row.label ?? row.theme
      const weight = row.weight ?? row.count ?? row.value ?? row.score
      if (!word) return null
      return {
        word: String(word),
        weight: Number.isFinite(weight) ? weight : parseFloat(weight) || 0,
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 48)
}

/** GDELT DOC ArtList JSON: `{ articles: [{ title, url, domain, seendate, ... }] }` */
function parseArticleListJson(json) {
  const rows = [json?.articles, json?.Articles, json?.results].find((x) => Array.isArray(x)) || []
  return rows
    .map((row) => {
      if (typeof row !== 'object' || row === null) return null
      const url = row.url ?? row.URL ?? row.documentIdentifier ?? ''
      if (!url) return null
      return {
        title: String(row.title ?? row.Title ?? url),
        url: String(url),
        domain: String(row.domain ?? row.Domain ?? row.sourceCommonName ?? ''),
        seendate: String(row.seendate ?? row.date ?? row.Date ?? ''),
        sourcecountry: String(row.sourcecountry ?? row.sourceCountry ?? ''),
        language: String(row.language ?? row.Lang ?? ''),
        socialimage: String(row.socialimage ?? row.socialImage ?? ''),
      }
    })
    .filter(Boolean)
}

/**
 * DOC article list (mode=artlist) with L0/L1 SWR + stale-if-error.
 * @returns {Promise<object[] | { articles: object[], meta: object }>}
 */
export async function fetchDocArticles(
  query,
  timespan,
  {
    maxrecords = 12,
    signal,
    priority = 'interactive',
    /** When true, return `{ articles, meta }` instead of a bare array. */
    withMeta = false,
    /** Skip network when a fresh cache hit exists; serve stale + revalidate. */
    allowStale = true,
  } = {},
) {
  const capped = Math.max(1, Math.min(75, Number(maxrecords) || 12))
  const sort = 'hybridrel'
  const key = artlistCacheKey(query, timespan, capped, sort)
  const cached = await getCachedArticles(key)

  const wrap = (articles, meta) => (withMeta ? { articles, meta } : articles)

  if (cached?.fresh && Array.isArray(cached.articles)) {
    return wrap(cached.articles.slice(0, capped), {
      cacheLayer: cached.layer,
      stale: false,
      fromCache: true,
    })
  }

  // Stale-while-revalidate: paint immediately, refresh cache in background.
  if (allowStale && cached?.stale && Array.isArray(cached.articles) && cached.articles.length) {
    void (async () => {
      try {
        const json = await fetchDocJson(
          query,
          'artlist',
          timespan,
          { priority },
          { maxrecords: capped, sort },
        )
        await setCachedArticles(key, parseArticleListJson(json).slice(0, capped))
      } catch {
        /* keep stale */
      }
    })()
    return wrap(cached.articles.slice(0, capped), {
      cacheLayer: cached.layer,
      stale: true,
      fromCache: true,
      revalidating: true,
    })
  }

  try {
    const json = await fetchDocJson(
      query,
      'artlist',
      timespan,
      { signal, priority },
      { maxrecords: capped, sort },
    )
    const articles = parseArticleListJson(json).slice(0, capped)
    await setCachedArticles(key, articles)
    return wrap(articles, {
      cacheLayer: 'network',
      stale: false,
      fromCache: false,
    })
  } catch (err) {
    if (err?.name === 'AbortError') throw err
    // Stale-if-error: prefer last-good over a hard failure.
    if (allowStale && cached?.articles?.length) {
      return wrap(cached.articles.slice(0, capped), {
        cacheLayer: cached.layer,
        stale: true,
        fromCache: true,
        error: err?.message || String(err),
      })
    }
    throw err
  }
}

/**
 * Warm ArtList cache without throwing (intent prefetch).
 */
export async function prefetchDocArticles(query, timespan, opts = {}) {
  try {
    return await fetchDocArticles(query, timespan, {
      maxrecords: 14,
      priority: 'interactive',
      ...opts,
    })
  } catch {
    return null
  }
}

export async function fetchTimelineVol(query, timespan, opts) {
  return parseTimelineJson(await fetchDocJson(query, 'timelinevol', timespan, opts))
}

export async function fetchTimelineTone(query, timespan, opts) {
  return parseTimelineJson(await fetchDocJson(query, 'timelinetone', timespan, opts))
}

export async function fetchSourceCountries(query, timespan, opts) {
  const parsed = parseTimelineJson(await fetchDocJson(query, 'timelinesourcecountry', timespan, opts))
  return aggregateSourceCountryTotals(parsed)
}

export async function fetchToneChart(query, timespan, opts) {
  return parseToneChartJson(await fetchDocJson(query, 'tonechart', timespan, opts))
}

export async function fetchWordCloud(query, timespan, opts) {
  return parseWordCloudJson(await fetchDocJson(query, 'wordcloudenglish', timespan, opts))
}

/**
 * Parallel bundle for the analytics HUD. Partial failures are collected in
 * `errors` so the panel can render what succeeded.
 */
export async function fetchGdeltAnalyticsBundle(query, timespan, opts) {
  const keys = ['volume', 'toneTimeline', 'sourceCountries', 'toneBins', 'words']
  const fns = [
    () => fetchTimelineVol(query, timespan, opts),
    () => fetchTimelineTone(query, timespan, opts),
    () => fetchSourceCountries(query, timespan, opts),
    () => fetchToneChart(query, timespan, opts),
    () => fetchWordCloud(query, timespan, opts),
  ]
  const settled = await Promise.allSettled(fns.map((fn) => fn()))
  const out = {
    volume: { dates: [], series: [] },
    toneTimeline: { dates: [], series: [] },
    sourceCountries: [],
    toneBins: [],
    words: [],
    errors: [],
  }
  settled.forEach((res, i) => {
    const key = keys[i]
    if (res.status === 'fulfilled') out[key] = res.value
    else out.errors.push({ key, message: res.reason?.message || String(res.reason) })
  })
  return out
}
