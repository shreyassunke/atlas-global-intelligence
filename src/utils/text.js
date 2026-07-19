/**
 * Text sanitation for event/feed content.
 * Upstream feeds (WHO RSS, GDACS, ReliefWeb) often ship double-encoded HTML —
 * literal `&lt;p&gt;` strings — which must never render raw in the UI.
 */

const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '\u2013',
  mdash: '\u2014',
  hellip: '\u2026',
  rsquo: '\u2019',
  lsquo: '\u2018',
  rdquo: '\u201d',
  ldquo: '\u201c',
}

function decodeEntitiesOnce(str) {
  return str.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X'
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : match
    }
    const named = NAMED_ENTITIES[body.toLowerCase()]
    return named !== undefined ? named : match
  })
}

/**
 * Decode HTML entities (handles double-encoding like `&amp;lt;p&amp;gt;`),
 * strip any resulting HTML tags, and collapse whitespace.
 * Safe in workers (no DOM dependency).
 * @param {string} str
 * @returns {string}
 */
export function cleanEventText(str) {
  if (str == null) return ''
  let s = String(str)
  for (let i = 0; i < 4; i++) {
    const next = decodeEntitiesOnce(s)
    if (next === s) break
    s = next
  }
  // Strip tags after decoding so `&lt;p&gt;text&lt;/p&gt;` becomes plain text.
  s = s.replace(/<[^>]*>/g, ' ')
  return s.replace(/\s+/g, ' ').trim()
}

/**
 * Compact relative-time label: "now", "5m ago", "3h ago", "4d ago".
 * @param {string|number|Date} timestamp
 * @returns {string}
 */
export function timeAgoLabel(timestamp) {
  const t = new Date(timestamp).getTime()
  if (!Number.isFinite(t)) return ''
  const diff = Date.now() - t
  if (diff < 60_000) return 'now'
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}
