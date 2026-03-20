/**
 * Extract YouTube video ID from common watch / short / embed URLs.
 */
/** Decode `&#39;` etc. from API titles for display */
export function decodeHtmlEntities(str) {
  if (!str || typeof str !== 'string') return ''
  if (typeof document === 'undefined') return str
  const t = document.createElement('textarea')
  t.innerHTML = str
  return t.value
}

/**
 * Decode HTML entities in news titles/descriptions (YouTube & RSS often send `&#39;`, `&amp;`, etc.).
 * Runs decode repeatedly to handle double-encoded strings like `&amp;#39;`.
 */
export function normalizeNewsText(str) {
  if (str == null) return ''
  let s = String(str)
  for (let i = 0; i < 4; i++) {
    const next = decodeHtmlEntities(s)
    if (next === s) break
    s = next
  }
  return s.replace(/\s+/g, ' ').trim()
}

/**
 * Guess embed frame aspect: Shorts are 9:16; standard uploads & live are 16:9.
 * Search/API URLs are often /watch?v= even for Shorts — title may include #shorts.
 */
export function inferYouTubeEmbedAspectRatio(url, title = '') {
  if (url) {
    try {
      const u = new URL(url.trim(), 'https://www.youtube.com')
      if (/\/shorts\//i.test(u.pathname)) return '9 / 16'
    } catch {
      /* ignore */
    }
  }
  const t = (title || '').toLowerCase()
  if (/#\s*shorts\b/.test(t) || /\b#shorts\b/.test(t)) return '9 / 16'
  return '16 / 9'
}

export function extractYouTubeVideoId(url) {
  if (!url || typeof url !== 'string') return null
  try {
    const u = new URL(url.trim(), 'https://www.youtube.com')
    const host = u.hostname.replace(/^www\./, '')
    if (host === 'youtu.be') {
      const id = u.pathname.replace(/^\//, '').split('/')[0]
      return id && /^[\w-]{11}$/.test(id) ? id : null
    }
    if (host.includes('youtube.com')) {
      const v = u.searchParams.get('v')
      if (v && /^[\w-]{11}$/.test(v)) return v
      const embed = u.pathname.match(/\/embed\/([\w-]{11})/)
      if (embed) return embed[1]
      const shorts = u.pathname.match(/\/shorts\/([\w-]{11})/)
      if (shorts) return shorts[1]
      const live = u.pathname.match(/\/live\/([\w-]{11})/)
      if (live) return live[1]
    }
  } catch {
    return null
  }
  return null
}

/**
 * Embed URL tuned for low-latency playback and minimal UI chrome.
 * - youtube-nocookie.com: privacy-enhanced embed (fewer tracking cookies)
 * - enablejsapi=1: allows postMessage control in future
 * - rel=0, modestbranding=1: hide related / branding noise
 * - iv_load_policy=3, cc_load_policy=0: skip annotations / captions on load
 * - playsinline=1: no iOS fullscreen hijack
 * - controls=1: show play/pause, seek, volume, settings, fullscreen (required — omitting can hide chrome in some embed modes)
 * - fs=1: allow fullscreen control in the player
 * - origin: helps YouTube validate the embedding context
 */
export function getYouTubeEmbedUrl(videoId, { autoplay = true, origin = '' } = {}) {
  if (!videoId) return ''
  const params = new URLSearchParams({
    controls: '1',
    autoplay: autoplay ? '1' : '0',
    rel: '0',
    modestbranding: '1',
    playsinline: '1',
    iv_load_policy: '3',
    cc_load_policy: '0',
    enablejsapi: '1',
    fs: '1',
  })
  if (origin) params.set('origin', origin)
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?${params}`
}

/**
 * Warm the YouTube embed connection early so the iframe loads faster
 * when the user actually opens a video. Call once on app init.
 */
let _warmed = false
export function warmYouTubeConnection() {
  if (_warmed || typeof document === 'undefined') return
  _warmed = true
  const link = document.createElement('link')
  link.rel = 'preconnect'
  link.href = 'https://www.youtube-nocookie.com'
  link.crossOrigin = 'anonymous'
  document.head.appendChild(link)
}
