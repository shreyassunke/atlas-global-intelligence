const K_PROVIDER = 'atlas_bgm_provider'
const K_SPOTIFY_URI = 'atlas_spotify_context_uri'
const K_YOUTUBE = 'atlas_bgm_youtube_json'

const VALID_PROVIDERS = new Set(['atlas', 'spotify', 'youtube', 'apple_music'])

export function loadPersistedBgmProvider() {
  try {
    const raw = localStorage.getItem(K_PROVIDER)
    if (raw && VALID_PROVIDERS.has(raw)) return raw
  } catch {
    /* ignore */
  }
  return 'atlas'
}

export function persistBgmProvider(id) {
  try {
    localStorage.setItem(K_PROVIDER, id)
  } catch {
    /* ignore */
  }
}

export function loadPersistedSpotifyContextUri() {
  try {
    const u = localStorage.getItem(K_SPOTIFY_URI)
    if (u && /^spotify:(playlist|album):[a-zA-Z0-9]+$/.test(u.trim())) return u.trim()
  } catch {
    /* ignore */
  }
  return ''
}

export function persistSpotifyContextUri(uri) {
  try {
    if (!uri) localStorage.removeItem(K_SPOTIFY_URI)
    else localStorage.setItem(K_SPOTIFY_URI, uri)
  } catch {
    /* ignore */
  }
}

/** @returns {{ type: 'video' | 'playlist', id: string } | null} */
export function loadPersistedBgmYoutube() {
  try {
    const raw = localStorage.getItem(K_YOUTUBE)
    if (!raw) return null
    const o = JSON.parse(raw)
    if (o?.type === 'video' && o?.id && /^[\w-]{11}$/.test(o.id)) return o
    if (o?.type === 'playlist' && o?.id && /^PL[a-zA-Z0-9_-]{10,}$/.test(o.id)) return o
  } catch {
    /* ignore */
  }
  return null
}

export function persistBgmYoutube(spec) {
  try {
    if (!spec) localStorage.removeItem(K_YOUTUBE)
    else localStorage.setItem(K_YOUTUBE, JSON.stringify(spec))
  } catch {
    /* ignore */
  }
}
