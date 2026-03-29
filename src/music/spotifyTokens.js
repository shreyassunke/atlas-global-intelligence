import { getSpotifyClientId } from '../config/musicProviders'

const STORAGE_KEY = 'atlas_spotify_auth'

/**
 * @returns {{ accessToken: string, refreshToken: string, expiresAt: number } | null}
 */
export function loadSpotifyAuthFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const o = JSON.parse(raw)
    if (!o?.accessToken || !o.expiresAt) return null
    return {
      accessToken: o.accessToken,
      refreshToken: o.refreshToken || '',
      expiresAt: Number(o.expiresAt) || 0,
    }
  } catch {
    return null
  }
}

export function persistSpotifyAuth(auth) {
  try {
    if (!auth) {
      localStorage.removeItem(STORAGE_KEY)
      return
    }
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        accessToken: auth.accessToken,
        refreshToken: auth.refreshToken,
        expiresAt: auth.expiresAt,
      }),
    )
  } catch {
    /* ignore */
  }
}

export async function refreshSpotifyAccessToken(refreshToken) {
  const clientId = getSpotifyClientId()
  if (!clientId || !refreshToken) throw new Error('Cannot refresh Spotify token')

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
  })

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error_description || data.error || 'Refresh failed')
  }

  const expiresAt = Date.now() + (data.expires_in || 3600) * 1000 - 30_000
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    expiresAt,
  }
}
