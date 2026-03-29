import { useEffect, useRef, useState } from 'react'

/**
 * Fires once when `ref` element intersects the viewport (scroll reveal).
 * If `prefers-reduced-motion: reduce`, visible is true immediately (no IO wait).
 */
function prefersReducedMotion() {
  if (typeof window === 'undefined') return false
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

export function useIntersectionRevealOnce(threshold = 0.12, rootMargin = '-40px') {
  const ref = useRef(null)
  const [isVisible, setIsVisible] = useState(prefersReducedMotion)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (prefersReducedMotion()) {
      setIsVisible(true)
      return
    }

    const el = ref.current
    if (!el) return

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
          obs.disconnect()
        }
      },
      { threshold, rootMargin }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [threshold, rootMargin])

  return [ref, isVisible]
}
