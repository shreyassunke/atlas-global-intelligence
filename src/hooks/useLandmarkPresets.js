import { useEffect, useState, useCallback } from 'react'
import {
  LANDMARK_PRESETS,
  mergeLandmarkRefinement,
  presetByShortcutKey,
} from '../config/landmarkPresets'
import { useAtlasStore } from '../store/atlasStore'

/**
 * Loads OSM Overpass refinements for Q/W/E/R/T presets; exposes flyToLandmark.
 */
export function useLandmarkPresets() {
  const [refined, setRefined] = useState(() =>
    Object.fromEntries(LANDMARK_PRESETS.map((p) => [p.id, p])),
  )

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const next = Object.fromEntries(LANDMARK_PRESETS.map((p) => [p.id, p]))
      for (const preset of LANDMARK_PRESETS) {
        if (!preset.overpassQuery) continue
        try {
          const res = await fetch('/api/overpass-landmarks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: preset.overpassQuery }),
          })
          if (!res.ok) continue
          const data = await res.json()
          if (data?.result) {
            next[preset.id] = mergeLandmarkRefinement(preset, data.result)
          }
        } catch {
          /* static bbox fallback */
        }
        if (cancelled) return
      }
      if (!cancelled) setRefined(next)
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot refinement on mount
  }, [])

  const flyToLandmark = useCallback((key) => {
    const base = presetByShortcutKey(key)
    if (!base) return
    const preset = refined[base.id] || base
    useAtlasStore.getState().flyToLocation({
      lat: preset.lat,
      lng: preset.lng,
      label: preset.label,
      bbox: preset.bbox,
      viewport: preset.bbox
        ? {
            south: preset.bbox.south,
            west: preset.bbox.west,
            north: preset.bbox.north,
            east: preset.bbox.east,
          }
        : undefined,
    })
    useAtlasStore.getState().setSearchHighlight({
      lat: preset.lat,
      lng: preset.lng,
      label: preset.label,
      viewport: preset.bbox
        ? {
            south: preset.bbox.south,
            west: preset.bbox.west,
            north: preset.bbox.north,
            east: preset.bbox.east,
          }
        : undefined,
      createdAt: Date.now(),
    })
  }, [refined])

  return { presets: refined, flyToLandmark }
}

export default useLandmarkPresets
