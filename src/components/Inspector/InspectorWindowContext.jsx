/**
 * Shared window chrome for inspector panels — drag handle helpers,
 * minimize / fullscreen / close controls.
 */
import { createContext, useContext } from 'react'
import { Minus, Maximize2, Minimize2, X } from 'lucide-react'
import { cn } from '../../lib/utils'

/** @type {React.Context<{
 *   mode: 'normal'|'minimized'|'fullscreen',
 *   setMode: (m: 'normal'|'minimized'|'fullscreen') => void,
 *   toggleMinimized: () => void,
 *   toggleFullscreen: () => void,
 *   onClose: () => void,
 *   onDragHandlePointerDown: (e: React.PointerEvent) => void,
 * } | null>} */
const InspectorWindowContext = createContext(null)

export function InspectorWindowProvider({ value, children }) {
  return (
    <InspectorWindowContext.Provider value={value}>
      {children}
    </InspectorWindowContext.Provider>
  )
}

export function useInspectorWindow() {
  return useContext(InspectorWindowContext)
}

/**
 * Minimize / fullscreen / close cluster for inspector headers.
 */
export function InspectorWindowControls({ className }) {
  const api = useInspectorWindow()
  if (!api) return null

  const { mode, toggleMinimized, toggleFullscreen, onClose } = api
  const isFullscreen = mode === 'fullscreen'
  const isMinimized = mode === 'minimized'

  return (
    <div
      className={cn('inspector-panel__window-controls', className)}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="inspector-panel__window-btn"
        aria-label={isMinimized ? 'Restore panel' : 'Minimize panel'}
        title={isMinimized ? 'Restore' : 'Minimize'}
        onClick={toggleMinimized}
      >
        <Minus size={14} strokeWidth={2} aria-hidden />
      </button>
      <button
        type="button"
        className="inspector-panel__window-btn"
        aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen panel'}
        title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        onClick={toggleFullscreen}
      >
        {isFullscreen ? (
          <Minimize2 size={13} strokeWidth={2} aria-hidden />
        ) : (
          <Maximize2 size={13} strokeWidth={2} aria-hidden />
        )}
      </button>
      <button
        type="button"
        className="inspector-panel__window-btn"
        aria-label="Close"
        title="Close"
        onClick={onClose}
      >
        <X size={14} strokeWidth={2} aria-hidden />
      </button>
    </div>
  )
}
