import { useRef, useEffect, useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAtlasStore } from '../../store/atlasStore'
import { QUALITY_TIERS } from '../../config/qualityTiers'
import { GIBS_IMAGERY_LAYERS } from '../../config/gibsBasemap'
import AlertRulesPanel from './AlertRulesPanel'
import WatchlistPanel from './WatchlistPanel'
import { copyShareUrl } from '../../core/urlState'
import { buildBriefMarkdown, downloadMarkdownBrief, exportBriefPdf } from '../../core/briefExport'
import { getLayerHealth, LAYER_CATALOG, layerAppliesToMode, GLOBE_MODE_LABELS } from '../../core/layerCatalog'

const HEALTH_COLORS = {
    off: 'rgba(255,255,255,0.25)',
    ok: '#3dd68c',
    empty: 'rgba(255,255,255,0.45)',
    warn: '#f0b429',
    error: '#ff6b6b',
    mode: '#6eb5ff',
}

function LayerStatusChip({ layerKey, dataLayers, sourceStatuses, globeMode, events }) {
    const health = getLayerHealth(layerKey, { dataLayers, sourceStatuses, globeMode, events })
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

const GLOBE_MODES = [
    { id: 'cesium', label: 'Google 3D', desc: 'Photorealistic Earth with native labels (Google Map3D)' },
    { id: 'globegl', label: 'Globe.GL', desc: 'Lightweight 3D globe, smooth & fast' },
    { id: 'leaflet', label: '2D Map', desc: 'Flat map, minimal GPU' },
]

/** Per-mode panel subtitle shown under the header */
const MODE_PANEL_HINT = {
    cesium: 'Photorealistic Map3D — event markers, tactical tracks, quality controls',
    globegl: 'WebGL globe — GIBS imagery, wind particles, night lights',
    leaflet: 'Flat MapLibre map — stackable GIBS raster overlays',
}

const QUALITY_PRESETS = [
    { id: 'auto', label: 'Auto' },
    { id: 'high', label: 'High' },
    { id: 'medium', label: 'Medium' },
    { id: 'low', label: 'Low' },
]

const TOGGLE_SETTINGS = [{ key: 'autoRotate', label: 'Auto-Rotate', icon: '↻' }]

const DATA_LAYER_TOGGLES = [
    { key: 'gdelt', label: 'GDELT Geopolitics', icon: '⚔', desc: 'Conflict, diplomacy, protests from GDELT 2.0' },
    { key: 'gdeltHeatmap', label: 'GDELT Heatmap', icon: '🌡', desc: 'Event density heatmap from GDELT GEO PointHeatmap' },
    { key: 'gdeltChoropleth', label: 'GDELT Country Tone', icon: '🗺', desc: 'Per-country average tone choropleth (GEO Country mode)' },
    { key: 'firms', label: 'NASA FIRMS Fires', icon: '🔥', desc: 'Active fire & thermal anomaly data' },
    { key: 'usgs', label: 'USGS Earthquakes', icon: '🌋', desc: 'Real-time seismic activity worldwide' },
    { key: 'gdacs', label: 'GDACS Disasters', icon: '🌊', desc: 'Global disaster alerts & coordination' },
    { key: 'eonet', label: 'NASA EONET', icon: '🛰', desc: 'Earth Observatory natural events' },
    { key: 'adsb', label: 'ADS-B Aircraft', icon: '✈', desc: 'Live aircraft from OpenSky Network ($0, 10s poll)' },
    { key: 'adsbMilitary', label: 'Military Aircraft', icon: '🛩', desc: 'Military ICAO hex filter — distinct orange sprites' },
    { key: 'satellites', label: 'Satellites', icon: '🛰', desc: 'CelesTrak TLE catalog propagated client-side' },
    { key: 'ais', label: 'AIS Vessels', icon: '🚢', desc: 'Live ships at maritime chokepoints via AISStream.io ($0, API key required)' },
    { key: 'nhcStorms', label: 'Hurricane Tracks', icon: '🌀', desc: 'NOAA NHC active cyclone forecast tracks + cone-of-error ($0)' },
    { key: 'bluesky', label: 'Bluesky Social', icon: '💬', desc: 'Crisis/news posts from Bluesky Jetstream firehose ($0, no key)' },
    { key: 'factCheck', label: 'Fact Check Claims', icon: '✓', desc: 'Google Fact Check Tools ClaimReview overlay ($0, server API key)' },
]

const WEATHER_OVERLAY_TOGGLES = [
    { key: 'windOverlay', label: 'Wind Particles', icon: '💨', desc: 'Animated wind field from Open-Meteo grid ($0)' },
]

const GIBS_IMAGERY_TOGGLES = Object.entries(GIBS_IMAGERY_LAYERS).map(([key, cfg]) => ({
    key,
    label: `GIBS ${cfg.label}`,
    icon: key === 'gibsFires' ? '🔥' : key === 'gibsClouds' ? '☁' : '🛰',
    desc: cfg.desc,
}))

const BASEMAP_ENV_TOGGLES = [
    { key: 'terminator', label: 'Day/Night Terminator', icon: '◐', desc: 'Live solar terminator line (client-side)' },
    { key: 'gibsBlackMarble', label: 'Night City Lights', icon: '🌃', desc: 'Boost night-side city lights (pairs with terminator)' },
]

const VISUAL_MODE_TOGGLES = [
    { key: 'tacticalMode', label: 'Tactical Mode', icon: '◈', desc: 'Desaturate + film grain + green tint' },
    { key: 'detectionMode', label: 'Detection Mode', icon: '◎', desc: 'Reticle rings + target ID labels on markers' },
]

/** @param {{ key: string }[]} toggles @param {string} globeMode */
function togglesForMode(toggles, globeMode) {
    return toggles.filter((t) => layerAppliesToMode(t.key, globeMode))
}

export default function SettingsPanel() {
    const settingsOpen = useAtlasStore((s) => s.settingsOpen)
    const setSettingsOpen = useAtlasStore((s) => s.setSettingsOpen)
    const globeMode = useAtlasStore((s) => s.globeMode)
    const setGlobeMode = useAtlasStore((s) => s.setGlobeMode)
    const qualityTier = useAtlasStore((s) => s.qualityTier)
    const setQualityTier = useAtlasStore((s) => s.setQualityTier)
    const resolvedTier = useAtlasStore((s) => s.resolvedTier)
    const qualityOverrides = useAtlasStore((s) => s.qualityOverrides)
    const setQualityOverride = useAtlasStore((s) => s.setQualityOverride)
    const clearQualityOverrides = useAtlasStore((s) => s.clearQualityOverrides)
    const colorblindMode = useAtlasStore((s) => s.colorblindMode)
    const toggleColorblindMode = useAtlasStore((s) => s.toggleColorblindMode)
    const user = useAtlasStore((s) => s.user)
    const signOut = useAtlasStore((s) => s.signOut)
    const dataLayers = useAtlasStore((s) => s.dataLayers)
    const sourceStatuses = useAtlasStore((s) => s.sourceStatuses)
    const events = useAtlasStore((s) => s.events)
    const toggleDataLayer = useAtlasStore((s) => s.toggleDataLayer)
    const tacticalMode = useAtlasStore((s) => s.tacticalMode)
    const toggleTacticalMode = useAtlasStore((s) => s.toggleTacticalMode)
    const detectionMode = useAtlasStore((s) => s.detectionMode)
    const toggleDetectionMode = useAtlasStore((s) => s.toggleDetectionMode)
    const detectionLabelDensity = useAtlasStore((s) => s.detectionLabelDensity)
    const setDetectionLabelDensity = useAtlasStore((s) => s.setDetectionLabelDensity)
    const panelRef = useRef(null)
    const [alertsOpen, setAlertsOpen] = useState(false)
    const [watchlistsOpen, setWatchlistsOpen] = useState(false)
    const pushToast = useAtlasStore((s) => s.pushToast)

    useEffect(() => {
        if (!settingsOpen) return
        function handleClick(e) {
            if (panelRef.current && !panelRef.current.contains(e.target)) {
                setSettingsOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClick)
        document.addEventListener('touchstart', handleClick)
        return () => {
            document.removeEventListener('mousedown', handleClick)
            document.removeEventListener('touchstart', handleClick)
        }
    }, [settingsOpen, setSettingsOpen])

    const activePriority = QUALITY_TIERS[resolvedTier] || QUALITY_TIERS.high

    function getEffective(key) {
        if (key in qualityOverrides) return qualityOverrides[key]
        return activePriority[key]
    }

    const isCesium = globeMode === 'cesium'
    const isGlobeGl = globeMode === 'globegl'
    const isFlatMap = globeMode === 'leaflet'
    const modeLabel = GLOBE_MODE_LABELS[globeMode] || 'Globe'

    const layerStatusProps = { dataLayers, sourceStatuses, globeMode, events }

    const dataLayersForMode = useMemo(
        () => togglesForMode(DATA_LAYER_TOGGLES, globeMode),
        [globeMode],
    )
    const gibsForMode = useMemo(
        () => togglesForMode(GIBS_IMAGERY_TOGGLES, globeMode),
        [globeMode],
    )
    const basemapForMode = useMemo(
        () => togglesForMode(BASEMAP_ENV_TOGGLES, globeMode),
        [globeMode],
    )
    const weatherForMode = useMemo(
        () => togglesForMode(WEATHER_OVERLAY_TOGGLES, globeMode),
        [globeMode],
    )

    const showGibs = gibsForMode.length > 0
    const showBasemap = basemapForMode.length > 0
    const showWeather = weatherForMode.length > 0

    return (
    <>
        <AnimatePresence>
            {settingsOpen && (
                <motion.div
                    ref={panelRef}
                    initial={{ opacity: 0, y: -10, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.97 }}
                    transition={{ duration: 0.22 }}
                    className="settings-panel"
                >
                    {/* Header — scoped to active renderer */}
                    <div className="settings-header">
                        <span className="settings-title">⚙ {modeLabel.toUpperCase()}</span>
                        <button
                            onClick={() => setSettingsOpen(false)}
                            className="settings-close"
                        >
                            ✕
                        </button>
                    </div>
                    <div className="settings-hint" style={{ marginTop: -4, marginBottom: 12, paddingLeft: 2 }}>
                        {MODE_PANEL_HINT[globeMode] || 'Globe settings'}
                    </div>

                    {/* Switch renderer (always visible) */}
                    <div className="settings-section">
                        <div className="settings-section-label">Switch Renderer</div>
                        <div className="settings-toggle-group">
                            {GLOBE_MODES.map((mode) => (
                                <button
                                    key={mode.id}
                                    onClick={() => setGlobeMode(mode.id)}
                                    className={`settings-toggle-btn ${globeMode === mode.id ? 'active' : ''}`}
                                    title={mode.desc}
                                >
                                    {mode.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* ── Google 3D only ── */}
                    {isCesium && (
                        <>
                            <div className="settings-section">
                                <div className="settings-section-label">
                                    Render Quality
                                    {qualityTier === 'auto' && (
                                        <span className="settings-auto-badge">
                                            auto → {resolvedTier}
                                        </span>
                                    )}
                                </div>
                                <div className="settings-toggle-group">
                                    {QUALITY_PRESETS.map((preset) => (
                                        <button
                                            key={preset.id}
                                            onClick={() => {
                                                setQualityTier(preset.id)
                                                clearQualityOverrides()
                                            }}
                                            className={`settings-toggle-btn ${qualityTier === preset.id ? 'active' : ''}`}
                                        >
                                            {preset.label}
                                        </button>
                                    ))}
                                </div>
                                <div className="settings-hint">
                                    Map3D quality tier — affects marker density and auto-rotate defaults
                                </div>
                            </div>

                            <div className="settings-section">
                                <div className="settings-section-label">
                                    Map3D Features
                                    {Object.keys(qualityOverrides).length > 0 && (
                                        <button
                                            className="settings-reset-btn"
                                            onClick={clearQualityOverrides}
                                        >
                                            Reset
                                        </button>
                                    )}
                                </div>
                                <div className="settings-toggles">
                                    {TOGGLE_SETTINGS.map(({ key, label, icon }) => {
                                        const isOn = getEffective(key)
                                        const isOverridden = key in qualityOverrides
                                        return (
                                            <button
                                                key={key}
                                                onClick={() => setQualityOverride(key, !isOn)}
                                                className={`settings-feature-row ${isOn ? 'on' : 'off'} ${isOverridden ? 'overridden' : ''}`}
                                            >
                                                <span className="settings-feature-icon">{icon}</span>
                                                <span className="settings-feature-label">{label}</span>
                                                <span className={`settings-feature-switch ${isOn ? 'on' : ''}`}>
                                                    <span className="settings-feature-knob" />
                                                </span>
                                            </button>
                                        )
                                    })}
                                </div>
                                <div className="settings-hint">
                                    Landmark shortcuts: Q Kyiv · W DC · E Tel Aviv · R Taipei · T London
                                </div>
                            </div>
                        </>
                    )}

                    {/* ── Globe.GL + 2D Map: GIBS imagery ── */}
                    {showGibs && (
                        <div className="settings-section">
                            <div className="settings-section-label">
                                Satellite Imagery (GIBS)
                            </div>
                            <div className="settings-toggles">
                                {gibsForMode.map(({ key, label, icon }) => {
                                    const isOn = dataLayers[key] === true
                                    return (
                                        <button
                                            key={key}
                                            onClick={() => toggleDataLayer(key)}
                                            className={`settings-feature-row ${isOn ? 'on' : 'off'}`}
                                            title={GIBS_IMAGERY_LAYERS[key]?.desc}
                                        >
                                            <span className="settings-feature-icon">{icon}</span>
                                            <span className="settings-feature-label">{label}</span>
                                            <LayerStatusChip layerKey={key} {...layerStatusProps} />
                                            <span className={`settings-feature-switch ${isOn ? 'on' : ''}`}>
                                                <span className="settings-feature-knob" />
                                            </span>
                                        </button>
                                    )
                                })}
                            </div>
                            <div className="settings-hint">
                                {isGlobeGl
                                    ? 'Free NASA WMTS — one overlay at a time on Globe.GL'
                                    : 'Free NASA WMTS — layers stack on the 2D map'}
                            </div>
                        </div>
                    )}

                    {/* ── Basemap environment (mode-filtered) ── */}
                    {showBasemap && (
                        <div className="settings-section">
                            <div className="settings-section-label">Basemap Environment</div>
                            <div className="settings-toggles">
                                {basemapForMode.map(({ key, label, icon, desc }) => {
                                    const isOn =
                                        key === 'terminator'
                                            ? dataLayers[key] !== false
                                            : dataLayers[key] === true
                                    return (
                                        <button
                                            key={key}
                                            onClick={() => toggleDataLayer(key)}
                                            className={`settings-feature-row ${isOn ? 'on' : 'off'}`}
                                            title={desc}
                                        >
                                            <span className="settings-feature-icon">{icon}</span>
                                            <span className="settings-feature-label">{label}</span>
                                            <LayerStatusChip layerKey={key} {...layerStatusProps} />
                                            <span className={`settings-feature-switch ${isOn ? 'on' : ''}`}>
                                                <span className="settings-feature-knob" />
                                            </span>
                                        </button>
                                    )
                                })}
                            </div>
                            {isGlobeGl && (
                                <div className="settings-hint">
                                    Night city lights boost Globe.GL night-side texture when terminator is on
                                </div>
                            )}
                            {isCesium && (
                                <div className="settings-hint">
                                    Solar terminator line overlay on Map3D
                                </div>
                            )}
                            {isFlatMap && (
                                <div className="settings-hint">
                                    Terminator renders as a line on the flat map
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Globe.GL only: weather overlays ── */}
                    {showWeather && (
                        <div className="settings-section">
                            <div className="settings-section-label">Weather Overlays</div>
                            <div className="settings-toggles">
                                {weatherForMode.map(({ key, label, icon, desc }) => {
                                    const isOn = dataLayers[key] === true
                                    return (
                                        <button
                                            key={key}
                                            onClick={() => toggleDataLayer(key)}
                                            className={`settings-feature-row ${isOn ? 'on' : 'off'}`}
                                            title={desc}
                                        >
                                            <span className="settings-feature-icon">{icon}</span>
                                            <span className="settings-feature-label">{label}</span>
                                            <LayerStatusChip layerKey={key} {...layerStatusProps} />
                                            <span className={`settings-feature-switch ${isOn ? 'on' : ''}`}>
                                                <span className="settings-feature-knob" />
                                            </span>
                                        </button>
                                    )
                                })}
                            </div>
                            <div className="settings-hint">
                                Animated wind particles from Open-Meteo grid ($0, no key)
                            </div>
                        </div>
                    )}

                    {/* ── Data layers (filtered to current mode) ── */}
                    <div className="settings-section">
                        <div className="settings-section-label">Signal Layers</div>
                        <div className="settings-toggles">
                            {dataLayersForMode.map(({ key, label, icon }) => {
                                const isOn = dataLayers[key] !== false
                                return (
                                    <button
                                        key={key}
                                        onClick={() => toggleDataLayer(key)}
                                        className={`settings-feature-row ${isOn ? 'on' : 'off'}`}
                                    >
                                        <span className="settings-feature-icon">{icon}</span>
                                        <span className="settings-feature-label">{label}</span>
                                        <LayerStatusChip layerKey={key} {...layerStatusProps} />
                                        <span className={`settings-feature-switch ${isOn ? 'on' : ''}`}>
                                            <span className="settings-feature-knob" />
                                        </span>
                                    </button>
                                )
                            })}
                        </div>
                        <div className="settings-hint">
                            Layers shown on {modeLabel}. 🔑 = key needed · FIRMS: VITE_FIRMS_MAP_KEY · AIS: AISSTREAM_API_KEY
                        </div>
                    </div>

                    {/* ── Visual modes (all renderers) ── */}
                    <div className="settings-section">
                        <div className="settings-section-label">Visual Modes</div>
                        <div className="settings-toggles">
                            {VISUAL_MODE_TOGGLES.map(({ key, label, icon }) => {
                                const isOn = key === 'tacticalMode' ? tacticalMode : detectionMode
                                const toggle = key === 'tacticalMode' ? toggleTacticalMode : toggleDetectionMode
                                return (
                                    <button
                                        key={key}
                                        onClick={toggle}
                                        className={`settings-feature-row ${isOn ? 'on' : 'off'}`}
                                    >
                                        <span className="settings-feature-icon">{icon}</span>
                                        <span className="settings-feature-label">{label}</span>
                                        <span className={`settings-feature-switch ${isOn ? 'on' : ''}`}>
                                            <span className="settings-feature-knob" />
                                        </span>
                                    </button>
                                )
                            })}
                        </div>
                        {detectionMode && (
                            <div className="settings-toggle-group" style={{ marginTop: 8 }}>
                                {['sparse', 'dense'].map((mode) => (
                                    <button
                                        key={mode}
                                        onClick={() => setDetectionLabelDensity(mode)}
                                        className={`settings-toggle-btn ${detectionLabelDensity === mode ? 'active' : ''}`}
                                    >
                                        {mode === 'sparse' ? 'Sparse Labels' : 'Dense Labels'}
                                    </button>
                                ))}
                            </div>
                        )}
                        <div className="settings-hint">
                            Tactical shader and detection reticles apply to the active {modeLabel} view
                        </div>
                    </div>

                    {/* ── Global: accessibility ── */}
                    <div className="settings-section">
                        <div className="settings-section-label">Accessibility</div>
                        <div className="settings-toggles">
                            <button
                                onClick={toggleColorblindMode}
                                className={`settings-feature-row ${colorblindMode ? 'on' : 'off'}`}
                            >
                                <span className="settings-feature-icon">◐</span>
                                <span className="settings-feature-label">Colorblind Patterns</span>
                                <span className={`settings-feature-switch ${colorblindMode ? 'on' : ''}`}>
                                    <span className="settings-feature-knob" />
                                </span>
                            </button>
                        </div>
                        <div className="settings-hint">
                            ESC clears selection · Tab cycles events · F toggles HUD
                        </div>
                    </div>

                    <div className="settings-section">
                        <div className="settings-section-label">Share &amp; Brief</div>
                        <div className="settings-toggles">
                            <button
                                type="button"
                                onClick={async () => {
                                    const state = useAtlasStore.getState()
                                    const ok = await copyShareUrl({
                                        activeDimensions: state.activeDimensions,
                                        priorityFilter: state.priorityFilter,
                                        timeFilter: state.timeFilter,
                                        dataLayers: state.dataLayers,
                                        globeMode: state.globeMode,
                                        tacticalMode: state.tacticalMode,
                                        detectionMode: state.detectionMode,
                                        detectionLabelDensity: state.detectionLabelDensity,
                                        shareCamera: state.shareCamera,
                                        zoomLevel: state.zoomLevel,
                                        selectedEventId: state.selectedEvent?.id ?? null,
                                    })
                                    pushToast({
                                        label: 'Share',
                                        message: ok ? 'View link copied' : 'Copy failed',
                                    })
                                }}
                                className="settings-feature-row on"
                            >
                                <span className="settings-feature-icon">🔗</span>
                                <span className="settings-feature-label">Copy Shareable Link</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    downloadMarkdownBrief(buildBriefMarkdown(useAtlasStore.getState()))
                                    pushToast({ label: 'Brief', message: 'Markdown downloaded' })
                                }}
                                className="settings-feature-row on"
                            >
                                <span className="settings-feature-icon">📄</span>
                                <span className="settings-feature-label">Export Brief (Markdown)</span>
                            </button>
                            <button
                                type="button"
                                onClick={async () => {
                                    try {
                                        await exportBriefPdf(useAtlasStore.getState())
                                        pushToast({ label: 'Brief', message: 'PDF saved' })
                                    } catch {
                                        pushToast({ label: 'Brief', message: 'PDF failed — use Markdown' })
                                    }
                                }}
                                className="settings-feature-row on"
                            >
                                <span className="settings-feature-icon">📑</span>
                                <span className="settings-feature-label">Export Brief (PDF)</span>
                            </button>
                        </div>
                        <div className="settings-hint">
                            URL encodes filters, layers, camera, and selected event — no account required.
                        </div>
                    </div>

                    {user && (
                        <div className="settings-section">
                            <div className="settings-section-label">Alerts &amp; Watchlists</div>
                            <div className="settings-toggles">
                                <button
                                    type="button"
                                    onClick={() => setAlertsOpen(true)}
                                    className="settings-feature-row on"
                                >
                                    <span className="settings-feature-icon">🔔</span>
                                    <span className="settings-feature-label">Configure Alert Rules</span>
                                    <span className="text-[9px] text-white/25">→</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setWatchlistsOpen(true)}
                                    className="settings-feature-row on"
                                >
                                    <span className="settings-feature-icon">◎</span>
                                    <span className="settings-feature-label">Manage Watchlists</span>
                                    <span className="text-[9px] text-white/25">→</span>
                                </button>
                            </div>
                            <div className="settings-hint">
                                Watchlists toast in-app when a new signal matches your topic, entity, or place.
                            </div>
                        </div>
                    )}

                    <div className="settings-section">
                        <div className="settings-section-label">Account</div>
                        <div className="settings-toggles">
                            {user ? (
                                <>
                                    <div className="settings-feature-row on">
                                        <span className="settings-feature-icon">●</span>
                                        <span className="settings-feature-label" style={{ fontSize: '8px', letterSpacing: '0.15em' }}>
                                            {user.email}
                                        </span>
                                    </div>
                                    <button onClick={signOut} className="settings-feature-row off">
                                        <span className="settings-feature-icon">↩</span>
                                        <span className="settings-feature-label">Sign Out</span>
                                    </button>
                                </>
                            ) : (
                                <div className="settings-feature-row off">
                                    <span className="settings-feature-icon">○</span>
                                    <span className="settings-feature-label">Guest — sign in to sync preferences</span>
                                </div>
                            )}
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
        <AlertRulesPanel open={alertsOpen} onClose={() => setAlertsOpen(false)} />
        <WatchlistPanel open={watchlistsOpen} onClose={() => setWatchlistsOpen(false)} />
    </>
    )
}
