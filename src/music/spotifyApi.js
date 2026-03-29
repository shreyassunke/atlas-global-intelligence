/**
 * Spotify Web API helpers (user playlists + start playback on a device).
 */

export async function spotifyApiFetch(path, accessToken, { method = 'GET', body = null } = {}) {
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  return res
}

export async function fetchUserPlaylists(accessToken, { limit = 30 } = {}) {
  const res = await spotifyApiFetch(
    `/me/playlists?limit=${limit}`,
    accessToken,
  )
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message || `Playlists ${res.status}`)
  }
  const data = await res.json()
  return Array.isArray(data.items) ? data.items : []
}

/**
 * Transfer playback to the Web Playback device and start a context (playlist / album).
 */
export async function startPlaybackOnDevice(accessToken, deviceId, contextUri) {
  const transfer = await fetch('https://api.spotify.com/v1/me/player', {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      device_ids: [deviceId],
      play: false,
    }),
  })

  if (!transfer.ok && transfer.status !== 204) {
    const t = await transfer.json().catch(() => ({}))
    throw new Error(t.error?.message || `Transfer failed (${transfer.status})`)
  }

  const playUrl = `https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(deviceId)}`
  const play = await fetch(playUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ context_uri: contextUri }),
  })

  if (!play.ok && play.status !== 204) {
    const p = await play.json().catch(() => ({}))
    const msg = p.error?.message || `Play failed (${play.status})`
    throw new Error(msg)
  }
}
