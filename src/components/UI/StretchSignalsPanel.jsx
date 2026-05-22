import { useState, useEffect } from 'react'
import { useAtlasStore } from '../../store/atlasStore'
import { fetchFactCheckClaims, fetchSentinel2Scene } from '../../services/stretch/stretchApi'

/**
 * Phase 6 stretch UI — social reach, reactive fact-check lookup, Sentinel-2 on-demand.
 * @param {{ event: object }} props
 */
export default function StretchSignalsPanel({ event }) {
  const setSentinel2Scene = useAtlasStore((s) => s.setSentinel2Scene)
  const clearSentinel2Scene = useAtlasStore((s) => s.clearSentinel2Scene)
  const sentinel2Scene = useAtlasStore((s) => s.sentinel2Scene)

  const [factMatches, setFactMatches] = useState([])
  const [factLoading, setFactLoading] = useState(false)
  const [factError, setFactError] = useState(null)
  const [sentinelLoading, setSentinelLoading] = useState(false)
  const [sentinelError, setSentinelError] = useState(null)
  const [localScene, setLocalScene] = useState(null)

  const hasFactCheckFields = Boolean(event?.factCheckRating)
  const hasSocialReach = Boolean(event?.socialReach)
  const canFetchSentinel = !event?.latApproximate && event?.lat != null && event?.lng != null

  // Reactive fact-check lookup for non-fact-check events
  useEffect(() => {
    if (!event?.title || hasFactCheckFields) {
      setFactMatches([])
      setFactError(null)
      return
    }
    let cancelled = false
    setFactLoading(true)
    setFactError(null)
    fetchFactCheckClaims(event.title)
      .then((data) => {
        if (cancelled) return
        setFactMatches(data.claims?.slice(0, 3) || [])
        if (data.warning && !data.claims?.length) setFactError(data.warning)
      })
      .catch((err) => {
        if (!cancelled) setFactError(err.message || 'Fact check lookup failed')
      })
      .finally(() => {
        if (!cancelled) setFactLoading(false)
      })
    return () => { cancelled = true }
  }, [event?.id, event?.title, hasFactCheckFields])

  async function handleSentinelFetch() {
    if (!canFetchSentinel) return
    setSentinelLoading(true)
    setSentinelError(null)
    try {
      const data = await fetchSentinel2Scene(event.lat, event.lng, 30)
      if (data.error) throw new Error(data.error)
      if (!data.scene) {
        setSentinelError(data.message || 'No Sentinel-2 scene found for this area')
        setLocalScene(null)
        clearSentinel2Scene()
        return
      }
      setLocalScene(data.scene)
      setSentinel2Scene(data.scene)
    } catch (err) {
      setSentinelError(err.message || 'Sentinel-2 fetch failed')
      setLocalScene(null)
      clearSentinel2Scene()
    } finally {
      setSentinelLoading(false)
    }
  }

  const scene = localScene || (sentinel2Scene?.lat === event?.lat ? sentinel2Scene : null)

  if (!hasSocialReach && !hasFactCheckFields && !canFetchSentinel && !factLoading && !factMatches.length) {
    return null
  }

  return (
    <div className="stretch-signals-panel">
      {hasSocialReach && (
        <div className="stretch-signals-block">
          <span className="event-meta-label">Social reach (Bluesky)</span>
          <div className="stretch-social-reach-row">
            <span title="Likes">♥ {event.socialReach.likes ?? 0}</span>
            <span title="Reposts">↻ {event.socialReach.reposts ?? 0}</span>
            <span title="Replies">💬 {event.socialReach.replies ?? 0}</span>
          </div>
          <div className="stretch-signals-hint">
            Engagement from Bluesky Jetstream — approximate location
          </div>
        </div>
      )}

      {hasFactCheckFields && (
        <div className="stretch-signals-block stretch-fact-check-block">
          <span className="event-meta-label">Fact Check</span>
          <div className="stretch-fact-check-rating">{event.factCheckRating}</div>
          <div className="stretch-signals-hint">
            {event.factCheckPublisher}
            {event.factCheckUrl && (
              <>
                {' · '}
                <a href={event.factCheckUrl} target="_blank" rel="noopener noreferrer" className="stretch-link">
                  Review
                </a>
              </>
            )}
          </div>
        </div>
      )}

      {!hasFactCheckFields && (factLoading || factMatches.length > 0 || factError) && (
        <div className="stretch-signals-block">
          <span className="event-meta-label">Related fact checks</span>
          {factLoading && <div className="stretch-signals-hint">Searching ClaimReview…</div>}
          {factError && !factMatches.length && (
            <div className="stretch-signals-hint stretch-signals-warn">{factError}</div>
          )}
          {factMatches.map((c, i) => (
            <div key={i} className="stretch-fact-match">
              <span className="stretch-fact-check-rating">{c.rating}</span>
              <span className="stretch-fact-match-text">{c.claim?.slice(0, 100)}</span>
              {c.publisherUrl && (
                <a href={c.publisherUrl} target="_blank" rel="noopener noreferrer" className="stretch-link">
                  {c.publisher}
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      {canFetchSentinel && (
        <div className="stretch-signals-block">
          <span className="event-meta-label">Sentinel-2 imagery</span>
          {!scene && (
            <button
              type="button"
              className="event-source-link"
              style={{ width: '100%', cursor: 'pointer', marginTop: 4 }}
              disabled={sentinelLoading}
              onClick={handleSentinelFetch}
            >
              {sentinelLoading ? 'Searching Copernicus STAC…' : '🛰 Fetch satellite pass'}
            </button>
          )}
          {sentinelError && !scene && (
            <div className="stretch-signals-hint stretch-signals-warn">{sentinelError}</div>
          )}
          {scene && (
            <>
              {scene.thumbnailUrl && (
                <a
                  href={scene.thumbnailUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="stretch-sentinel-thumb-wrap"
                >
                  <img
                    src={scene.thumbnailUrl}
                    alt="Sentinel-2 scene"
                    className="stretch-sentinel-thumb"
                  />
                </a>
              )}
              <div className="stretch-signals-hint">
                {scene.platform || 'Sentinel-2'} · {scene.datetime ? new Date(scene.datetime).toLocaleDateString() : '—'}
                {scene.cloudCover != null && ` · ${scene.cloudCover.toFixed(0)}% cloud`}
              </div>
            </>
          )}
          <div className="stretch-signals-hint">
            Copernicus Data Space — on-demand L2A ($0 catalog)
          </div>
        </div>
      )}
    </div>
  )
}
