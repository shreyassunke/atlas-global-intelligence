import { useState } from 'react'
import { useAtlasStore } from '../../store/atlasStore'

const PRESETS = [
  { label: 'LIVE', value: 0 },
  { label: '-6H', value: 6 * 3600_000 },
  { label: '-24H', value: 24 * 3600_000 },
  { label: '-7D', value: 7 * 24 * 3600_000 },
]

export default function TimeControls() {
  const [activePreset, setActivePreset] = useState(0)
  const [replaySpeed, setReplaySpeed] = useState(1)
  const events = useAtlasStore((s) => s.events)

  const handlePreset = (value) => {
    setActivePreset(value)
  }

  const speeds = [1, 5, 20, 100]

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      fontFamily: 'var(--font-hud)',
    }}>
      <div className="settings-toggle-group" style={{ width: 'auto', gap: 2 }}>
        {PRESETS.map((p) => (
          <button
            key={p.label}
            className={`settings-toggle-btn ${activePreset === p.value ? 'active' : ''}`}
            style={{ flex: '0 0 auto', padding: '4px 8px', fontSize: '9px' }}
            onClick={() => handlePreset(p.value)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {activePreset > 0 && (
        <div style={{ display: 'flex', gap: 2, marginLeft: 6 }}>
          {speeds.map((s) => (
            <button
              key={s}
              className={`settings-toggle-btn ${replaySpeed === s ? 'active' : ''}`}
              style={{ flex: '0 0 auto', padding: '3px 6px', fontSize: '8px' }}
              onClick={() => setReplaySpeed(s)}
            >
              {s}×
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
