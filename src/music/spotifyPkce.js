import { getSpotifyClientId, getSpotifyRedirectUri, SPOTIFY_SCOPES } from '../config/musicProviders'

const VERIFIER_KEY = 'atlas_spotify_pkce_verifier'
const STATE_KEY = 'atlas_spotify_oauth_state'

function randomString(len) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
  const arr = new Uint8Array(len)
  crypto.getRandomValues(arr)
  let s = ''
  for (let i = 0; i < len; i++) s += chars[arr[i] % chars.length]
  return s
}

async function sha256Base64Url(plain) {
  const data = new TextEncoder().encode(plain)
  const hash = await crypto.subtle.digest('SHA-256', data)
  const bytes = new Uint8Array(hash)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Redirect the browser to Spotify login (Authorization Code + PKCE).
 */
export async function beginSpotifyAuthorization() {
  const clientId = getSpotifyClientId()
  if (!clientId) {
    console.warn('[TATVA] VITE_SPOTIFY_CLIENT_ID is not set')
    return false
  }
  const verifier = randomString(64)
  const challenge = await sha256Base64Url(verifier)
  const state = randomString(24)
  try {
    sessionStorage.setItem(VERIFIER_KEY, verifier)
    sessionStorage.setItem(STATE_KEY, state)
  } catch {
    /* ignore */
  }

  const redirectUri = getSpotifyRedirectUri()
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: SPOTIFY_SCOPES,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state,
    show_dialog: 'true',
  })
  window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`
  return true
}

/**
 * Exchange ?code= for tokens (call from /spotify-callback).
 */
export async function exchangeSpotifyCode(code) {
  const clientId = getSpotifyClientId()
  const redirectUri = getSpotifyRedirectUri()
  let verifier = ''
  try {
    verifier = sessionStorage.getItem(VERIFIER_KEY) || ''
  } catch {
    /* ignore */
  }
  if (!clientId || !verifier) {
    throw new Error('Missing Spotify client ID or PKCE verifier')
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    code_verifier: verifier,
  })

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error_description || data.error || `Token exchange failed (${res.status})`)
  }

  try {
    sessionStorage.removeItem(VERIFIER_KEY)
    sessionStorage.removeItem(STATE_KEY)
  } catch {
    /* ignore */
  }

  const expiresAt = Date.now() + (data.expires_in || 3600) * 1000 - 30_000
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || '',
    expiresAt,
  }
}

export function readSpotifyOAuthState() {
  try {
    return sessionStorage.getItem(STATE_KEY) || ''
  } catch {
    return ''
  }
}

export function validateSpotifyCallbackState(receivedState) {
  let expected = ''
  try {
    expected = sessionStorage.getItem(STATE_KEY) || ''
  } catch {
    /* ignore */
  }
  return expected && receivedState && expected === receivedState
}
