import { motion, AnimatePresence } from 'framer-motion'

const STATUS_ICON = {
  ready: '✓',
  loading: '◌',
  pending: '○',
  failed: '!',
  skipped: '—',
}

/**
 * Full-screen bootstrap gate — shown until every enabled layer is loaded.
 */
export default function AtlasBootstrapOverlay({ visible, steps, progress, hasFailures, timedOut }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="atlas-bootstrap"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
          className="atlas-bootstrap-overlay"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <div className="atlas-bootstrap-card">
            <div className="atlas-bootstrap-brand">ATLAS</div>
            <p className="atlas-bootstrap-tagline">Preparing live intelligence layers…</p>

            <div className="atlas-bootstrap-progress-track" aria-hidden>
              <motion.div
                className="atlas-bootstrap-progress-fill"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
              />
            </div>
            <div className="atlas-bootstrap-progress-label">{progress}%</div>

            <ul className="atlas-bootstrap-steps">
              {steps.map((step) => (
                <li
                  key={step.id}
                  className={`atlas-bootstrap-step atlas-bootstrap-step--${step.status}`}
                >
                  <span className="atlas-bootstrap-step-icon" aria-hidden>
                    {STATUS_ICON[step.status] || '○'}
                  </span>
                  <span className="atlas-bootstrap-step-label">{step.label}</span>
                  {step.detail && (
                    <span className="atlas-bootstrap-step-detail">{step.detail}</span>
                  )}
                </li>
              ))}
            </ul>

            {hasFailures && (
              <p className="atlas-bootstrap-hint">
                Some feeds are rate-limited or temporarily unavailable. ATLAS will continue with
                available layers{timedOut ? '.' : ' once the rest finish loading.'}
              </p>
            )}
            {!hasFailures && (
              <p className="atlas-bootstrap-hint">
                Core layers load first (~9s). Aircraft, satellites, and GDELT heatmap continue in the background.
              </p>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
