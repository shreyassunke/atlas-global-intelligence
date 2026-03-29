/**
 * Spotify Web Playback SDK — single player instance for TATVA.
 */

const SDK_URL = 'https://sdk.scdn.co/spotify-player.js'

let sdkPromise = null
let playerInstance = null
let deviceIdResolver = null
let deviceIdPromise = null

export function loadSpotifyPlaybackSdk() {
  if (typeof window === 'undefined') return Promise.reject(new Error('No window'))
  if (window.Spotify?.Player) return Promise.resolve()
  if (sdkPromise) return sdkPromise

  sdkPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${SDK_URL}"]`)
    if (existing) {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error('Spotify SDK load error')))
      return
    }
    window.onSpotifyWebPlaybackSDKReady = () => resolve()
    const s = document.createElement('script')
    s.src = SDK_URL
    s.async = true
    s.onerror = () => reject(new Error('Spotify SDK script failed'))
    document.body.appendChild(s)
  })

  return sdkPromise
}

/**
 * @param {() => Promise<string>} getAccessToken
 * @param {number} initialVolume01
 */
export async function createOrReusePlayer(getAccessToken, initialVolume01 = 0.65) {
  await loadSpotifyPlaybackSdk()
  if (!window.Spotify?.Player) throw new Error('Spotify Player API unavailable')

  if (playerInstance) {
    try {
      await playerInstance.disconnect()
    } catch {
      /* ignore */
    }
    playerInstance = null
  }

  deviceIdPromise = new Promise((resolve) => {
    deviceIdResolver = resolve
  })

  const player = new window.Spotify.Player({
    name: 'TATVA',
    getOAuthToken: (cb) => {
      void (async () => {
        try {
          const t = await getAccessToken()
          cb(t || '')
        } catch {
          cb('')
        }
      })()
    },
    volume: Math.max(0, Math.min(1, initialVolume01)),
  })

  player.addListener('ready', ({ device_id: id }) => {
    if (deviceIdResolver) {
      deviceIdResolver(id)
      deviceIdResolver = null
    }
  })

  player.addListener('not_ready', () => {})

  player.addListener('initialization_error', ({ message }) => {
    console.warn('[TATVA] Spotify player init:', message)
  })

  player.addListener('authentication_error', ({ message }) => {
    console.warn('[TATVA] Spotify player auth:', message)
  })

  player.addListener('account_error', ({ message }) => {
    console.warn('[TATVA] Spotify Premium required for Web Playback:', message)
  })

  const ok = await player.connect()
  if (!ok) throw new Error('Spotify player connect() returned false')

  playerInstance = player
  const deviceId = await deviceIdPromise
  return { player, deviceId }
}

export function getSpotifyPlayer() {
  return playerInstance
}

export async function setSpotifyPlayerVolume01(v) {
  const p = playerInstance
  if (!p) return
  try {
    await p.setVolume(Math.max(0, Math.min(1, v)))
  } catch {
    /* ignore */
  }
}

export async function disconnectSpotifyPlayer() {
  if (!playerInstance) return
  try {
    await playerInstance.disconnect()
  } catch {
    /* ignore */
  }
  playerInstance = null
  deviceIdPromise = null
  deviceIdResolver = null
}
