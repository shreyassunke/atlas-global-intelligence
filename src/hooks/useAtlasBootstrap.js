import { useEffect, useMemo, useState } from 'react'
import { useAtlasStore } from '../store/atlasStore'
import {
  bootstrapProgress,
  computeBootstrapSteps,
  isBootstrapCompleteFromCtx,
  BOOTSTRAP_MAX_MS,
} from '../core/atlasBootstrap'

/**
 * Fast bootstrap gate — unlocks the HUD in ~2–9s; layers keep loading afterward.
 *
 * @param {boolean} globeReady
 * @param {boolean} [active] — false on landing/onboarding; timer runs only on globe view
 */
export default function useAtlasBootstrap(globeReady, active = true) {
  const dataLayers = useAtlasStore((s) => s.dataLayers)
  const sourceStatuses = useAtlasStore((s) => s.sourceStatuses)
  const eventBusReady = useAtlasStore((s) => s.eventBusReady)
  const events = useAtlasStore((s) => s.events)
  const geoOverlay = useAtlasStore((s) => s.gdeltGeoBootstrap)

  const [elapsedMs, setElapsedMs] = useState(0)

  useEffect(() => {
    if (!active) {
      setElapsedMs(0)
      return undefined
    }
    const start = Date.now()
    setElapsedMs(0)
    const id = setInterval(() => setElapsedMs(Date.now() - start), 120)
    const stop = setTimeout(() => clearInterval(id), BOOTSTRAP_MAX_MS + 500)
    return () => {
      clearInterval(id)
      clearTimeout(stop)
    }
  }, [active])

  const workersReady = eventBusReady

  const trackCounts = useMemo(() => {
    let aircraft = 0
    let satellites = 0
    let vessels = 0
    for (const evt of events) {
      if (evt.trackKind === 'aircraft') aircraft++
      else if (evt.trackKind === 'satellite') satellites++
      else if (evt.trackKind === 'vessel') vessels++
    }
    return { aircraft, satellites, vessels }
  }, [events])

  const steps = useMemo(
    () =>
      computeBootstrapSteps({
        dataLayers,
        sourceStatuses,
        globeReady,
        geoOverlay: geoOverlay || {},
        trackCounts,
        workersReady,
        elapsedMs,
      }),
    [dataLayers, sourceStatuses, globeReady, geoOverlay, trackCounts, workersReady, elapsedMs],
  )

  const ready = useMemo(
    () =>
      isBootstrapCompleteFromCtx(steps, {
        elapsedMs,
        globeReady,
        workersReady,
        sourceStatuses,
      }),
    [steps, elapsedMs, globeReady, workersReady, sourceStatuses],
  )

  const progress = useMemo(
    () => (ready ? 100 : bootstrapProgress(steps, elapsedMs)),
    [ready, steps, elapsedMs],
  )

  const hasFailures = steps.some((s) => s.status === 'failed')
  const timedOut = elapsedMs >= BOOTSTRAP_MAX_MS

  return { ready, steps, progress, hasFailures, timedOut }
}
