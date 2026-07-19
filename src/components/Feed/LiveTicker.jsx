/**
 * LiveTicker — bottom headline ticker + expandable "ATLAS Feed" overlay.
 * Redesigned as an evidence stream: authoritative signals lead, social /
 * unverified firehose (Bluesky) is grouped behind a collapsed section, and
 * every card carries provenance (source + tier + freshness).
 * News is unlabeled — no dimension/category filters or badges.
 */
import { useRef, useEffect, useMemo, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ChevronDown, ChevronRight } from 'lucide-react'
import { useAtlasStore } from '../../store/atlasStore'
import { isTickerFeedEvent, getEventSourceId } from '../../core/sourceGeolocation'
import { cleanEventText, timeAgoLabel } from '../../utils/text.js'
import { TierDot } from '../ui/provenance-chip.jsx'
import { getSourceGeoTier } from '../../core/sourceGeolocation'
import { isWithinAtlasCycle } from '../../core/atlasCycle'

/** Neutral accent for feed chrome — not a taxonomy color. */
const SIGNAL_COLOR = 'rgba(255, 255, 255, 0.55)'

/** Social / unverified firehose sources — collapsed below authoritative signals. */
const SOCIAL_SOURCE_IDS = new Set(['bluesky'])

function isSocialItem(item) {
  if (!item.isEvent) return false
  return SOCIAL_SOURCE_IDS.has(getEventSourceId(item.event))
}

function FeedCard({ item, onClick }) {
  const tier = item.isEvent ? getSourceGeoTier(getEventSourceId(item.event)) : null
  const corroborated = item.isEvent && (item.event.corroborationCount || 1) > 1
  return (
    <button className="feed-card" onClick={onClick}>
      <div className="feed-card-stripe" style={{ background: SIGNAL_COLOR }} />
      {item.mediaType === 'video' && item.thumbnailUrl && (
        <div className="relative w-full h-24 overflow-hidden rounded-t" style={{ margin: '-12px -14px 8px -14px', width: 'calc(100% + 28px)' }}>
          <img src={item.thumbnailUrl} alt="" loading="lazy" className="w-full h-full object-cover" />
          {item.isLive && (
            <span
              className="absolute top-1.5 left-1.5 flex items-center gap-0.5 bg-red-600/90 text-white text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
              title="Live YouTube broadcast"
            >
              <span className="w-1 h-1 rounded-full bg-white animate-pulse" />
              LIVE
            </span>
          )}
        </div>
      )}
      <div className="feed-card-body">
        <div className="feed-card-meta">
          <span className="feed-card-time">{timeAgoLabel(item.time)}</span>
          {item.mediaType === 'video' && !item.thumbnailUrl && (
            <span style={{ fontSize: 9, color: item.isLive ? '#ef4444' : 'rgba(255,255,255,0.5)', marginLeft: 4 }}>
              {item.isLive ? '● LIVE' : '▶ VIDEO'}
            </span>
          )}
        </div>
        <h4 className="feed-card-title">{item.title}</h4>
        {item.description && <p className="feed-card-desc">{item.description}</p>}
        <div className="feed-card-source items-center gap-1.5">
          {tier ? (
            <TierDot tier={tier} />
          ) : (
            <div className="feed-card-source-dot" style={{ backgroundColor: SIGNAL_COLOR }} />
          )}
          {item.source}
          {corroborated && (
            <span
              className="font-data text-[9px] text-accent"
              title={`${item.event.corroborationCount} corroborating sources`}
            >
              ×{item.event.corroborationCount}
            </span>
          )}
          {item.isEvent && item.event.latApproximate && (
            <span className="font-data text-[9px] text-p2" title="Approximate location — never pinned on globe">≈</span>
          )}
        </div>
      </div>
    </button>
  )
}

export default function LiveTicker() {
  const newsItems = useAtlasStore((s) => s.newsItems)
  const events = useAtlasStore((s) => s.events)
  const setSelectedMarker = useAtlasStore((s) => s.setSelectedMarker)
  const setSelectedEvent = useAtlasStore((s) => s.setSelectedEvent)
  const mobileMode = useAtlasStore((s) => s.mobileMode)
  const dockRef = useRef(null)
  const [feedOpen, setFeedOpen] = useState(false)
  const [feedSearch, setFeedSearch] = useState('')
  const [socialOpen, setSocialOpen] = useState(false)
  const hoverTimer = useRef(null)
  const feedRef = useRef(null)

  const tickerItems = useMemo(() => {
    // Ticker: approximate / unmapped sources + commercial news.
    // P1 globe events still surface here for breaking visibility.
    const eventItems = events
      .filter((e) => isTickerFeedEvent(e) && isWithinAtlasCycle(e))
      .sort((a, b) => {
        const pr = { p1: 3, p2: 2, p3: 1 }
        const pd = (pr[b.priority] || 0) - (pr[a.priority] || 0)
        if (pd !== 0) return pd
        return b.severity - a.severity || new Date(b.timestamp) - new Date(a.timestamp)
      })
      .slice(0, 35)
      .map(e => ({
        id: `evt_${e.id}`,
        isEvent: true,
        event: e,
        title: cleanEventText(e.title),
        source: e.source,
        color: SIGNAL_COLOR,
        priority: e.priority,
        time: e.timestamp,
        severity: e.severity,
      }))

    const newsTickerItems = newsItems
      .filter((n) => isWithinAtlasCycle({ timestamp: n.publishedAt }))
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 45)
      .map(n => ({
        id: `news_${n.id}`,
        isEvent: false,
        news: n,
        title: cleanEventText(n.title),
        source: n.source,
        color: SIGNAL_COLOR,
        time: n.publishedAt,
        severity: 0,
        mediaType: n.mediaType,
        isLive: n.isLive,
        thumbnailUrl: n.thumbnailUrl,
      }))

    return [...eventItems, ...newsTickerItems]
      .sort((a, b) => b.severity - a.severity || new Date(b.time) - new Date(a.time))
      .slice(0, 40)
  }, [events, newsItems])

  const feedItems = useMemo(() => {
    const evtFeed = events
      .filter((e) => isTickerFeedEvent(e) && isWithinAtlasCycle(e))
      .sort((a, b) => b.severity - a.severity || new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 40)
      .map(e => ({
        id: `evt_${e.id}`,
        isEvent: true,
        event: e,
        title: cleanEventText(e.title),
        source: e.source,
        description: cleanEventText(e.detail),
        color: SIGNAL_COLOR,
        priority: e.priority,
        time: e.timestamp,
        severity: e.severity,
      }))

    const newsFeed = newsItems
      .filter((n) => isWithinAtlasCycle({ timestamp: n.publishedAt }))
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 80)
      .map(n => ({
        id: `news_${n.id}`,
        isEvent: false,
        news: n,
        title: cleanEventText(n.title),
        source: n.source,
        description: cleanEventText(n.description),
        color: SIGNAL_COLOR,
        time: n.publishedAt,
        severity: 0,
        mediaType: n.mediaType,
        isLive: n.isLive,
        thumbnailUrl: n.thumbnailUrl,
      }))

    return [...evtFeed, ...newsFeed]
      .sort((a, b) => b.severity - a.severity || new Date(b.time) - new Date(a.time))
      .slice(0, 120)
  }, [events, newsItems])

  const normalizedQuery = feedSearch.trim().toLowerCase()

  const filteredFeedItems = useMemo(() => {
    if (!normalizedQuery) return feedItems
    return feedItems.filter((item) => {
      const hay = `${item.title || ''} ${item.description || ''} ${item.source || ''}`.toLowerCase()
      return hay.includes(normalizedQuery)
    })
  }, [feedItems, normalizedQuery])

  // Evidence hierarchy: authoritative / verified sources lead; the social
  // firehose collapses behind an explicit section (SOURCES.md tier model).
  const { signalItems, socialItems } = useMemo(() => {
    const signal = []
    const social = []
    for (const item of filteredFeedItems) {
      if (isSocialItem(item)) social.push(item)
      else signal.push(item)
    }
    return { signalItems: signal, socialItems: social }
  }, [filteredFeedItems])

  const feedCountLabel = useMemo(() => {
    const n = filteredFeedItems.length
    const t = feedItems.length
    if (normalizedQuery) {
      return t > 0 ? `${n} / ${t} items` : `${n} items`
    }
    return `${n} items`
  }, [filteredFeedItems.length, feedItems.length, normalizedQuery])

  const handleDockMouseEnter = useCallback(() => {
    if (mobileMode) return
    clearTimeout(hoverTimer.current)
    hoverTimer.current = setTimeout(() => setFeedOpen(true), 200)
  }, [mobileMode])

  /** Clears the delayed open timer so a pending hover cannot reopen right after an explicit close. */
  const closeFeed = useCallback(() => {
    clearTimeout(hoverTimer.current)
    hoverTimer.current = null
    setFeedOpen(false)
  }, [])

  useEffect(() => () => clearTimeout(hoverTimer.current), [])

  // Close only via ✕ or pointerdown outside the dock (overlay + ticker). Do not use mouseleave —
  // it fires spuriously when moving into the search field, scrolling, or crossing subpixel gaps.
  useEffect(() => {
    if (!feedOpen) return

    function onPointerDownCapture(e) {
      const root = dockRef.current
      if (!root || root.contains(e.target)) return
      closeFeed()
    }

    window.addEventListener('pointerdown', onPointerDownCapture, true)
    return () => window.removeEventListener('pointerdown', onPointerDownCapture, true)
  }, [feedOpen, closeFeed])

  if (tickerItems.length === 0) return null

  const tickerDuration = `${tickerItems.length * 8}s`

  const displayItems = [...tickerItems, ...tickerItems]

  const handleItemClick = (item) => {
    if (item.isEvent) {
      setSelectedEvent(item.event)
      setSelectedMarker(null)
    } else {
      setSelectedMarker(item.news)
      setSelectedEvent(null)
    }
    closeFeed()
  }

  return (
    <motion.div
      ref={dockRef}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.35, duration: 0.35 }}
      className="fixed bottom-0 left-0 right-0 z-30"
      onMouseEnter={handleDockMouseEnter}
    >
      <AnimatePresence>
        {feedOpen && (
          <motion.div
            ref={feedRef}
            key="news-feed"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
            className="feed-overlay"
          >
            <div className="feed-header">
              <div className="feed-header-left">
                <div className="feed-live-dot" />
                <span className="feed-header-title">ATLAS Feed</span>
                <span className="feed-header-count">{feedCountLabel}</span>
              </div>
              <div className="feed-header-search-wrap">
                <input
                  type="search"
                  className="feed-search-input"
                  placeholder="Search headlines & descriptions…"
                  value={feedSearch}
                  onChange={(e) => setFeedSearch(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  aria-label="Search feed"
                />
              </div>
              <button
                type="button"
                className="feed-close-btn"
                aria-label="Close feed"
                onClick={(e) => { e.stopPropagation(); closeFeed() }}
              >
                <X size={13} />
              </button>
            </div>

            <div className="feed-grid-scroll">
              {signalItems.length === 0 && socialItems.length === 0 && (
                <p className="feed-empty">No items match your search.</p>
              )}

              <div className="feed-grid">
                {signalItems.map((item) => (
                  <FeedCard key={item.id} item={item} onClick={() => handleItemClick(item)} />
                ))}
              </div>

              {socialItems.length > 0 && (
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => setSocialOpen((v) => !v)}
                    aria-expanded={socialOpen}
                    className="mb-2 inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1.5 font-data text-[10px] uppercase tracking-[0.1em] text-muted transition-colors duration-150 hover:text-text"
                  >
                    {socialOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                    Social / unverified
                    <span className="text-faint">· {socialItems.length}</span>
                  </button>
                  {socialOpen && (
                    <div className="feed-grid">
                      {socialItems.map((item) => (
                        <FeedCard key={item.id} item={item} onClick={() => handleItemClick(item)} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {mobileMode && (
        <button
          onClick={() => {
            setFeedOpen((v) => {
              if (v) {
                clearTimeout(hoverTimer.current)
                hoverTimer.current = null
              }
              return !v
            })
          }}
          className="absolute -top-8 left-1/2 -translate-x-1/2 z-10 bg-black/60 border border-white/10 rounded-full px-3 py-1 text-[8px] tracking-[0.2em] text-white/50 uppercase font-mono backdrop-blur-sm"
        >
          {feedOpen ? 'Close Feed' : 'Open Feed'}
        </button>
      )}

      <div className="glass border-t border-white/5 ticker-shell">
        <div className={`ticker-hover-line ${feedOpen ? 'active' : ''}`} />
        <div
          className="ticker-track"
          style={{ animationDuration: tickerDuration }}
        >
          {displayItems.map((item, i) => (
            <button
              key={`${item.id}-${i}`}
              onClick={() => handleItemClick(item)}
              className="flex items-center gap-2 shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
            >
              {item.mediaType === 'video' ? (
                <span className={`shrink-0 flex items-center gap-0.5 text-[8px] font-bold uppercase tracking-wider rounded px-1 py-px leading-none ${
                  item.isLive
                    ? 'bg-red-600/80 text-white'
                    : 'bg-white/10 text-white/70'
                }`}>
                  {item.isLive ? '● LIVE' : '▶'}
                </span>
              ) : (
                <div
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: SIGNAL_COLOR }}
                />
              )}
              <span className="font-data text-[9px] uppercase tracking-[0.06em] text-white/45">
                {item.source}
              </span>
              <span
                className={`font-data text-[11px] text-white/85 truncate ${mobileMode ? 'max-w-[180px]' : 'max-w-[280px]'}`}
              >
                {item.title}
              </span>
            </button>
          ))}
        </div>
      </div>
    </motion.div>
  )
}
