import { useEffect } from 'react'
import { useAtlasStore } from '../../store/atlasStore'
import { refreshSpotifyAccessToken, persistSpotifyAuth } from '../../music/spotifyTokens'
import { startPlaybackOnDevice } from '../../music/spotifyApi'
import {
  createOrReusePlayer,
  disconnectSpotifyPlayer,
  setSpotifyPlayerVolume01,
} from '../../music/spotifyWebPlayer'

/**
 * When the intro is done and the user chose Spotify, connect the Web Playback SDK and start their playlist/album.
 * Requires Spotify Premium for Web Playback.
 */
export default function SpotifyBgmController({ toolSurfaceActive = false }) {
  const bgmProvider = useAtlasStore((s) => s.bgmProvider)
  const bgmIntroComplete = useAtlasStore((s) => s.bgmIntroComplete)
  const spotifyPlayContextUri = useAtlasStore((s) => s.spotifyPlayContextUri)
  const bgmVolume = useAtlasStore((s) => s.bgmVolume)
  const youtubeEmbed = useAtlasStore((s) => s.youtubeEmbed)

  useEffect(() => {
    void setSpotifyPlayerVolume01(
      typeof bgmVolume === 'number' && !Number.isNaN(bgmVolume) ? bgmVolume : 0.65,
    )
  }, [bgmVolume])

  useEffect(() => {
    if (bgmProvider !== 'spotify' || !bgmIntroComplete || youtubeEmbed || !toolSurfaceActive) {
      void disconnectSpotifyPlayer()
      return
    }

    const auth = useAtlasStore.getState().spotifyAuth
    const uri = useAtlasStore.getState().spotifyPlayContextUri
    if (!auth?.accessToken || !uri) {
      void disconnectSpotifyPlayer()
      return
    }

    let cancelled = false

    async function getAccessToken() {
      const a = useAtlasStore.getState().spotifyAuth
      if (!a?.accessToken) return null
      if (Date.now() < a.expiresAt - 5000) return a.accessToken
      if (!a.refreshToken) return null
      try {
        const next = await refreshSpotifyAccessToken(a.refreshToken)
        persistSpotifyAuth(next)
        useAtlasStore.getState().setSpotifyAuth({
          accessToken: next.accessToken,
          refreshToken: next.refreshToken,
          expiresAt: next.expiresAt,
        })
        return next.accessToken
      } catch {
        useAtlasStore.getState().setBgmExternalMessage(
          'Spotify session expired. Connect again from Ambient audio.',
        )
        useAtlasStore.getState().disconnectSpotifySession()
        return null
      }
    }

    void (async () => {
      try {
        await disconnectSpotifyPlayer()
        if (cancelled) return

        const token = await getAccessToken()
        if (cancelled || !token) return

        const vol =
          typeof bgmVolume === 'number' && !Number.isNaN(bgmVolume) ? bgmVolume : 0.65
        const { deviceId } = await createOrReusePlayer(getAccessToken, vol)
        if (cancelled) return

        const ctxUri = useAtlasStore.getState().spotifyPlayContextUri
        if (!ctxUri) return

        await startPlaybackOnDevice(token, deviceId, ctxUri)
        if (!cancelled) useAtlasStore.getState().setBgmExternalMessage(null)
      } catch (e) {
        if (cancelled) return
        const msg = e?.message || String(e)
        useAtlasStore.getState().setBgmExternalMessage(
          /premium|restriction|403|NO_ACTIVE_DEVICE/i.test(msg)
            ? 'Spotify Web Playback needs Premium and an active session. Try Built-in or YouTube, or press play once in the Spotify app.'
            : msg,
        )
        console.warn('[TATVA] Spotify playback:', e)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [bgmProvider, bgmIntroComplete, spotifyPlayContextUri, youtubeEmbed, toolSurfaceActive])

  return null
}
