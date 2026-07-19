import { useEffect } from 'react'
import { useAtlasStore } from '../../store/atlasStore'

/**
 * Launch handoff — instant cut to globe (no second WebGL context).
 * Particle animation was blocking the main thread and fighting Map3D init.
 */
export default function ParticleEarthTransition() {
  const completeOnboarding = useAtlasStore((s) => s.completeOnboarding)
  const endLaunchTransition = useAtlasStore((s) => s.endLaunchTransition)
  const setSkipCesiumIntro = useAtlasStore((s) => s.setSkipCesiumIntro)

  useEffect(() => {
    setSkipCesiumIntro(true)
    completeOnboarding()
    endLaunchTransition()
  }, [completeOnboarding, endLaunchTransition, setSkipCesiumIntro])

  return (
    <div
      className="fixed inset-0 bg-[#030712]"
      aria-hidden
      style={{ pointerEvents: 'none' }}
    />
  )
}
