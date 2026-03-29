import { useEffect, useRef } from 'react'
import { useAtlasStore } from '../../store/atlasStore'

function loadYouTubeIframeAPI() {
  if (typeof window === 'undefined') return Promise.reject(new Error('No window'))
  if (window.YT?.Player) return Promise.resolve()

  return new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      try {
        prev?.()
      } catch {
        /* ignore */
      }
      resolve()
    }
    if (document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const iv = setInterval(() => {
        if (window.YT?.Player) {
          clearInterval(iv)
          resolve()
        }
      }, 50)
      setTimeout(() => clearInterval(iv), 15000)
      return
    }
    const tag = document.createElement('script')
    tag.src = 'https://www.youtube.com/iframe_api'
    const first = document.getElementsByTagName('script')[0]
    first.parentNode.insertBefore(tag, first)
  })
}

const CONTAINER_ID = 'atlas-yt-bgm-host'

/**
 * Hidden YouTube IFrame API player for background music (video loop or playlist).
 */
export default function YouTubeBgmPlayer({ toolSurfaceActive = false }) {
  const bgmProvider = useAtlasStore((s) => s.bgmProvider)
  const bgmYoutube = useAtlasStore((s) => s.bgmYoutube)
  const bgmIntroComplete = useAtlasStore((s) => s.bgmIntroComplete)
  const bgmVolume = useAtlasStore((s) => s.bgmVolume)
  const youtubeEmbed = useAtlasStore((s) => !!s.youtubeEmbed)
  const setBgmExternalMessage = useAtlasStore((s) => s.setBgmExternalMessage)

  const playerRef = useRef(null)
  const specKeyRef = useRef('')

  const shouldPlay =
    toolSurfaceActive &&
    bgmProvider === 'youtube' &&
    bgmIntroComplete &&
    !!bgmYoutube &&
    !youtubeEmbed

  useEffect(() => {
    if (bgmProvider !== 'youtube') {
      specKeyRef.current = ''
      if (playerRef.current?.destroy) {
        try {
          playerRef.current.destroy()
        } catch {
          /* ignore */
        }
        playerRef.current = null
      }
    }
  }, [bgmProvider])

  useEffect(() => {
    if (!shouldPlay || !bgmYoutube) {
      if (playerRef.current?.destroy) {
        try {
          playerRef.current.destroy()
        } catch {
          /* ignore */
        }
        playerRef.current = null
      }
      specKeyRef.current = ''
      return
    }

    const specKey = `${bgmYoutube.type}:${bgmYoutube.id}`
    if (specKeyRef.current === specKey && playerRef.current) return

    let cancelled = false

    void loadYouTubeIframeAPI().then(() => {
      if (cancelled || !window.YT?.Player) return

      if (playerRef.current?.destroy) {
        try {
          playerRef.current.destroy()
        } catch {
          /* ignore */
        }
        playerRef.current = null
      }

      const vol = Math.round(
        (typeof bgmVolume === 'number' && !Number.isNaN(bgmVolume) ? bgmVolume : 0.65) * 100,
      )

      const spec = bgmYoutube

      const config = {
        height: '120',
        width: '200',
        events: {
          onReady: (e) => {
            try {
              e.target.setVolume(vol)
              if (spec.type === 'video') {
                e.target.playVideo()
              }
              setBgmExternalMessage(null)
            } catch (err) {
              setBgmExternalMessage(err?.message || 'YouTube player failed to start.')
            }
          },
          onError: (e) => {
            setBgmExternalMessage(
              `YouTube error ${e?.data ?? ''}. Check the URL or try another video.`,
            )
          },
        },
      }

      if (spec.type === 'playlist') {
        config.playerVars = {
          listType: 'playlist',
          list: spec.id,
          autoplay: 1,
          controls: 0,
          modestbranding: 1,
          playsinline: 1,
          rel: 0,
          origin: typeof window !== 'undefined' ? window.location.origin : undefined,
        }
      } else {
        config.videoId = spec.id
        config.playerVars = {
          autoplay: 1,
          controls: 0,
          modestbranding: 1,
          playsinline: 1,
          rel: 0,
          loop: 1,
          playlist: spec.id,
          origin: typeof window !== 'undefined' ? window.location.origin : undefined,
        }
      }

      try {
        playerRef.current = new window.YT.Player(CONTAINER_ID, config)
        specKeyRef.current = specKey
      } catch (err) {
        setBgmExternalMessage(err?.message || 'Could not create YouTube player.')
      }
    })

    return () => {
      cancelled = true
    }
  }, [shouldPlay, bgmYoutube, youtubeEmbed, bgmVolume, setBgmExternalMessage])

  useEffect(() => {
    const p = playerRef.current
    if (!p?.setVolume) return
    const vol = Math.round(
      (typeof bgmVolume === 'number' && !Number.isNaN(bgmVolume) ? bgmVolume : 0.65) * 100,
    )
    try {
      p.setVolume(vol)
    } catch {
      /* ignore */
    }
  }, [bgmVolume])

  if (bgmProvider !== 'youtube') return null

  return (
    <div
      className="fixed w-px h-px overflow-hidden opacity-0 pointer-events-none"
      style={{ left: -9999, top: 0 }}
      aria-hidden
    >
      <div id={CONTAINER_ID} />
    </div>
  )
}
