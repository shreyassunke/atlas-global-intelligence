import { useAtlasStore } from '../../store/atlasStore'

export default function TierCounter() {
  const tierCounts = useAtlasStore((s) => s.tierCounts)
  const sourceStatuses = useAtlasStore((s) => s.sourceStatuses)

  const connectedCount = Object.values(sourceStatuses).filter(s => s.status === 'connected').length
  const totalSources = Math.max(Object.keys(sourceStatuses).length, 1)

  return (
    <div className="tier-counter">
      <div className="api-health">
        <div className={`api-health-dot ${connectedCount > 0 ? 'connected' : 'error'}`} />
        <span>{connectedCount}/{totalSources}</span>
      </div>

      <div className="tier-badge tier-badge-latent">
        <div className="tier-shape tier-shape-circle" />
        <span>{tierCounts.latent}</span>
      </div>

      <div className="tier-badge tier-badge-active">
        <div className="tier-shape tier-shape-diamond" />
        <span>{tierCounts.active}</span>
      </div>

      <div className="tier-badge tier-badge-critical">
        <div className="tier-shape tier-shape-burst" />
        <span>{tierCounts.critical}</span>
      </div>
    </div>
  )
}
