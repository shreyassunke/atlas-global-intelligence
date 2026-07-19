/**
 * Workbench — Settings (Preferences) tab.
 *
 * Renderer, alerts & watchlists, and account. Layer toggles live in the Layers tab;
 * share/brief lives only in the header overflow menu.
 */
import { useState } from 'react'
import { useAtlasStore } from '../../store/atlasStore'
import AlertRulesSection from '../UI/AlertRulesPanel'
import WatchlistSection from '../UI/WatchlistPanel'

const GLOBE_MODES = [
  { id: 'cesium', label: 'Google 3D', desc: 'Photorealistic Earth with native labels (Google Map3D)' },
  { id: 'globegl', label: 'Globe.GL', desc: 'Lightweight 3D globe, smooth & fast' },
  { id: 'leaflet', label: '2D Map', desc: 'Flat map, minimal GPU' },
]

export default function PreferencesTab() {
  const globeMode = useAtlasStore((s) => s.globeMode)
  const setGlobeMode = useAtlasStore((s) => s.setGlobeMode)
  const user = useAtlasStore((s) => s.user)
  const signOut = useAtlasStore((s) => s.signOut)

  const [alertsOpen, setAlertsOpen] = useState(false)
  const [watchlistsOpen, setWatchlistsOpen] = useState(false)

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
