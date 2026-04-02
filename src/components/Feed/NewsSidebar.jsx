/**
 * NewsSidebar — Displays news articles from commercial APIs in a dedicated
 * sidebar panel, decoupled from the globe visualization.
 *
 * News articles that don't have valid geo-coordinates are shown here,
 * providing context without cluttering the map with unreliable locations.
 */
import { useMemo, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAtlasStore } from '../../store/atlasStore'
import { CATEGORIES } from '../../utils/categoryColors'

function timeAgo(dateStr) {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export default function NewsSidebar({ open, onClose }) {
  const newsItems = useAtlasStore((s) => s.newsItems)
  const setSelectedMarker = useAtlasStore((s) => s.setSelectedMarker)
  const [filter, setFilter] = useState('all')

  // Only show articles that DON'T have valid geo coordinates (unmapped)
  // plus optionally all articles when filter is 'all'
  const filteredItems = useMemo(() => {
    let items = newsItems
    if (filter === 'unmapped') {
      items = items.filter((n) => n.lat == null || n.lng == null)
    }
    return items
      .sort((a, b) => (b.importance || 0) - (a.importance || 0))
      .slice(0, 100)
  }, [newsItems, filter])

  const handleArticleClick = useCallback((article) => {
    if (article.url) {
      window.open(article.url, '_blank', 'noopener,noreferrer')
    }
  }, [])

  const handleLocateClick = useCallback((article, e) => {
    e.stopPropagation()
    if (article.lat != null && article.lng != null) {
      setSelectedMarker(article)
    }
  }, [setSelectedMarker])

  if (!open) return null

  return (
    <AnimatePresence>
      <motion.div
        key="news-sidebar"
        initial={{ opacity: 0, x: 320 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 320 }}
        transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
        className="news-sidebar"
      >
        {/* Header */}
        <div className="news-sidebar-header">
          <div className="news-sidebar-header-left">
            <span className="news-sidebar-icon">📰</span>
            <span className="news-sidebar-title">NEWS FEED</span>
            <span className="news-sidebar-count">{filteredItems.length}</span>
          </div>
          <button className="news-sidebar-close" onClick={onClose}>✕</button>
        </div>

        {/* Filter tabs */}
        <div className="news-sidebar-filters">
          <button
            className={`news-sidebar-filter-btn ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All
          </button>
          <button
            className={`news-sidebar-filter-btn ${filter === 'unmapped' ? 'active' : ''}`}
            onClick={() => setFilter('unmapped')}
          >
            Unmapped
          </button>
        </div>

        {/* Article list */}
        <div className="news-sidebar-list">
          {filteredItems.length === 0 && (
            <div className="news-sidebar-empty">
              No articles available
            </div>
          )}
          {filteredItems.map((article) => {
            const cat = CATEGORIES[article.category]
            return (
              <button
                key={article.id}
                className="news-sidebar-card"
                onClick={() => handleArticleClick(article)}
              >
                <div
                  className="news-sidebar-card-stripe"
                  style={{ background: cat?.color || '#555' }}
                />
                {article.thumbnailUrl && (
                  <div className="news-sidebar-card-thumb">
                    <img src={article.thumbnailUrl} alt="" loading="lazy" />
                    {article.isLive && (
                      <span className="news-sidebar-live-badge">
                        <span className="news-sidebar-live-dot" />
                        LIVE
                      </span>
                    )}
                  </div>
                )}
                <div className="news-sidebar-card-body">
                  <div className="news-sidebar-card-meta">
                    <span className="news-sidebar-card-cat" style={{ color: cat?.color || '#aaa' }}>
                      {cat?.icon} {cat?.label || article.category}
                    </span>
                    <span className="news-sidebar-card-time">{timeAgo(article.publishedAt)}</span>
                  </div>
                  <h4 className="news-sidebar-card-title">{article.title}</h4>
                  {article.description && (
                    <p className="news-sidebar-card-desc">{article.description}</p>
                  )}
                  <div className="news-sidebar-card-footer">
                    <span className="news-sidebar-card-source">{article.source}</span>
                    {article.lat != null && article.lng != null && (
                      <button
                        className="news-sidebar-locate-btn"
                        onClick={(e) => handleLocateClick(article, e)}
                        title="Locate on globe"
                      >
                        🎯
                      </button>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        {/* Attribution */}
        <div className="news-sidebar-attribution">
          Globe data provided by the GDELT Project, NASA, and USGS
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
