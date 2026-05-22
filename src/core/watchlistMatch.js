import { haversineKm } from './crossSourceMerge'

/**
 * @typedef {'topic'|'entity'|'place'} WatchlistKind
 */

/**
 * @param {import('./eventSchema').AtlasEvent|Object} event
 * @param {{ kind: string, match_value: string, name?: string }} item
 * @returns {boolean}
 */
export function eventMatchesWatchlist(event, item) {
  if (!event || !item?.match_value) return false
  const needle = String(item.match_value).trim().toLowerCase()
  if (!needle) return false

  const kind = (item.kind || 'topic').toLowerCase()

  if (kind === 'place') {
    if (needle.includes(',')) {
      const parts = needle.split(',').map((s) => Number(s.trim()))
      if (parts.length >= 2 && parts.every((n) => Number.isFinite(n))) {
        const [lat, lng, radiusKm = 200] = parts
        if (event.lat == null || event.lng == null) return false
        return haversineKm(lat, lng, event.lat, event.lng) <= radiusKm
      }
    }
    const loc = `${event.location || ''} ${event.country || ''} ${event.title || ''}`.toLowerCase()
    return loc.includes(needle)
  }

  if (kind === 'entity') {
    const blob = [
      event.title,
      event.actor,
      event.entities,
      event.source,
      ...(Array.isArray(event.corroborationSources) ? event.corroborationSources : []),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return blob.includes(needle)
  }

  // topic — keyword in title, summary, source
  const text = [
    event.title,
    event.summary,
    event.description,
    event.source,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return text.includes(needle)
}

/**
 * @param {Object} event
 * @param {Array} watchlists
 * @returns {Array<{ item: Object, event: Object }>}
 */
export function findWatchlistHits(event, watchlists) {
  const hits = []
  for (const item of watchlists) {
    if (item.enabled === false) continue
    if (eventMatchesWatchlist(event, item)) hits.push({ item, event })
  }
  return hits
}
