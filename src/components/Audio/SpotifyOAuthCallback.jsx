import { useEffect, useState } from 'react'
import { useAtlasStore } from '../../store/atlasStore'
import { exchangeSpotifyCode, validateSpotifyCallbackState } from '../../music/spotifyPkce'

/**
 * Handles `/spotify-callback?code=&state=` after Spotify OAuth, then returns the user to the app root.
 */
export default function SpotifyOAuthCallback() {
  const [note, setNote] = useState('Connecting to Spotify…')

  useEffect(() => {
    const path = window.location.pathname.replace(/\/$/, '') || '/'
    if (!path.endsWith('/spotify-callback')) return undefined

    const params = new URLSearchParams(window.location.search)
    const err = params.get('error')
    const desc = params.get('error_description')
    const code = params.get('code')
    const state = params.get('state')

    const raw = import.meta.env.BASE_URL || '/'
    const base = raw.replace(/\/$/, '')
    const homePath = base ? `${base}/` : '/'

    function goHome() {
      window.history.replaceState({}, '', homePath)
      queueMicrotask(() => window.dispatchEvent(new CustomEvent('atlas-history')))
    }

    if (err) {
      setNote(desc || err || 'Spotify authorization was cancelled.')
      goHome()
      return undefined
    }

    if (!code || !validateSpotifyCallbackState(state)) {
      setNote('Invalid or expired Spotify login. Try again.')
      goHome()
      return undefined
    }

    let cancelled = false
    void (async () => {
      try {
        const tokens = await exchangeSpotifyCode(code)
        if (cancelled) return
        useAtlasStore.getState().setSpotifyAuth({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt: tokens.expiresAt,
        })
        useAtlasStore.getState().setBgmProvider('spotify')
        goHome()
      } catch (e) {
        if (cancelled) return
        setNote(e?.message || 'Could not complete Spotify login.')
        goHome()
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  const path = typeof window !== 'undefined' ? window.location.pathname : ''
  if (!path.replace(/\/$/, '').endsWith('/spotify-callback')) return null

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 text-white/90 text-sm font-mono px-6 text-center">
      {note}
    </div>
  )
}
