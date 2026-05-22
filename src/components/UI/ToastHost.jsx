import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAtlasStore } from '../../store/atlasStore'

export default function ToastHost() {
  const toasts = useAtlasStore((s) => s.toasts)
  const dismissToast = useAtlasStore((s) => s.dismissToast)

  useEffect(() => {
    if (toasts.length === 0) return undefined
    const timers = toasts.map((t) =>
      setTimeout(() => dismissToast(t.id), t.durationMs ?? 8000),
    )
    return () => timers.forEach(clearTimeout)
  }, [toasts, dismissToast])

  return (
    <div className="atlas-toast-host" aria-live="polite">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.button
            key={t.id}
            type="button"
            className="atlas-toast"
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 24 }}
            transition={{ duration: 0.2 }}
            onClick={() => {
              t.onClick?.()
              dismissToast(t.id)
            }}
          >
            <span className="atlas-toast-label">{t.label}</span>
            <span className="atlas-toast-body">{t.message}</span>
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  )
}
