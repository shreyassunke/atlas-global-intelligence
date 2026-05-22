import { targetIdLabel } from './satellitePropagation'

/**
 * Whether to show a detection HUD label for an event at the given index.
 * Shared by Map3D, Globe.GL, and 2D map renderers.
 *
 * @param {object} evt
 * @param {number} idx
 * @param {{ detectionMode: boolean, detectionLabelDensity: string, selectedEventId?: string }} opts
 * @returns {string | undefined}
 */
export function showDetectionLabel(evt, idx, opts) {
  if (!opts.detectionMode) return undefined
  if (opts.detectionLabelDensity === 'dense') {
    if (idx < 120) return targetIdLabel(evt)
    return undefined
  }
  if (evt.isMilitary || opts.selectedEventId === evt.id) return targetIdLabel(evt)
  return undefined
}
