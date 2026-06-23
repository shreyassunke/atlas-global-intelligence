/**
 * Workbench — Layers tab with reference/derived groups and visual grammar legend.
 */
import { useMemo, useState } from 'react'
import { useAtlasStore } from '../../store/atlasStore'
import { GIBS_IMAGERY_LAYERS } from '../../config/gibsBasemap'
import {
  LAYER_CATALOG,
  getLayerHealth,
  layerAppliesToMode,
  GLOBE_MODE_LABELS,
} from '../../core/layerCatalog'

const HEALTH_COLORS = {
  off: 'rgba(255,255,255,0.25)',
  ok: '#3dd68c',
  empty: 'rgba(255,255,255,0.45)',
  warn: '#f0b429',
  error: '#ff6b6b',
  mode: '#6eb5ff',
  stale: '#9ad4ff',
}

const LAYER_META = {
  gdeltSignals: { icon: '⚔', desc: 'High-confidence CAMEO events (multi-source or high severity)' },
  firms: { icon: '🔥', desc: 'Active fire & thermal anomaly data' },
  usgs: { icon: '🌋', desc: 'Real-time seismic activity worldwide' },
  gdacs: { icon: '🌊', desc: 'Global disaster alerts & coordination' },
  eonet: { icon: '🛰', desc: 'Earth Observatory natural events' },
  nhcStorms: { icon: '🌀', desc: 'NOAA NHC active cyclone forecast tracks + cone-of-error ($0)' },
  gdeltChoropleth: { icon: '🗺', desc: 'Per-country tone choropleth from CAMEO aggregates' },
  gdeltHeatmap: { icon: '🌡', desc: 'Event density heatmap from GDELT GEO PointHeatmap' },
  windOverlay: { icon: '💨', desc: 'Animated wind field from Open-Meteo grid ($0)' },
  adsb: { icon: '✈', desc: 'Live aircraft from adsb.lol ($0, OpenSky fallback)' },
  adsbMilitary: { icon: '🛩', desc: 'Military ICAO hex filter — distinct orange sprites' },
  satellites: { icon: '🛰', desc: 'CelesTrak TLE catalog propagated client-side' },
  ais: { icon: '🚢', desc: 'Live ships at maritime chokepoints via AISStream.io ($0, API key required)' },
  referenceNuclear: { icon: '☢', desc: 'Static nuclear facility context — not live events' },
  referenceChokepoints: { icon: '⚓', desc: 'Maritime chokepoint reference anchors' },
  derivedSignals: { icon: '◆', desc: 'Synthesized cross-feed anomalies (opt-in)' },
  gibsTrueColor: { icon: '🛰', desc: GIBS_IMAGERY_LAYERS.gibsTrueColor?.desc },
  gibsFires: { icon: '🔥', desc: GIBS_IMAGERY_LAYERS.gibsFires?.desc },
  gibsAerosol: { icon: '🛰', desc: GIBS_IMAGERY_LAYERS.gibsAerosol?.desc },
  gibsDust: { icon: '🛰', desc: GIBS_IMAGERY_LAYERS.gibsDust?.desc },
  gibsClouds: { icon: '☁', desc: GIBS_IMAGERY_LAYERS.gibsClouds?.desc },
  gibsBlackMarble: { icon: '🌃', desc: 'Boost night-side city lights (pairs with terminator)' },
  terminator: { icon: '◐', desc: 'Live solar terminator line (client-side)' },
}

const GROUPS = [
  { kind: 'event', label: 'Event Layers', hint: 'Discrete pins, clustered — authoritative feeds + high-confidence CAMEO' },
  { kind: 'field', label: 'Field Layers', hint: 'Aggregate surfaces — overlay legend appears on globe when active' },
  { kind: 'track', label: 'Track Layers', hint: 'Ambient live entities — aircraft, vessels, satellites' },
  { kind: 'reference', label: 'Reference Layers', hint: 'Static context — hollow ring markers, no pulse or corroboration' },
  { kind: 'derived', label: 'Derived Layers', hint: 'Synthesized signals from triage anomalies — amber diamond badges' },
  { kind: 'basemap', label: 'Basemap', hint: 'Imagery & context overlays' },
]

const GRAMMAR_ROWS = [
  { key: 'pin', swatch: '●', label: 'Pin', desc: 'Incident — size = severity, opacity = corroboration, pulse = recency' },
  { key: 'track', swatch: '➤', label: 'Track', desc: 'Live telemetry — fixed sprite, no Street View' },
  { key: 'field', swatch: '▢', label: 'Field', desc: 'Surface overlay — choropleth, heatmap, wind (no point icon)' },
  { key: 'reference', swatch: '○', label: 'Reference', desc: 'Static context — muted 12px hollow ring, never pulses' },
  { key: 'derived', swatch: '◆', label: 'Derived', desc: 'Synthesis — amber diamond, slow breathe, confidence badge' },
]

function LayerStatusChip({ layerKey, healthCtx }) {
  const health = getLayerHealth(layerKey, healthCtx)
  if (!health || health.tone === 'off') return null
  const cfg = LAYER_CATALOG[layerKey]
  return (
    <span
      title={health.message}
      style={{
        marginLeft: 'auto',
        marginRight: 6,
        fontSize: 9,
        letterSpacing: '0.06em',
        fontFamily: 'var(--font-hud)',
        color: HEALTH_COLORS[health.tone] || HEALTH_COLORS.empty,
        maxWidth: 120,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}
    >
      {health.tone === 'warn' && cfg?.apiKeyEnv ? '🔑 ' : ''}
      {health.message}
    </span>
  )
}

function VisualGrammarLegend() {
  const [open, setOpen] = useState(false)
  return (
    <div className="settings-section atlas-grammar-legend">
      <button
        type="button"
        className="atlas-grammar-legend-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="settings-section-label" style={{ margin: 0 }}>Visual Grammar</span>
        <span className="atlas-grammar-chevron">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="atlas-grammar-rows">
          {GRAMMAR_ROWS.map((row) => (
            <div key={row.key} className={`atlas-grammar-row atlas-grammar-row--${row.key}`}>
              <span className="atlas-grammar-swatch">{row.swatch}</span>
              <span className="atlas-grammar-label">{row.label}</span>
              <span className="atlas-grammar-desc">{row.desc}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function LayersTab() {
  const dataLayers = useAtlasStore((s) => s.dataLayers)
  const sourceStatuses = useAtlasStore((s) => s.sourceStatuses)
  const events = useAtlasStore((s) => s.events)
  const anomalies = useAtlasStore((s) => s.anomalies)
  const globeMode = useAtlasStore((s) => s.globeMode)
  const gdeltGeoBootstrap = useAtlasStore((s) => s.gdeltGeoBootstrap)
  const gdeltCountryAggregates = useAtlasStore((s) => s.gdeltCountryAggregates)
  const toggleDataLayer = useAtlasStore((s) => s.toggleDataLayer)

  const modeLabel = GLOBE_MODE_LABELS[globeMode] || 'Globe'
  const healthCtx = {
    dataLayers,
    sourceStatuses,
    globeMode,
    events,
    anomalies,
    gdeltGeoBootstrap,
    gdeltCountryAggregates,
  }

  const grouped = useMemo(
    () => GROUPS.map((group) => ({
      ...group,
      layers: Object.entries(LAYER_CATALOG)
        .filter(([key, cfg]) => cfg.kind === group.kind && layerAppliesToMode(key, globeMode))
        .map(([key, cfg]) => ({ key, cfg, meta: LAYER_META[key] || {} })),
    })).filter((g) => g.layers.length > 0),
    [globeMode],
  )

  return (
    <div style={{ padding: '4px 16px 16px' }}>
      <VisualGrammarLegend />
      {grouped.map((group) => (
        <div key={group.kind} className="settings-section">
          <div className="settings-section-label">{group.label}</div>
          <div className="settings-toggles">
            {group.layers.map(({ key, cfg, meta }) => {
              const isOn = cfg.optIn ? dataLayers[key] === true : dataLayers[key] !== false
              return (
                <button
                  key={key}
                  onClick={() => toggleDataLayer(key)}
                  className={`settings-feature-row ${isOn ? 'on' : 'off'}`}
                  title={meta.desc}
                >
                  <span className="settings-feature-icon">{meta.icon || '◌'}</span>
                  <span className="settings-feature-label">{cfg.label}</span>
                  <LayerStatusChip layerKey={key} healthCtx={healthCtx} />
                  <span className={`settings-feature-switch ${isOn ? 'on' : ''}`}>
                    <span className="settings-feature-knob" />
                  </span>
                </button>
              )
            })}
          </div>
          <div className="settings-hint">{group.hint}</div>
        </div>
      ))}
      <div className="settings-hint" style={{ padding: '0 2px' }}>
        Layers shown for {modeLabel}. 🔑 = key needed · FIRMS: VITE_FIRMS_MAP_KEY · AIS: AISSTREAM_API_KEY
      </div>
    </div>
  )
}
