/**
 * Animated wind particle overlay for Globe.GL.
 * Uses Open-Meteo wind grid ($0) — inspired by WeatherLayers particle layer.
 */
import { useEffect, useRef } from 'react'
import { fetchWindGrid, sampleWind } from '../../core/windGrid'

const PARTICLE_COUNT = 1200
const PARTICLE_SPEED = 0.35

/**
 * @param {{ enabled?: boolean }} props
 */
export default function WindParticleOverlay({ enabled = false }) {
  const canvasRef = useRef(null)
  const animRef = useRef(0)
  const gridRef = useRef(null)
  const particlesRef = useRef(null)

  useEffect(() => {
    if (!enabled) return undefined
    let cancelled = false

    fetchWindGrid()
      .then((grid) => {
        if (!cancelled) gridRef.current = grid
      })
      .catch(() => { /* overlay stays empty */ })

    return () => { cancelled = true }
  }, [enabled])

  useEffect(() => {
    if (!enabled) {
      if (animRef.current) cancelAnimationFrame(animRef.current)
      return undefined
    }

    const canvas = canvasRef.current
    if (!canvas) return undefined
    const ctx = canvas.getContext('2d')
    if (!ctx) return undefined

    if (!particlesRef.current) {
      particlesRef.current = Array.from({ length: PARTICLE_COUNT }, () => ({
        x: Math.random(),
        y: Math.random(),
        age: Math.random() * 100,
      }))
    }

    const resize = () => {
      const parent = canvas.parentElement
      if (!parent) return
      canvas.width = parent.clientWidth
      canvas.height = parent.clientHeight
    }
    resize()
    window.addEventListener('resize', resize)

    const tick = () => {
      const grid = gridRef.current
      const particles = particlesRef.current
      if (!grid || !particles) {
        animRef.current = requestAnimationFrame(tick)
        return
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.globalCompositeOperation = 'lighter'

      for (const p of particles) {
        p.age += 1
        const lat = 90 - p.y * 180
        const lng = p.x * 360 - 180
        const { u, v } = sampleWind(grid, lat, lng)
        const speed = Math.sqrt(u * u + v * v)
        p.x += (u * PARTICLE_SPEED) / canvas.width
        p.y -= (v * PARTICLE_SPEED) / canvas.height

        if (p.age > 120 || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1 || speed < 0.05) {
          p.x = Math.random()
          p.y = Math.random()
          p.age = 0
        }

        const px = p.x * canvas.width
        const py = p.y * canvas.height
        const alpha = Math.min(0.85, 0.15 + speed * 0.12)
        ctx.strokeStyle = `rgba(120, 220, 255, ${alpha})`
        ctx.lineWidth = 1.2
        ctx.beginPath()
        ctx.moveTo(px, py)
        const tailLen = 4 + speed * 3
        const angle = Math.atan2(-v, u)
        ctx.lineTo(px - Math.cos(angle) * tailLen, py + Math.sin(angle) * tailLen)
        ctx.stroke()
      }

      ctx.globalCompositeOperation = 'source-over'
      animRef.current = requestAnimationFrame(tick)
    }

    animRef.current = requestAnimationFrame(tick)

    return () => {
      window.removeEventListener('resize', resize)
      if (animRef.current) cancelAnimationFrame(animRef.current)
    }
  }, [enabled])

  if (!enabled) return null

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 z-[1]"
      aria-hidden
    />
  )
}
