import { useEffect, useRef } from 'react'
import { useAtlasStore } from '../../store/atlasStore'

const INTRO_URL = '/audio/intro.mp3'
const SPACE_AMBIENT_URL = '/audio/space-ambient.mp3'
const VOLUME = 0.4

export default function BackgroundAudio() {
  const introRef = useRef(null)
  const ambientRef = useRef(null)
  const hasStartedRef = useRef(false)
  /** When YouTube in-app player is open, pause BGM so only one source plays */
  const youtubeEmbed = useAtlasStore((s) => s.youtubeEmbed)
  const bgmSuppressed = !!youtubeEmbed

  // Pause / resume BGM when YouTube overlay opens or closes (exclusive audio)
  useEffect(() => {
    const intro = introRef.current
    const ambient = ambientRef.current
    if (!intro || !ambient) return

    if (bgmSuppressed) {
      intro.pause()
      ambient.pause()
      return
    }

    if (!hasStartedRef.current) return

    if (!intro.ended) {
      intro.play().catch(() => {})
    } else {
      ambient.play().catch(() => {})
    }
  }, [bgmSuppressed])

  // Start on first user interaction (browser autoplay policy)
  useEffect(() => {
    const startAudio = () => {
      if (hasStartedRef.current) return
      hasStartedRef.current = true

      const intro = introRef.current
      const ambient = ambientRef.current
      if (!intro || !ambient) return

      intro.volume = VOLUME
      ambient.volume = VOLUME
      ambient.loop = true

      // Fallback: if ambient ever ends (browser quirk), restart immediately
      ambient.addEventListener('ended', function onAmbientEnded() {
        if (useAtlasStore.getState().youtubeEmbed) return
        ambient.play().catch(() => {})
      })

      intro.play().catch(() => {
        hasStartedRef.current = false
      })

      intro.addEventListener('ended', () => {
        if (useAtlasStore.getState().youtubeEmbed) return
        ambient.play().catch(() => {})
      })
    }

    const events = ['click', 'touchstart', 'keydown']
    const onInteraction = () => {
      startAudio()
      events.forEach((e) => document.removeEventListener(e, onInteraction))
    }

    events.forEach((e) => document.addEventListener(e, onInteraction))
    return () => events.forEach((e) => document.removeEventListener(e, onInteraction))
  }, [])

  return (
    <>
      <audio ref={introRef} src={INTRO_URL} preload="auto" />
      <audio ref={ambientRef} src={SPACE_AMBIENT_URL} preload="auto" loop />
    </>
  )
}
