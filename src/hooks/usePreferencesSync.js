import { useEffect, useRef } from 'react'
import { useAtlasStore } from '../store/atlasStore'
import { supabase } from '../services/supabase'

const DEBOUNCE_MS = 1000

function pickPreferences(state) {
  return {
    selected_sources: state.selectedSources,
    globe_mode: state.globeMode,
    quality_tier: state.qualityTier,
    quality_overrides: state.qualityOverrides,
    colorblind_mode: state.colorblindMode,
    severity_floor: state.severityFloor,
    active_domains: [...state.activeDomains],
  }
}

export function usePreferencesSync() {
  const user = useAtlasStore((s) => s.user)
  const timerRef = useRef(null)
  const lastJsonRef = useRef(null)

  useEffect(() => {
    if (!user || !supabase) return

    let cancelled = false

    const loadProfile = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (cancelled || !data) return

      const store = useAtlasStore.getState()
      if (data.selected_sources) store.setSelectedSources(data.selected_sources)
      if (data.globe_mode) store.setGlobeMode(data.globe_mode)
      if (data.quality_tier) store.setQualityTier(data.quality_tier)
      if (data.quality_overrides) {
        for (const [k, v] of Object.entries(data.quality_overrides)) {
          store.setQualityOverride(k, v)
        }
      }
      if (typeof data.colorblind_mode === 'boolean' && data.colorblind_mode !== store.colorblindMode) {
        store.toggleColorblindMode()
      }
      if (typeof data.severity_floor === 'number') store.setSeverityFloor(data.severity_floor)
      if (Array.isArray(data.active_domains)) {
        const currentDomains = store.activeDomains
        const remoteDomains = new Set(data.active_domains)
        for (const d of currentDomains) {
          if (!remoteDomains.has(d)) store.toggleDomain(d)
        }
        for (const d of remoteDomains) {
          if (!currentDomains.has(d)) store.toggleDomain(d)
        }
      }

      lastJsonRef.current = JSON.stringify(pickPreferences(useAtlasStore.getState()))
    }

    loadProfile()

    const unsub = useAtlasStore.subscribe((state) => {
      if (!user || !supabase) return
      const prefs = pickPreferences(state)
      const json = JSON.stringify(prefs)
      if (json === lastJsonRef.current) return
      lastJsonRef.current = json

      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(async () => {
        await supabase.from('profiles').upsert({
          id: user.id,
          ...prefs,
          updated_at: new Date().toISOString(),
        })
      }, DEBOUNCE_MS)
    })

    return () => {
      cancelled = true
      clearTimeout(timerRef.current)
      unsub()
    }
  }, [user])
}
