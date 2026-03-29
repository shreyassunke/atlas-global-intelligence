/**
 * External music sources for TATVA background audio (alongside built-in loops).
 *
 * Spotify: set VITE_SPOTIFY_CLIENT_ID and register the redirect URI in the Spotify Developer Dashboard
 * (same origin + `/spotify-callback`). Web Playback requires a Spotify Premium account.
 *
 * YouTube / YouTube Music: paste a watch URL, playlist URL, or Music share link with a `list=` parameter.
 *
 * Apple Music: no public browser playback API without your own MusicKit developer token (server-signed JWT).
 * We link users to Apple Music in the browser; use Built-in, Spotify, or YouTube for in-app audio.
 */

export const BGM_PROVIDERS = {
  atlas: {
    id: 'atlas',
    label: 'TATVA built-in',
    description: 'Loops bundled with TATVA',
  },
  spotify: {
    id: 'spotify',
    label: 'Spotify',
    description: 'Your playlists (Premium + connected account)',
  },
  youtube: {
    id: 'youtube',
    label: 'YouTube / YouTube Music',
    description: 'Video or playlist URL',
  },
  apple_music: {
    id: 'apple_music',
    label: 'Apple Music',
    description: 'Open in browser (in-app playback needs MusicKit + server token)',
  },
}

export const BGM_PROVIDER_ORDER = ['atlas', 'spotify', 'youtube', 'apple_music']

export const SPOTIFY_SCOPES = [
  'streaming',
  'user-read-email',
  'user-modify-playback-state',
  'user-read-playback-state',
  'playlist-read-private',
  'playlist-read-collaborative',
].join(' ')

export function getSpotifyClientId() {
  const id = import.meta.env.VITE_SPOTIFY_CLIENT_ID
  return typeof id === 'string' && id.trim().length > 0 ? id.trim() : ''
}

/** Must match an authorized redirect URI in the Spotify app settings */
export function getSpotifyRedirectUri() {
  if (typeof window === 'undefined') return ''
  const raw = import.meta.env.BASE_URL || '/'
  const base = raw.replace(/\/$/, '')
  const path = base ? `${base}/spotify-callback` : '/spotify-callback'
  return `${window.location.origin}${path}`
}
