/**
 * Inspector — left rail, one slot (Phase 3 region model).
 *
 * Merges the former EventPanel, NewsCard, and SearchResultCard into a single
 * panel driven by the store's `ui.inspector` coordinator. Opening one content
 * type replaces the previous; closing clears the matching selection so the
 * globe highlight stays in sync.
 */
import { motion, AnimatePresence } from 'framer-motion'
import { useAtlasStore } from '../../store/atlasStore'
import EventContent from './EventContent'
import NewsContent from './NewsContent'
import PlaceContent from './PlaceContent'

export default function Inspector() {
  const inspector = useAtlasStore((s) => s.ui.inspector)
  const selectedEvent = useAtlasStore((s) => s.selectedEvent)
  const selectedMarker = useAtlasStore((s) => s.selectedMarker)
  const searchHighlight = useAtlasStore((s) => s.searchHighlight)
  const closeInspector = useAtlasStore((s) => s.closeInspector)

  const type = inspector?.type
  const payload =
    type === 'event' ? selectedEvent
    : type === 'news' ? selectedMarker
    : type === 'place' ? searchHighlight
    : null

  const contentKey =
    type === 'event' ? `event-${selectedEvent?.id}`
    : type === 'news' ? `news-${selectedMarker?.id}`
    : type === 'place' ? `place-${searchHighlight?.createdAt}`
    : 'none'

  return (
    <AnimatePresence>
      {payload && (
        <motion.aside
          key={contentKey}
          className="inspector-panel"
          role="dialog"
          aria-label={
            type === 'event' ? `Event: ${selectedEvent.title}`
            : type === 'news' ? `News: ${selectedMarker.title}`
            : `Place: ${searchHighlight.label || 'location'}`
          }
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          {type === 'event' && <EventContent event={selectedEvent} onClose={closeInspector} />}
          {type === 'news' && <NewsContent marker={selectedMarker} onClose={closeInspector} />}
          {type === 'place' && <PlaceContent highlight={searchHighlight} onClose={closeInspector} />}
        </motion.aside>
      )}
    </AnimatePresence>
  )
}
