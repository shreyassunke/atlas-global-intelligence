/**
 * Debounced workspace event capture — only user-pinned (canvas) evidence
 * is persisted. Live feed matches are not auto-saved.
 */
import { useEffect, useRef } from 'react'
import { useAtlasStore } from '../store/atlasStore'
import { subscribeToBatchUpdates } from '../core/eventBus'
import { eventToWorkspaceEventRow } from '../core/workspaceMatch'
import { pinnedEventIds } from '../core/atlasCycle'
import { supabase } from '../services/supabase'

const UPSERT_DEBOUNCE_MS = 800

export default function useWorkspaceEventCapture(enabled = true) {
  const pendingRef = useRef(new Map())
  const timerRef = useRef(null)

  useEffect(() => {
    if (!enabled) return undefined

    const flush = async () => {
      const batch = [...pendingRef.current.values()]
      pendingRef.current.clear()
      if (!batch.length || !supabase) return

      const { error } = await supabase
        .from('workspace_events')
        .upsert(batch, { onConflict: 'workspace_id,event_id' })

      if (error) {
        console.warn('[workspace capture]', error.message)
      }
    }

    const scheduleFlush = () => {
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(flush, UPSERT_DEBOUNCE_MS)
    }

    const unsub = subscribeToBatchUpdates((diff) => {
      const state = useAtlasStore.getState()
      if (state.appView !== 'workstation' || !state.user || !state.activeWorkspaceId) return

      const pinned = pinnedEventIds(state.investigation)
      if (!pinned.size) return

      const incoming = []
      if (diff.added?.length) incoming.push(...diff.added)
      if (diff.updated?.length) incoming.push(...diff.updated)

      for (const event of incoming) {
        if (!pinned.has(event.id)) continue
        const row = eventToWorkspaceEventRow(state.activeWorkspaceId, event)
        pendingRef.current.set(row.event_id, row)
        state.appendWorkspaceEvent(row)
      }

      if (pendingRef.current.size) scheduleFlush()
    })

    return () => {
      unsub()
      clearTimeout(timerRef.current)
      flush()
    }
  }, [enabled])
}
