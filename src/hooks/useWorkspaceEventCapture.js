/**
 * Debounced workspace event capture — non-blocking Supabase upserts
 * while the workstation is active.
 */
import { useEffect, useRef } from 'react'
import { useAtlasStore } from '../store/atlasStore'
import { subscribeToBatchUpdates } from '../core/eventBus'
import { eventMatchesWorkspace, eventToWorkspaceEventRow } from '../core/workspaceMatch'
import { loadCountryIndex } from '../services/countryIndex'
import { supabase } from '../services/supabase'

const UPSERT_DEBOUNCE_MS = 800

export default function useWorkspaceEventCapture(enabled = true) {
  const pendingRef = useRef(new Map())
  const timerRef = useRef(null)
  const countryIndexRef = useRef(null)

  useEffect(() => {
    if (!enabled) return undefined
    loadCountryIndex().then((idx) => { countryIndexRef.current = idx }).catch(() => {})
    return undefined
  }, [enabled])

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

      const workspace = state.getActiveWorkspace()
      if (!workspace) return

      const incoming = []
      if (diff.added?.length) incoming.push(...diff.added)
      if (diff.updated?.length) incoming.push(...diff.updated)

      for (const event of incoming) {
        if (!eventMatchesWorkspace(workspace, event, { countryIndex: countryIndexRef.current })) continue
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
