import { useEffect, useRef } from 'react'
import { useAtlasStore } from '../store/atlasStore'
import { supabase } from '../services/supabase'

/** Map ATLAS event priority → alert tier vocabulary used by send-alert edge function. */
function priorityToTier(priority) {
  if (priority === 'p1') return 'critical'
  if (priority === 'p2') return 'active'
  return 'active'
}

/** Map ATLAS dimension → alert domain vocabulary. */
function dimensionToDomain(dimension) {
  const map = {
    conflict: 'conflict',
    narrative: 'signals',
    economy: 'economic',
    environment: 'natural',
    safety: 'hazard',
    cyber: 'cyber',
  }
  return map[dimension] || dimension || 'signals'
}

/**
 * Dispatch outbound email/SMS alerts via Supabase Edge Function when high-priority
 * events arrive. Requires deployed `send-alert` function + Resend/Twilio env vars.
 */
export function useAlertDispatch(enabled = true) {
  const user = useAtlasStore((s) => s.user)
  const dispatchedRef = useRef(new Set())

  useEffect(() => {
    if (!enabled || !user || !supabase) return undefined

    const dispatch = async (evt) => {
      if (!evt?.id || dispatchedRef.current.has(evt.id)) return
      if (evt.priority !== 'p1' && evt.priority !== 'p2') return

      dispatchedRef.current.add(evt.id)
      if (dispatchedRef.current.size > 500) {
        const arr = [...dispatchedRef.current]
        dispatchedRef.current = new Set(arr.slice(-250))
      }

      try {
        await supabase.functions.invoke('send-alert', {
          body: {
            id: evt.id,
            title: evt.title || 'ATLAS alert',
            tier: priorityToTier(evt.priority),
            domain: dimensionToDomain(evt.dimension),
            region: evt.locationName || 'global',
            severity: evt.severity,
            summary: evt.detail?.slice(0, 280) || '',
          },
        })
      } catch {
        dispatchedRef.current.delete(evt.id)
      }
    }

    return useAtlasStore.subscribe((state, prev) => {
      if (!state.eventBusReady) return
      if (state.events.length <= prev.events.length) return
      const prevIds = new Set(prev.events.map((e) => e.id))
      for (const e of state.events) {
        if (!prevIds.has(e.id)) dispatch(e)
      }
    })
  }, [enabled, user?.id])
}

export default useAlertDispatch
