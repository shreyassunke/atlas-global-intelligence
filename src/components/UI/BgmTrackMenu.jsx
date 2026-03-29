import { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useAtlasStore } from '../../store/atlasStore'
import { BGM_AMBIENT_TRACKS } from '../../config/bgmTracks'
import { BGM_PROVIDER_ORDER, BGM_PROVIDERS, getSpotifyClientId } from '../../config/musicProviders'
import { beginSpotifyAuthorization } from '../../music/spotifyPkce'
import { refreshSpotifyAccessToken, persistSpotifyAuth } from '../../music/spotifyTokens'
import { fetchUserPlaylists } from '../../music/spotifyApi'
import { resolveYoutubeBgmFromInput } from '../../utils/youtube'

async function getSpotifyTokenForMenu() {
  const auth = useAtlasStore.getState().spotifyAuth
  if (!auth?.accessToken) return null
  if (Date.now() < auth.expiresAt - 5000) return auth.accessToken
  if (!auth.refreshToken) return null
  try {
    const next = await refreshSpotifyAccessToken(auth.refreshToken)
    persistSpotifyAuth(next)
    useAtlasStore.getState().setSpotifyAuth({
      accessToken: next.accessToken,
      refreshToken: next.refreshToken,
      expiresAt: next.expiresAt,
    })
    return next.accessToken
  } catch {
    useAtlasStore.getState().setBgmExternalMessage('Spotify session expired. Connect again.')
    useAtlasStore.getState().disconnectSpotifySession()
    return null
  }
}

/**
 * Floating menu: built-in loops, Spotify (OAuth + playlists), YouTube URL, Apple Music note.
 */
export default function BgmTrackMenu() {
  const bgmTrackMenu = useAtlasStore((s) => s.bgmTrackMenu)
  const bgmProvider = useAtlasStore((s) => s.bgmProvider)
  const bgmAmbientTrackId = useAtlasStore((s) => s.bgmAmbientTrackId)
  const setBgmAmbientTrackId = useAtlasStore((s) => s.setBgmAmbientTrackId)
  const setBgmProvider = useAtlasStore((s) => s.setBgmProvider)
  const closeBgmTrackMenu = useAtlasStore((s) => s.closeBgmTrackMenu)
  const bgmVolume = useAtlasStore((s) => s.bgmVolume)
  const setBgmVolume = useAtlasStore((s) => s.setBgmVolume)
  const spotifyAuth = useAtlasStore((s) => s.spotifyAuth)
  const spotifyPlayContextUri = useAtlasStore((s) => s.spotifyPlayContextUri)
  const setSpotifyPlayContextUri = useAtlasStore((s) => s.setSpotifyPlayContextUri)
  const setBgmYoutube = useAtlasStore((s) => s.setBgmYoutube)
  const bgmYoutube = useAtlasStore((s) => s.bgmYoutube)
  const disconnectSpotifySession = useAtlasStore((s) => s.disconnectSpotifySession)
  const bgmExternalMessage = useAtlasStore((s) => s.bgmExternalMessage)

  const menuRef = useRef(null)
  const [playlists, setPlaylists] = useState([])
  const [playlistsLoading, setPlaylistsLoading] = useState(false)
  const [ytInput, setYtInput] = useState('')

  const spotifyClientConfigured = !!getSpotifyClientId()

  const loadPlaylists = useCallback(async () => {
    setPlaylistsLoading(true)
    try {
      const token = await getSpotifyTokenForMenu()
      if (!token) {
        setPlaylists([])
        return
      }
      const items = await fetchUserPlaylists(token, { limit: 40 })
      setPlaylists(items)
    } catch (e) {
      useAtlasStore.getState().setBgmExternalMessage(e?.message || 'Could not load Spotify playlists.')
      setPlaylists([])
    } finally {
      setPlaylistsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!bgmTrackMenu) return
    if (bgmProvider !== 'spotify' || !spotifyAuth) return
    void loadPlaylists()
  }, [bgmTrackMenu, bgmProvider, spotifyAuth, loadPlaylists])

  useEffect(() => {
    if (!bgmTrackMenu) return
    if (bgmProvider !== 'spotify' || !spotifyAuth || spotifyPlayContextUri) return
    if (playlistsLoading || playlists.length === 0) return
    const first = playlists[0]
    if (first?.uri) setSpotifyPlayContextUri(first.uri)
  }, [
    bgmTrackMenu,
    bgmProvider,
    spotifyAuth,
    spotifyPlayContextUri,
    playlists,
    playlistsLoading,
    setSpotifyPlayContextUri,
  ])

  useEffect(() => {
    if (!bgmTrackMenu) return
    function onKey(e) {
      if (e.key === 'Escape') closeBgmTrackMenu()
    }
    function onPointerDown(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        closeBgmTrackMenu()
      }
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('touchstart', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('touchstart', onPointerDown)
    }
  }, [bgmTrackMenu, closeBgmTrackMenu])

  if (!bgmTrackMenu || typeof document === 'undefined') return null

  const volPct = Math.round(
    (typeof bgmVolume === 'number' && !Number.isNaN(bgmVolume) ? bgmVolume : 0.65) * 100,
  )

  const { x, y } = bgmTrackMenu
  const pad = 8
  const menuW = 300
  const left = Math.max(pad, Math.min(x - menuW / 2, window.innerWidth - menuW - pad))
  const top = Math.min(y + pad, window.innerHeight - 460)

  const onYoutubeApply = () => {
    const resolved = resolveYoutubeBgmFromInput(ytInput)
    if (!resolved) {
      useAtlasStore.getState().setBgmExternalMessage('Paste a valid YouTube video or playlist URL.')
      return
    }
    setBgmYoutube(resolved)
    setBgmProvider('youtube')
    closeBgmTrackMenu()
  }

  return createPortal(
    <div
      ref={menuRef}
      className="bgm-track-menu bgm-track-menu--wide"
      style={{ position: 'fixed', left, top, zIndex: 10060 }}
      role="dialog"
      aria-label="Background music"
    >
      <div className="bgm-track-menu__title">Background music</div>

      <div className="bgm-track-menu__providers" role="tablist" aria-label="Music source">
        {BGM_PROVIDER_ORDER.map((id) => {
          const meta = BGM_PROVIDERS[id]
          const active = bgmProvider === id
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              className={`bgm-track-menu__provider-pill${active ? ' bgm-track-menu__provider-pill--active' : ''}`}
              onClick={() => setBgmProvider(id)}
            >
              {meta.label}
            </button>
          )
        })}
      </div>

      {bgmExternalMessage && (
        <p className="bgm-track-menu__warn" role="status">
          {bgmExternalMessage}
        </p>
      )}

      {bgmProvider === 'atlas' && (
        <>
          <div className="bgm-track-menu__section-label">Built-in loops</div>
          <ul className="bgm-track-menu__list" role="listbox">
            {BGM_AMBIENT_TRACKS.map((t) => {
              const selected = t.id === bgmAmbientTrackId
              return (
                <li key={t.id} role="none">
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={`bgm-track-menu__item${selected ? ' bgm-track-menu__item--active' : ''}`}
                    onClick={() => {
                      setBgmAmbientTrackId(t.id)
                      setBgmProvider('atlas')
                      closeBgmTrackMenu()
                    }}
                  >
                    <span className="bgm-track-menu__check" aria-hidden>
                      {selected ? '✓' : ''}
                    </span>
                    {t.label}
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}

      {bgmProvider === 'spotify' && (
        <div className="bgm-track-menu__panel">
          {!spotifyClientConfigured && (
            <p className="bgm-track-menu__hint">
              Add <code className="bgm-track-menu__code">VITE_SPOTIFY_CLIENT_ID</code> to your env file
              and set the redirect URI to{' '}
              <code className="bgm-track-menu__code">…/spotify-callback</code> in the Spotify Developer
              Dashboard. Web Playback requires{' '}
              <strong className="text-white/90">Spotify Premium</strong>.
            </p>
          )}
          {spotifyClientConfigured && !spotifyAuth && (
            <button
              type="button"
              className="bgm-track-menu__cta"
              onClick={() => void beginSpotifyAuthorization()}
            >
              Connect Spotify
            </button>
          )}
          {spotifyAuth && (
            <>
              <div className="bgm-track-menu__row">
                <span className="bgm-track-menu__section-label mb-0">Your playlists</span>
                <button type="button" className="bgm-track-menu__linkish" onClick={() => void loadPlaylists()}>
                  Refresh
                </button>
              </div>
              {playlistsLoading ? (
                <p className="bgm-track-menu__hint">Loading playlists…</p>
              ) : (
                <ul className="bgm-track-menu__list bgm-track-menu__list--scroll" role="listbox">
                  {playlists.map((p) => {
                    const uri = p.uri
                    const selected = uri === spotifyPlayContextUri
                    return (
                      <li key={p.id} role="none">
                        <button
                          type="button"
                          role="option"
                          aria-selected={selected}
                          className={`bgm-track-menu__item${selected ? ' bgm-track-menu__item--active' : ''}`}
                          onClick={() => {
                            if (uri) setSpotifyPlayContextUri(uri)
                            setBgmProvider('spotify')
                            closeBgmTrackMenu()
                          }}
                        >
                          <span className="bgm-track-menu__check" aria-hidden>
                            {selected ? '✓' : ''}
                          </span>
                          <span className="truncate">{p.name}</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
              <button
                type="button"
                className="bgm-track-menu__disconnect"
                onClick={() => {
                  disconnectSpotifySession()
                  setPlaylists([])
                }}
              >
                Disconnect Spotify &amp; use built-in
              </button>
            </>
          )}
        </div>
      )}

      {bgmProvider === 'youtube' && (
        <div className="bgm-track-menu__panel">
          <p className="bgm-track-menu__hint">
            Paste a YouTube or YouTube Music link (watch URL with <code className="bgm-track-menu__code">list=</code>{' '}
            for playlists, or a single video / Shorts link).
          </p>
          <input
            type="url"
            className="bgm-track-menu__input"
            placeholder="https://www.youtube.com/watch?v=…"
            value={ytInput}
            onChange={(e) => setYtInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onYoutubeApply()}
          />
          <button type="button" className="bgm-track-menu__cta" onClick={onYoutubeApply}>
            Use this source
          </button>
          {bgmYoutube && (
            <p className="bgm-track-menu__hint">
              Active: {bgmYoutube.type} · {bgmYoutube.id}
            </p>
          )}
        </div>
      )}

      {bgmProvider === 'apple_music' && (
        <div className="bgm-track-menu__panel">
          <p className="bgm-track-menu__hint">
            Apple Music does not offer a browser API for third-party playback without a{' '}
            <strong className="text-white/90">MusicKit developer token</strong> signed on your server. Use
            Spotify or YouTube for in-app audio, or open Apple Music below.
          </p>
          <a
            className="bgm-track-menu__cta bgm-track-menu__cta--link"
            href="https://music.apple.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            Open Apple Music
          </a>
        </div>
      )}

      <div className="bgm-track-menu__volume">
        <label className="bgm-track-menu__volume-label" htmlFor="bgm-volume-range">
          Volume
        </label>
        <div className="bgm-track-menu__volume-row">
          <input
            id="bgm-volume-range"
            type="range"
            min={0}
            max={100}
            step={1}
            value={volPct}
            onChange={(e) => setBgmVolume(Number(e.target.value) / 100)}
            onClick={(e) => e.stopPropagation()}
            className="bgm-track-menu__range"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={volPct}
          />
          <span className="bgm-track-menu__volume-pct" aria-hidden>
            {volPct}%
          </span>
        </div>
      </div>
      <p className="bgm-track-menu__hint">Open from ⋯ → Ambient audio. External sources start after the intro.</p>
    </div>,
    document.body,
  )
}
