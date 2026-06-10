/**
 * Workbench — Settings (Preferences) tab (Phase 3).
 *
 * Renderer, quality, appearance (tactical/detection modes), accessibility,
 * alerts & watchlists, and account. Layer toggles live in the Layers tab;
 * share/brief lives only in the header overflow menu.
 */
import { useState } from 'react'
import { useAtlasStore } from '../../store/atlasStore'
import { QUALITY_TIERS } from '../../config/qualityTiers'
import AlertRulesSection from '../UI/AlertRulesPanel'
import WatchlistSection from '../UI/WatchlistPanel'

const GLOBE_MODES = [
  { id: 'cesium', label: 'Google 3D', desc: 'Photorealistic Earth with native labels (Google Map3D)' },
  { id: 'globegl', label: 'Globe.GL', desc: 'Lightweight 3D globe, smooth & fast' },
  { id: 'leaflet', label: '2D Map', desc: 'Flat map, minimal GPU' },
]

const QUALITY_PRESETS = [
  { id: 'auto', label: 'Auto' },
  { id: 'high', label: 'High' },
  { id: 'medium', label: 'Medium' },
  { id: 'low', label: 'Low' },
]

const TOGGLE_SETTINGS = [{ key: 'autoRotate', label: 'Auto-Rotate', icon: '↻' }]

export default function PreferencesTab() {
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
  const tacticalMode = useAtlasStore((s) => s.tacticalMode)
  const toggleTacticalMode = useAtlasStore((s) => s.toggleTacticalMode)
  const detectionMode = useAtlasStore((s) => s.detectionMode)
  const toggleDetectionMode = useAtlasStore((s) => s.toggleDetectionMode)
  const detectionLabelDensity = useAtlasStore((s) => s.detectionLabelDensity)
  const setDetectionLabelDensity = useAtlasStore((s) => s.setDetectionLabelDensity)

  const [alertsOpen, setAlertsOpen] = useState(false)
  const [watchlistsOpen, setWatchlistsOpen] = useState(false)

  const activePriority = QUALITY_TIERS[resolvedTier] || QUALITY_TIERS.high
  const isCesium = globeMode === 'cesium'

  function getEffective(key) {
    if (key in qualityOverrides) return qualityOverrides[key]
    return activePriority[key]
  }

  return (
    <div style={{ padding: '4px 16px 16px' }}>
      {/* Renderer */}
      <div className="settings-section">
        <div className="settings-section-label">Globe Renderer</div>
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

      {/* Quality — Google 3D only */}
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

      {/* Appearance — tactical / detection visual modes */}
      <div className="settings-section">
        <div className="settings-section-label">Appearance</div>
        <div className="settings-toggles">
          <button
            onClick={toggleTacticalMode}
            className={`settings-feature-row ${tacticalMode ? 'on' : 'off'}`}
            title="Desaturate + film grain + green tint"
          >
            <span className="settings-feature-icon">◈</span>
            <span className="settings-feature-label">Tactical Mode</span>
            <span className={`settings-feature-switch ${tacticalMode ? 'on' : ''}`}>
              <span className="settings-feature-knob" />
            </span>
          </button>
          <button
            onClick={toggleDetectionMode}
            className={`settings-feature-row ${detectionMode ? 'on' : 'off'}`}
            title="Reticle rings + target ID labels on markers"
          >
            <span className="settings-feature-icon">◎</span>
            <span className="settings-feature-label">Detection Mode</span>
            <span className={`settings-feature-switch ${detectionMode ? 'on' : ''}`}>
              <span className="settings-feature-knob" />
            </span>
          </button>
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
          Tactical shader and detection reticles apply to the active globe view
        </div>
      </div>

      {/* Accessibility */}
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
          ESC closes top panel · Tab cycles events · F toggles HUD
        </div>
      </div>

      {/* Alerts & Watchlists — signed-in only */}
      {user && (
        <div className="settings-section">
          <div className="settings-section-label">Alerts &amp; Watchlists</div>
          <div className="settings-toggles">
            <button
              type="button"
              onClick={() => setAlertsOpen((v) => !v)}
              className="settings-feature-row on"
            >
              <span className="settings-feature-icon">🔔</span>
              <span className="settings-feature-label">Alert Rules</span>
              <span className="text-[9px] text-white/25">{alertsOpen ? '▾' : '→'}</span>
            </button>
            {alertsOpen && <AlertRulesSection />}
            <button
              type="button"
              onClick={() => setWatchlistsOpen((v) => !v)}
              className="settings-feature-row on"
            >
              <span className="settings-feature-icon">◎</span>
              <span className="settings-feature-label">Watchlists</span>
              <span className="text-[9px] text-white/25">{watchlistsOpen ? '▾' : '→'}</span>
            </button>
            {watchlistsOpen && <WatchlistSection />}
          </div>
          <div className="settings-hint">
            Watchlists toast in-app when a new signal matches your topic, entity, or place.
          </div>
        </div>
      )}

      {/* Account */}
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
    </div>
  )
}
