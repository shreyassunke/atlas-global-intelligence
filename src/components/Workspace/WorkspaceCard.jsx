import { motion } from 'framer-motion'
import { colors } from '../../design/tokens'

const STATUS_META = {
  monitoring: { label: 'Monitoring', pulse: true },
  active: { label: 'Active', pulse: true },
  archived: { label: 'Archived', pulse: false },
}

function formatRegions(regions = []) {
  if (!regions.length) return 'Global scope'
  if (regions.length <= 3) return regions.join(' · ')
  return `${regions.slice(0, 3).join(' · ')} +${regions.length - 3}`
}

export default function WorkspaceCard({
  workspace,
  eventCount = 0,
  onOpen,
  onArchive,
  onDuplicate,
}) {
  const status = STATUS_META[workspace.status] || STATUS_META.monitoring
  const keywords = workspace.keywords || []

  return (
    <motion.article
      layout
      className="ws-card"
      style={{ '--ws-accent': colors.accent }}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="ws-card__visual" aria-hidden>
        <div className="ws-card__grid" />
        {workspace.focus_bbox && (
          <div className="ws-card__region-marker" />
        )}
      </div>

      <div className="ws-card__body">
        <header className="ws-card__header">
          <div className="ws-card__status">
            {status.pulse && <span className="ws-card__pulse" />}
            <span>{status.label}</span>
          </div>
          <span className="ws-card__count">{eventCount} signals</span>
        </header>

        <h2 className="ws-card__title">{workspace.name}</h2>

        {workspace.description && (
          <p className="ws-card__desc">{workspace.description}</p>
        )}

        <div className="ws-card__meta">
          <span className="ws-card__chip">{formatRegions(workspace.focus_regions)}</span>
          {keywords.slice(0, 2).map((k) => (
            <span key={k} className="ws-card__chip ws-card__chip--keyword">{k}</span>
          ))}
        </div>
      </div>

      <footer className="ws-card__actions">
        <button type="button" className="ws-card__btn ws-card__btn--primary" onClick={onOpen}>
          Open workstation
        </button>
        <button type="button" className="ws-card__btn" onClick={onDuplicate}>
          Duplicate
        </button>
        <button type="button" className="ws-card__btn ws-card__btn--ghost" onClick={onArchive}>
          Archive
        </button>
      </footer>
    </motion.article>
  )
}
