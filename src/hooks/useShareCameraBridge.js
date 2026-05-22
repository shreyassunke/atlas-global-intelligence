import { useEffect, useRef } from 'react'
import { useAtlasStore } from '../store/atlasStore'

/**
 * Apply shareCamera from URL/store once per globe mount; report camera moves upstream.
 * @param {{ apply: (cam: Object) => void, report?: (cam: Object) => void, ready?: boolean }} opts
 */
export function useShareCameraBridge({ apply, report, ready = true }) {
  const shareCamera = useAtlasStore((s) => s.shareCamera)
  const appliedRef = useRef(false)
  const lastReportRef = useRef('')

  useEffect(() => {
    if (!ready || !shareCamera || appliedRef.current) return
    appliedRef.current = true
    apply(shareCamera)
  }, [ready, shareCamera, apply])

  useEffect(() => {
    if (!ready || !report) return undefined
    const id = setInterval(() => {
      const cam = report()
      if (!cam) return
      const key = JSON.stringify(cam)
      if (key === lastReportRef.current) return
      lastReportRef.current = key
      useAtlasStore.getState().setShareCamera(cam)
    }, 1200)
    return () => clearInterval(id)
  }, [ready, report])
}

export default useShareCameraBridge
