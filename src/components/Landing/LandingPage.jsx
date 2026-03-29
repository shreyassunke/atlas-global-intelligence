import { useCallback, useEffect, useRef, useState, lazy, Suspense } from 'react'
import { motion } from 'framer-motion'
import { GlassFilter } from '../UI/liquid-glass'
import { AtlasWordmark } from '../UI/AtlasWordmark'
import { useAtlasStore } from '../../store/atlasStore'
import { LandingGlobeDemoFallback } from './LandingGlobeDemoFallback'

const LandingGlobeDemo = lazy(() => import('./LandingGlobeDemo'))

const LANDING_NAV = [
  { id: 'cta-join', label: 'Explore' },
  { id: 'contact', label: 'Contact' },
]

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: (i) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.05 * i, duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  }),
}

export default function LandingPage() {
  const acknowledgeLanding = useAtlasStore((s) => s.acknowledgeLanding)
  const hasCompletedOnboarding = useAtlasStore((s) => s.hasCompletedOnboarding)
  const landingScrollRef = useRef(null)
  const navTopSentinelRef = useRef(null)
  const [navAtTop, setNavAtTop] = useState(true)

  const scrollTo = useCallback((id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const scrollLandingTop = useCallback(() => {
    landingScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const enterApp = useCallback(() => acknowledgeLanding(), [acknowledgeLanding])

  useEffect(() => {
    const root = landingScrollRef.current
    const sentinel = navTopSentinelRef.current
    if (!root || !sentinel) return
    const obs = new IntersectionObserver(
      ([entry]) => {
        setNavAtTop(entry.isIntersecting)
      },
      { root, rootMargin: '0px', threshold: 0 },
    )
    obs.observe(sentinel)
    return () => obs.disconnect()
  }, [])

  return (
    <motion.div
      ref={landingScrollRef}
      className="landing-page stitch-landing fixed inset-0 z-[55] flex flex-col overflow-y-auto overflow-x-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      role="document"
      aria-label="TATVA introduction"
    >
      <div ref={navTopSentinelRef} className="stitch-nav-scroll-sentinel" aria-hidden />
      <GlassFilter />
      <div className="landing-globe-immersive">
        <Suspense fallback={<LandingGlobeDemoFallback immersive />}>
          <LandingGlobeDemo immersive />
        </Suspense>
      </div>
      <div className="landing-page__glow pointer-events-none" aria-hidden />

      <header
        className={`stitch-nav-wrap stitch-nav-wrap--floating sticky top-0 z-30${navAtTop ? '' : ' stitch-nav-wrap--scrolled'}`}
      >
        <nav className="stitch-nav-bar" aria-label="Primary">
          <button
            type="button"
            className="stitch-nav-logo flex items-center shrink-0 border-0 bg-transparent p-0 cursor-pointer text-inherit justify-self-start"
            onClick={scrollLandingTop}
            aria-label="TATVA — top of page"
          >
            <AtlasWordmark height={20} className="w-auto opacity-[0.98]" aria-hidden />
          </button>
          <div className="stitch-nav-bar__links stitch-nav-bar__links--desktop">
            {LANDING_NAV.map(({ id, label }) => (
              <button key={id} type="button" onClick={() => scrollTo(id)} className="stitch-nav-link">
                {label}
              </button>
            ))}
          </div>
          <div className="stitch-nav-bar__actions justify-self-end">
            <button type="button" onClick={enterApp} className="stitch-btn-primary stitch-btn-primary--nav">
              {hasCompletedOnboarding ? 'Login' : 'Get started'}
            </button>
          </div>
          <div className="stitch-nav-bar__links stitch-nav-bar__links--mobile">
            {LANDING_NAV.map(({ id, label }) => (
              <button key={id} type="button" onClick={() => scrollTo(id)} className="stitch-nav-link">
                {label}
              </button>
            ))}
          </div>
        </nav>
      </header>

      <main className="relative z-10 stitch-landing__content landing-main-over-globe">
        <section className="stitch-hero stitch-hero--center-sm stitch-hero--fold">
          <div className="stitch-hero__copy landing-hit-target mx-auto lg:mx-0 w-full flex flex-col flex-1 min-h-0">
            <motion.p
              custom={0}
              variants={fadeUp}
              initial="hidden"
              animate="show"
              className="stitch-eyebrow font-[family-name:var(--font-ui)] text-[11px] sm:text-xs tracking-[0.25em] uppercase text-sky-400/90 mb-4"
            >
              Global intelligence
            </motion.p>
            <motion.h1
              custom={1}
              variants={fadeUp}
              initial="hidden"
              animate="show"
              className="font-[family-name:var(--font-ui)] font-bold text-white tracking-tight stitch-hero-title text-center lg:text-left leading-[1.12]"
            >
              Every signal. Every source. One living globe.
            </motion.h1>
            <motion.p
              custom={2}
              variants={fadeUp}
              initial="hidden"
              animate="show"
              className="mt-4 text-[#9ca3af] text-sm sm:text-base leading-relaxed font-[family-name:var(--font-ui)] max-w-prose mx-auto lg:mx-0"
            >
              Open-source intel on a living globe — then dive into setup and your feeds. Spin the globe and click the
              markers to discover features and who TATVA is for.
            </motion.p>
            <motion.div
              custom={3}
              variants={fadeUp}
              initial="hidden"
              animate="show"
              className="mt-8 flex justify-center lg:justify-start"
            >
              <button type="button" onClick={enterApp} className="stitch-btn-primary stitch-btn-primary--hero">
                Get started
              </button>
            </motion.div>
          </div>
          <div className="stitch-hero__scroll-wrap landing-hit-target flex justify-center pt-6 pb-2">
            <button
              type="button"
              className="stitch-hero-scroll-cue"
              onClick={() => scrollTo('cta-join')}
              aria-label="Scroll to next section"
            >
              <span className="stitch-hero-scroll-cue__line" aria-hidden />
              <span className="stitch-hero-scroll-cue__chev" aria-hidden>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </button>
          </div>
        </section>

        <section
          id="cta-join"
          className="stitch-cta-band rounded-2xl sm:rounded-3xl px-5 sm:px-8 py-10 sm:py-12 md:py-14 text-center mt-10 sm:mt-12 lg:mt-16 mb-12 sm:mb-14 scroll-mt-24"
        >
          <div className="stitch-starfield-mini pointer-events-none" aria-hidden />
          <div className="relative stitch-cta-inner landing-hit-target px-1">
            <h2 className="font-[family-name:var(--font-ui)] text-xl sm:text-2xl md:text-3xl font-bold text-white mb-7 sm:mb-8">
              The world is signaling. Are you listening?
            </h2>
            <div className="flex justify-center">
              <button type="button" onClick={enterApp} className="stitch-btn-primary stitch-btn-primary--wide">
                {hasCompletedOnboarding ? 'Login' : 'Get started now'}
              </button>
            </div>
          </div>
        </section>

        <footer
          id="contact"
          className="stitch-footer landing-hit-target scroll-mt-24 border-t border-white/[0.06]"
        >
          <div className="stitch-footer__inner">
            <button
              type="button"
              className="stitch-footer__brand flex items-center border-0 bg-transparent p-0 cursor-pointer text-inherit shrink-0"
              onClick={scrollLandingTop}
              aria-label="TATVA — top of page"
            >
              <AtlasWordmark height={17} className="w-auto opacity-90" aria-hidden />
            </button>
            <nav className="stitch-footer__links" aria-label="Footer">
              <button type="button" onClick={() => scrollTo('cta-join')} className="stitch-footer-link">
                Explore
              </button>
              <button type="button" onClick={() => scrollTo('contact')} className="stitch-footer-link">
                Contact
              </button>
            </nav>
            <div className="stitch-footer__social" aria-label="Social">
              {['in', 'x', 'gh', 'yt'].map((k) => (
                <span key={k} className="stitch-social-dot" title={k} />
              ))}
            </div>
          </div>
          <p className="stitch-footer__tagline font-[family-name:var(--font-data)] text-[10px] sm:text-[11px] tracking-[0.14em] uppercase text-white/28 text-center px-4 pb-6 pt-5 mt-0 border-t border-white/[0.05]">
            Open-source signals · Not operational intelligence
          </p>
        </footer>
      </main>
    </motion.div>
  )
}
