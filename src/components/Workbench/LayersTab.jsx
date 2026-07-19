/**
 * Workbench — Layers tab, grouped by analyst intent (platform plan Workstream C):
 * Alerts / Live movement / Conditions / Earth observation / Context.
 */
import { useMemo, useState } from 'react'
import {
  Flame,
  Activity,
  Waves,
  Satellite,
  Wind,
  Plane,
  Ship,
  Radiation,
  Anchor,
  Diamond,
  Map as MapIcon,
  Cloud,
  Moon,
  SunDim,
  Thermometer,
  Swords,
  CircleDot,
  Tornado,
  ChevronDown,
  ChevronRight,
  KeyRound,
  Cctv,
} from 'lucide-react'
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
  gdeltSignals: { icon: Swords, desc: 'High-confidence CAMEO events (multi-source or high severity)' },
  conflictEvents: { icon: Swords, desc: 'UCDP / ACLED conflict event pins' },
  firms: { icon: Flame, desc: 'Active fire & thermal anomaly data' },
  usgs: { icon: Activity, desc: 'Real-time seismic activity worldwide' },
  gdacs: { icon: Waves, desc: 'Global disaster alerts & coordination' },
  eonet: { icon: Satellite, desc: 'Earth Observatory natural events' },
  nhcStorms: { icon: Tornado, desc: 'NOAA NHC active cyclone forecast tracks + cone-of-error ($0)' },
  gdeltChoropleth: { icon: MapIcon, desc: 'Per-country tone choropleth from CAMEO aggregates' },
  gdeltHeatmap: { icon: Thermometer, desc: 'Event density heatmap from GDELT GEO PointHeatmap' },
  windOverlay: { icon: Wind, desc: 'Animated wind field from Open-Meteo grid ($0)' },
  adsb: { icon: Plane, desc: 'Live aircraft from adsb.lol ($0, OpenSky fallback)' },
  adsbMilitary: { icon: Plane, desc: 'Military ICAO hex filter — distinct orange sprites' },
  satellites: { icon: Satellite, desc: 'CelesTrak TLE catalog propagated client-side' },
  ais: { icon: Ship, desc: 'Live ships at maritime chokepoints via AISStream.io ($0, API key required)' },
  cameras: { icon: Cctv, desc: 'Public webcams & CCTV — Windy (global, key) + TfL London + Caltrans CA' },
  referenceNuclear: { icon: Radiation, desc: 'Static nuclear facility context — not live events' },
  referenceChokepoints: { icon: Anchor, desc: 'Maritime chokepoint reference anchors' },
  derivedSignals: { icon: Diamond, desc: 'Synthesized cross-feed anomalies (opt-in)' },
  gibsTrueColor: { icon: Satellite, desc: GIBS_IMAGERY_LAYERS.gibsTrueColor?.desc },
  gibsFires: { icon: Flame, desc: GIBS_IMAGERY_LAYERS.gibsFires?.desc },
  gibsAerosol: { icon: Satellite, desc: GIBS_IMAGERY_LAYERS.gibsAerosol?.desc },
  gibsDust: { icon: Wind, desc: GIBS_IMAGERY_LAYERS.gibsDust?.desc },
  gibsClouds: { icon: Cloud, desc: GIBS_IMAGERY_LAYERS.gibsClouds?.desc },
  gibsBlackMarble: { icon: Moon, desc: 'Boost night-side city lights (pairs with terminator)' },
  terminator: { icon: SunDim, desc: 'Live solar terminator line (client-side)' },
}

/**
 * Analyst-intent grouping (Workstream C). Explicit membership first;
 * unlisted layers fall back by catalog kind so new layers never vanish.
 */
const INTENT_GROUPS = [
  {
    id: 'alerts',
    label: 'Alerts',
    hint: 'Live incidents that demand attention — pins sized by severity',
    keys: ['usgs', 'gdacs', 'eonet', 'firms', 'nhcStorms', 'gdeltSignals', 'conflictEvents'],
    fallbackKinds: ['event'],
  },
  {
    id: 'movement',
    label: 'Live movement',
    hint: 'Ambient tracked entities — aircraft, vessels, satellites',
    keys: ['adsb', 'adsbMilitary', 'ais', 'satellites', 'cameras'],
    fallbackKinds: ['track'],
  },
  {
    id: 'conditions',
    label: 'Conditions',
    hint: 'Aggregate surfaces — tone, density, weather fields',
    keys: ['gdeltChoropleth', 'gdeltHeatmap', 'windOverlay', 'terminator'],
    fallbackKinds: ['field'],
  },
  {
    id: 'earthobs',
    label: 'Earth observation',
    hint: 'Satellite imagery & basemap overlays',
    keys: ['gibsTrueColor', 'gibsFires', 'gibsAerosol', 'gibsDust', 'gibsClouds', 'gibsBlackMarble'],
    fallbackKinds: ['basemap'],
  },
  {
    id: 'context',
    label: 'Context & synthesis',
    hint: 'Static reference anchors + derived cross-feed signals',
    keys: ['referenceNuclear', 'referenceChokepoints', 'derivedSignals'],
    fallbackKinds: ['reference', 'derived'],
  },
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
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
      }}
    >
      {health.tone === 'warn' && cfg?.apiKeyEnv ? <KeyRound size={9} /> : null}
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
        <span className="atlas-grammar-chevron">
          {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        </span>
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

  const grouped = useMemo(() => {
    const available = Object.entries(LAYER_CATALOG)
      .filter(([key]) => layerAppliesToMode(key, globeMode))
    const claimed = new Set()

    return INTENT_GROUPS.map((group) => {
      const layers = []
      for (const key of group.keys) {
        const cfg = LAYER_CATALOG[key]
        if (cfg && available.some(([k]) => k === key)) {
          layers.push({ key, cfg, meta: LAYER_META[key] || {} })
          claimed.add(key)
        }
      }
      // Fallback by catalog kind for layers not explicitly listed
      for (const [key, cfg] of available) {
        if (!claimed.has(key) && group.fallbackKinds.includes(cfg.kind)) {
          layers.push({ key, cfg, meta: LAYER_META[key] || {} })
          claimed.add(key)
        }
      }
      return { ...group, layers }
    }).filter((g) => g.layers.length > 0)
  }, [globeMode])

  return (
    <div style={{ padding: '4px 16px 16px' }}>
      <VisualGrammarLegend />
      {grouped.map((group) => (
        <div key={group.id} className="settings-section">
          <div className="settings-section-label">{group.label}</div>
          <div className="settings-toggles">
            {group.layers.map(({ key, cfg, meta }) => {
              const isOn = cfg.optIn ? dataLayers[key] === true : dataLayers[key] !== false
              const Icon = meta.icon || CircleDot
              return (
                <button
                  key={key}
                  onClick={() => toggleDataLayer(key)}
                  className={`settings-feature-row ${isOn ? 'on' : 'off'}`}
                  title={meta.desc}
                >
                  <span className="settings-feature-icon" style={{ display: 'inline-flex', alignItems: 'center' }}>
                    <Icon size={12} />
                  </span>
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
        Layers shown for {modeLabel}. Key icon = API key needed · FIRMS: VITE_FIRMS_MAP_KEY · AIS: AISSTREAM_API_KEY
      </div>
    </div>
  )
}
