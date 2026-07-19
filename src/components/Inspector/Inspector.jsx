/**
 * Inspector — left rail, one slot (Phase 3 region model).
 *
 * Merges the former EventPanel, NewsCard, and SearchResultCard into a single
 * panel driven by the store's `ui.inspector` coordinator. Opening one content
 * type replaces the previous; closing clears the matching selection so the
 * globe highlight stays in sync.
 *
 * Panels are draggable and support minimize / fullscreen window chrome.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { GripVertical } from 'lucide-react'
import { useAtlasStore } from '../../store/atlasStore'
import { hexWithAlpha } from '../../core/eventSchema'
import { cn } from '../../lib/utils'
import EventContent from './EventContent'
import NewsContent from './NewsContent'
import PlaceContent from './PlaceContent'
import EconomyContent from './EconomyContent'
import CountryNewsContent from './CountryNewsContent'
import WeatherContent from './WeatherContent'
import {
  InspectorWindowProvider,
  InspectorWindowControls,
} from './InspectorWindowContext'

const PANEL_PAD = 8
const DEFAULT_W = 360

function clampPosition(x, y, width, height) {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800
  const w = Math.min(width || DEFAULT_W, vw - PANEL_PAD * 2)
  const h = Math.min(height || 120, vh - PANEL_PAD * 2)
  return {
    x: Math.max(PANEL_PAD, Math.min(x, vw - w - PANEL_PAD)),
    y: Math.max(PANEL_PAD, Math.min(y, vh - h - PANEL_PAD)),
  }
}

export default function Inspector() {
  const inspector = useAtlasStore((s) => s.ui.inspector)
  const selectedEvent = useAtlasStore((s) => s.selectedEvent)
  const selectedMarker = useAtlasStore((s) => s.selectedMarker)
  const searchHighlight = useAtlasStore((s) => s.searchHighlight)
  const closeInspector = useAtlasStore((s) => s.closeInspector)

  const type = inspector?.type
  const countryPayload = inspector?.payload

  const payload =
    type === 'event' ? selectedEvent
    : type === 'news' ? selectedMarker
    : type === 'place' ? searchHighlight
    : type === 'economy' || type === 'countryNews' || type === 'weather'
      ? countryPayload
      : null

  const contentKey =
    type === 'event' ? `event-${selectedEvent?.id}`
    : type === 'news' ? `news-${selectedMarker?.id}`
    : type === 'place' ? `place-${searchHighlight?.createdAt}`
    : type === 'economy' ? `economy-${countryPayload?.lat}-${countryPayload?.lng}-${countryPayload?.place?.label || countryPayload?.country?.name}`
    : type === 'countryNews' ? `cnews-${countryPayload?.lat}-${countryPayload?.lng}-${countryPayload?.place?.label || countryPayload?.country?.name}`
    : type === 'weather' ? `weather-${countryPayload?.lat}-${countryPayload?.lng}`
    : 'none'

  const eventDimColor =
    type === 'event' || type === 'news' || type === 'economy' || type === 'countryNews' || type === 'weather'
      ? '#1a90ff'
      : null

  const ariaLabel =
    type === 'event' ? `Event: ${selectedEvent?.title}`
    : type === 'news' ? `News: ${selectedMarker?.title}`
    : type === 'place' ? `Place: ${searchHighlight?.label || 'location'}`
    : type === 'economy' ? `Economy: ${countryPayload?.place?.label || countryPayload?.country?.name}`
    : type === 'countryNews' ? `News coverage: ${countryPayload?.place?.label || countryPayload?.country?.name}`
    : type === 'weather' ? `Weather: ${countryPayload?.place?.label || countryPayload?.country?.name}`
    : 'Inspector'

  const panelRef = useRef(null)
  const [mode, setMode] = useState('normal')
  const [pos, setPos] = useState(null)
  const [dragging, setDragging] = useState(false)
  const dragSession = useRef(null)

  useEffect(() => {
    setMode('normal')
  }, [contentKey])

  const toggleMinimized = useCallback(() => {
    setMode((m) => (m === 'minimized' ? 'normal' : 'minimized'))
  }, [])

  const toggleFullscreen = useCallback(() => {
    setMode((m) => (m === 'fullscreen' ? 'normal' : 'fullscreen'))
  }, [])

  const onDragHandlePointerDown = useCallback((e) => {
    if (e.button !== 0) return
    if (e.target.closest('button, a, input, textarea, select, label')) return
    const el = panelRef.current
    if (!el) return
    // Fullscreen stays locked to the viewport.
    if (el.classList.contains('inspector-panel--fullscreen')) return

    e.preventDefault()
    const rect = el.getBoundingClientRect()
    dragSession.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origX: rect.left,
      origY: rect.top,
      width: rect.width,
      height: rect.height,
    }
    setDragging(true)
    setPos({ x: rect.left, y: rect.top })
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    if (!dragging) return undefined

    const onMove = (e) => {
      const s = dragSession.current
      if (!s || e.pointerId !== s.pointerId) return
      const next = clampPosition(
        s.origX + (e.clientX - s.startX),
        s.origY + (e.clientY - s.startY),
        s.width,
        s.height,
      )
      setPos(next)
    }

    const onUp = (e) => {
      const s = dragSession.current
      if (!s || e.pointerId !== s.pointerId) return
      dragSession.current = null
      setDragging(false)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [dragging])

  const windowApi = useMemo(
    () => ({
      mode,
      setMode,
      toggleMinimized,
      toggleFullscreen,
      onClose: closeInspector,
      onDragHandlePointerDown,
    }),
    [mode, toggleMinimized, toggleFullscreen, closeInspector, onDragHandlePointerDown],
  )

  const panelStyle = {
    ...(eventDimColor
      ? { borderLeft: `2px solid ${hexWithAlpha(eventDimColor, 0.4)}` }
      : {}),
    ...(mode !== 'fullscreen' && pos
      ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' }
      : {}),
  }

  return (
    <AnimatePresence>
      {payload && (
        <motion.aside
          key={contentKey}
          ref={panelRef}
          className={cn(
            'inspector-panel',
            type === 'economy' && 'inspector-panel--economy',
            mode === 'minimized' && 'inspector-panel--minimized',
            mode === 'fullscreen' && 'inspector-panel--fullscreen',
            dragging && 'inspector-panel--dragging',
          )}
          role="dialog"
          style={panelStyle}
          aria-label={ariaLabel}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          <InspectorWindowProvider value={windowApi}>
            {mode === 'minimized' && (
              <div
                className="inspector-panel__mini-bar inspector-panel__drag-header"
                onPointerDown={onDragHandlePointerDown}
              >
                <GripVertical size={14} className="inspector-panel__grip" aria-hidden />
                <span className="inspector-panel__mini-title">{ariaLabel}</span>
                <InspectorWindowControls />
              </div>
            )}
            <div
              className={cn(
                'inspector-panel__content',
                mode === 'minimized' && 'inspector-panel__content--collapsed',
              )}
              aria-hidden={mode === 'minimized'}
            >
              {type === 'event' && <EventContent event={selectedEvent} onClose={closeInspector} />}
              {type === 'news' && <NewsContent marker={selectedMarker} onClose={closeInspector} />}
              {type === 'place' && <PlaceContent highlight={searchHighlight} onClose={closeInspector} />}
              {type === 'economy' && <EconomyContent payload={countryPayload} onClose={closeInspector} />}
              {type === 'countryNews' && <CountryNewsContent payload={countryPayload} onClose={closeInspector} />}
              {type === 'weather' && <WeatherContent payload={countryPayload} onClose={closeInspector} />}
            </div>
          </InspectorWindowProvider>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}
