import { useEffect, useState, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useAtlasStore } from '../../store/atlasStore'
import {
  getYouTubeEmbedUrl,
  warmYouTubeConnection,
  decodeHtmlEntities,
  inferYouTubeEmbedAspectRatio,
} from '../../utils/youtube'

export default function YouTubeEmbedOverlay() {
  const youtubeEmbed = useAtlasStore((s) => s.youtubeEmbed)
  const closeYouTubeEmbed = useAtlasStore((s) => s.closeYouTubeEmbed)

  const open = !!youtubeEmbed?.videoId
  const videoId = youtubeEmbed?.videoId || ''
  const [iframeSrc, setIframeSrc] = useState('')

  useEffect(() => { warmYouTubeConnection() }, [])

  useLayoutEffect(() => {
    if (!open || !videoId) {
      setIframeSrc('')
      return
    }
    let cancelled = false
    let raf2
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        if (cancelled) return
        setIframeSrc(getYouTubeEmbedUrl(videoId, { autoplay: true, origin: window.location.origin }))
      })
    })
    return () => {
      cancelled = true
      cancelAnimationFrame(raf1)
      if (raf2 != null) cancelAnimationFrame(raf2)
    }
  }, [open, videoId])

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') closeYouTubeEmbed()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, closeYouTubeEmbed])

  const title = decodeHtmlEntities(youtubeEmbed?.title || 'Video')
  const watchUrl = youtubeEmbed?.url || (youtubeEmbed?.videoId
    ? `https://www.youtube.com/watch?v=${youtubeEmbed.videoId}`
    : '')
  const aspectRatio = inferYouTubeEmbedAspectRatio(watchUrl, youtubeEmbed?.title || '')
  const isPortrait = aspectRatio.replace(/\s/g, '') === '9/16'

  const overlay = (
    <AnimatePresence>
      {open && (
        <motion.div
          key="youtube-embed-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12, ease: [0.32, 0.72, 0, 1] }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 pointer-events-none"
        >
          <button
            type="button"
            aria-label="Close video"
            className="absolute inset-0 bg-black/60 pointer-events-auto [backdrop-filter:blur(4px)] [-webkit-backdrop-filter:blur(4px)] cursor-default"
            onClick={closeYouTubeEmbed}
          />

          {/* Size follows video shape: 16:9 default, 9:16 for Shorts — no rounded card corners */}
          <motion.div
            initial={{ opacity: 0, scale: 0.98, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 6 }}
            transition={{ duration: 0.14, ease: [0.32, 0.72, 0, 1] }}
            className={`relative pointer-events-auto glass rounded-none shadow-2xl border border-white/10 overflow-hidden flex flex-col max-h-[85vh] will-change-transform [transform:translateZ(0)] ${
              isPortrait
                ? 'w-[min(92vw,calc((85vh-52px)*9/16))]'
                : 'w-[min(92vw,1080px)]'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Clean header: title left, actions right */}
            <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-white/10 bg-black/60 flex-shrink-0">
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                {youtubeEmbed?.isLive && (
                  <span className="flex items-center gap-1 rounded bg-red-600/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white flex-shrink-0">
                    <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                    Live
                  </span>
                )}
                <span className="truncate text-[13px] font-medium text-white/95" title={title}>
                  {title}
                </span>
              </div>

              <div className="flex items-center gap-1 flex-shrink-0">
                {watchUrl && (
                  <a
                    href={watchUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[10px] font-mono uppercase tracking-wider text-[var(--accent)] transition-colors hover:bg-white/10"
                    title="Open on YouTube"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                    <span className="hidden sm:inline">YouTube</span>
                  </a>
                )}
                <button
                  type="button"
                  onClick={closeYouTubeEmbed}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                  title="Close (Esc)"
                  aria-label="Close video"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Video area — aspect matches typical upload (16:9) or Short (9:16) */}
            <div className="relative w-full bg-black" style={{ aspectRatio }}>
              {iframeSrc ? (
                <iframe
                  key={videoId}
                  title={title}
                  src={iframeSrc}
                  className="absolute inset-0 h-full w-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
                  allowFullScreen
                  referrerPolicy="strict-origin-when-cross-origin"
                />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                  <div className="h-7 w-7 rounded-full border-2 border-white/15 border-t-white/45 animate-spin [animation-duration:0.7s]" />
                  <span className="text-[10px] font-mono uppercase tracking-wider text-white/35">Loading…</span>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )

  if (typeof document === 'undefined') return null
  return createPortal(overlay, document.body)
}
