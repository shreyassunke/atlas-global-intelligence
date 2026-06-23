/**
 * Bottom-left HUD pill when field overlays (choropleth / heatmap / wind) are active.
 */
import { useAtlasStore } from '../../store/atlasStore'
import { isLayerToggleOn } from '../../core/layerCatalog'

const FIELD_LABELS = {
  gdeltChoropleth: { label: 'Country tone', source: 'GDELT CAMEO aggregates' },
  gdeltHeatmap: { label: 'Event density', source: 'GDELT GEO PointHeatmap' },
  windOverlay: { label: 'Wind field', source: 'Open-Meteo grid' },
}

export default function FieldLegendPill() {
  const dataLayers = useAtlasStore((s) => s.dataLayers)
  const active = Object.entries(FIELD_LABELS).filter(([key]) => isLayerToggleOn(key, dataLayers))
  if (active.length === 0) return null

  return (
    <div className="atlas-field-legend-pill" role="status">
      <span className="atlas-field-legend-title">Field overlay</span>
      {active.map(([key, meta]) => (
        <div key={key} className="atlas-field-legend-row">
          <span className="atlas-field-legend-label">{meta.label}</span>
          <span className="atlas-field-legend-source">{meta.source}</span>
        </div>
      ))}
    </div>
  )
}
