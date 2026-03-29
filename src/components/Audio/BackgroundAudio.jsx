import { useEffect, useRef } from 'react'
import { useAtlasStore } from '../../store/atlasStore'
import { getBgmTrackById } from '../../config/bgmTracks'

const INTRO_URL = '/audio/intro.mp3'

/**
 * Built-in intro + ambient loop. Only runs on the main TATVA tool surface (globe);
 * `toolSurfaceActive` is false on landing, onboarding, and launch transition.
 */
export default function BackgroundAudio({ toolSurfaceActive = false }) {
  const introRef = useRef(null)
  const ambientRef = useRef(null)
  const hasStartedRef = useRef(false)
  const toolSurfaceActiveRef = useRef(toolSurfaceActive)
  const youtubeEmbed = useAtlasStore((s) => s.youtubeEmbed)
  const bgmSuppressed = !!youtubeEmbed
  const bgmAmbientTrackId = useAtlasStore((s) => s.bgmAmbientTrackId)
  const bgmProvider = useAtlasStore((s) => s.bgmProvider)
  const bgmVolume = useAtlasStore((s) => s.bgmVolume)
  const ambientSrc = getBgmTrackById(bgmAmbientTrackId).url
  const setBgmIntroComplete = useAtlasStore((s) => s.setBgmIntroComplete)

  useEffect(() => {
    toolSurfaceActiveRef.current = toolSurfaceActive
  }, [toolSurfaceActive])

  useEffect(() => {
    const intro = introRef.current
    const ambient = ambientRef.current
    if (!intro || !ambient) return
    const v =
      typeof bgmVolume === 'number' && !Number.isNaN(bgmVolume)
        ? Math.max(0, Math.min(1, bgmVolume))
        : 0.65
    intro.volume = v
    ambient.volume = v
  }, [bgmVolume])

  useEffect(() => {
    if (toolSurfaceActive) return
    const intro = introRef.current
    const ambient = ambientRef.current
    if (intro) {
      intro.pause()
      intro.currentTime = 0
    }
    if (ambient) {
      ambient.pause()
      ambient.currentTime = 0
    }
    hasStartedRef.current = false
    setBgmIntroComplete(false)
  }, [toolSurfaceActive, setBgmIntroComplete])

  useEffect(() => {
    const ambient = ambientRef.current
    const intro = introRef.current
    if (!ambient || !intro) return

    if (!toolSurfaceActive || bgmProvider !== 'atlas') {
      ambient.pause()
      ambient.removeAttribute('src')
      ambient.load()
      return
    }

    if (ambient.getAttribute('src') !== ambientSrc) {
      ambient.src = ambientSrc
      ambient.loop = true
    }

    if (!hasStartedRef.current || bgmSuppressed) return
    if (!intro.ended) return
    ambient.play().catch(() => {})
  }, [ambientSrc, bgmSuppressed, bgmProvider, toolSurfaceActive])

  useEffect(() => {
    const intro = introRef.current
    const ambient = ambientRef.current
    if (!intro || !ambient) return

    if (!toolSurfaceActive) return

    if (bgmSuppressed) {
      intro.pause()
      ambient.pause()
      return
    }

    if (!hasStartedRef.current) return

    if (!intro.ended) {
      intro.play().catch(() => {})
    } else if (bgmProvider === 'atlas') {
      ambient.play().catch(() => {})
    }
  }, [bgmSuppressed, bgmProvider, toolSurfaceActive])

  useEffect(() => {
    if (!toolSurfaceActive) return

    const startAudio = () => {
      if (hasStartedRef.current) return
      hasStartedRef.current = true

      const intro = introRef.current
      const ambient = ambientRef.current
      if (!intro || !ambient) return

      const vol = useAtlasStore.getState().bgmVolume
      intro.volume = vol
      ambient.volume = vol

      if (useAtlasStore.getState().bgmProvider === 'atlas') {
        ambient.src = getBgmTrackById(useAtlasStore.getState().bgmAmbientTrackId).url
        ambient.loop = true
      }

      ambient.addEventListener('ended', function onAmbientEnded() {
        if (useAtlasStore.getState().youtubeEmbed) return
        if (!toolSurfaceActiveRef.current) return
        if (useAtlasStore.getState().bgmProvider !== 'atlas') return
        ambient.play().catch(() => {})
      })

      const onIntroEnd = () => {
        useAtlasStore.getState().setBgmIntroComplete(true)
        if (useAtlasStore.getState().youtubeEmbed) return
        if (useAtlasStore.getState().bgmProvider === 'atlas') {
          ambient.play().catch(() => {})
        }
      }

      intro.addEventListener('ended', onIntroEnd)

      intro.play().catch(() => {
        hasStartedRef.current = false
      })
    }

    const events = ['click', 'touchstart', 'keydown']
    const onInteraction = () => {
      startAudio()
      events.forEach((e) => document.removeEventListener(e, onInteraction))
    }

    events.forEach((e) => document.addEventListener(e, onInteraction))
    return () => events.forEach((e) => document.removeEventListener(e, onInteraction))
  }, [toolSurfaceActive])

  return (
    <>
      <audio ref={introRef} src={INTRO_URL} preload="auto" />
      <audio ref={ambientRef} preload="auto" />
    </>
  )
}
