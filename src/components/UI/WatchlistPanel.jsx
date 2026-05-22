import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAtlasStore } from '../../store/atlasStore'
import { supabase } from '../../services/supabase'

const KIND_OPTIONS = [
  { value: 'topic', label: 'Topic', hint: 'Keyword in headline or summary' },
  { value: 'entity', label: 'Entity', hint: 'Actor, org, or entity name' },
  { value: 'place', label: 'Place', hint: 'Location name or lat,lng,radiusKm' },
]

function emptyItem(user) {
  return {
    id: crypto.randomUUID(),
    user_id: user.id,
    name: '',
    kind: 'topic',
    match_value: '',
    enabled: true,
    _isNew: true,
  }
}

export default function WatchlistPanel({ open, onClose }) {
  const user = useAtlasStore((s) => s.user)
  const mobileMode = useAtlasStore((s) => s.mobileMode)
  const watchlists = useAtlasStore((s) => s.watchlists)
  const setWatchlists = useAtlasStore((s) => s.setWatchlists)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const panelRef = useRef(null)

  useEffect(() => {
    if (!open) return
    function handleOutside(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', handleOutside)
    document.addEventListener('touchstart', handleOutside)
    return () => {
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('touchstart', handleOutside)
    }
  }, [open, onClose])

  useEffect(() => {
    if (!open || !user || !supabase) return
    setLoading(true)
    supabase
      .from('watchlists')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        setItems(data || [])
        setWatchlists(data || [])
        setLoading(false)
      })
  }, [open, user, setWatchlists])

  const addItem = () => {
    if (!user) return
    setItems((prev) => [...prev, emptyItem(user)])
  }

  const updateItem = (id, field, value) => {
    setItems((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)))
  }

  const removeItem = async (id) => {
    const row = items.find((r) => r.id === id)
    setItems((prev) => {
      const next = prev.filter((r) => r.id !== id)
      setWatchlists(next)
      return next
    })
    if (supabase && row && !row._isNew) {
      await supabase.from('watchlists').delete().eq('id', id)
    }
  }

  const saveAll = async () => {
    if (!supabase || !user) return
    setSaving(true)
    const saved = []
    for (const row of items) {
      if (!row.name?.trim() || !row.match_value?.trim()) continue
      const payload = {
        id: row.id,
        user_id: user.id,
        name: row.name.trim(),
        kind: row.kind || 'topic',
        match_value: row.match_value.trim(),
        enabled: row.enabled !== false,
      }
      await supabase.from('watchlists').upsert(payload)
      saved.push({ ...payload, _isNew: false })
    }
    setItems(saved)
    setWatchlists(saved)
    setSaving(false)
  }

  if (!user) return null

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={panelRef}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          transition={{ duration: 0.22 }}
          className={`fixed top-[50px] z-[60] max-h-[80vh] overflow-y-auto
                     bg-[rgba(8,12,24,0.96)] border border-white/[0.08] backdrop-blur-xl ${
                       mobileMode ? 'left-4 right-4 w-auto' : 'right-[6px] w-[360px]'
                     }`}
          style={{ fontFamily: 'var(--font-data)' }}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
            <span className="text-[9px] tracking-[0.3em] text-white/60 uppercase">Watchlists</span>
            <button type="button" onClick={onClose} className="text-[10px] text-white/30 hover:text-white/60 transition-colors">
              ✕
            </button>
          </div>

          <p className="px-4 pt-2 pb-1 text-[8px] text-white/40 font-mono leading-snug">
            Save topics, entities, or places. You get an in-app toast when a new geocoded signal matches.
          </p>

          <div className="p-4 flex flex-col gap-3">
            {loading ? (
              <p className="text-[9px] tracking-[0.2em] text-white/30 text-center py-6">Loading...</p>
            ) : items.length === 0 ? (
              <p className="text-[9px] tracking-[0.2em] text-white/30 text-center py-6">
                No watchlists yet. Add one below.
              </p>
            ) : (
              items.map((row) => {
                const kindMeta = KIND_OPTIONS.find((k) => k.value === row.kind) || KIND_OPTIONS[0]
                return (
                  <div key={row.id} className="border border-white/[0.06] p-3 flex flex-col gap-2">
                    <label className="flex flex-col gap-1">
                      <span className="text-[8px] tracking-[0.2em] text-white/30 uppercase">Label</span>
                      <input
                        type="text"
                        value={row.name}
                        onChange={(e) => updateItem(row.id, 'name', e.target.value)}
                        placeholder="e.g. Hormuz shipping"
                        className="bg-white/[0.04] border border-white/[0.08] text-[9px] text-white/70 py-1.5 px-2 font-mono outline-none focus:border-[var(--accent)]/30"
                      />
                    </label>
                    <div className="flex gap-2">
                      <label className="w-24 flex flex-col gap-1 flex-shrink-0">
                        <span className="text-[8px] tracking-[0.2em] text-white/30 uppercase">Type</span>
                        <select
                          value={row.kind || 'topic'}
                          onChange={(e) => updateItem(row.id, 'kind', e.target.value)}
                          className="bg-white/[0.04] border border-white/[0.08] text-[9px] text-white/70 py-1.5 px-2 font-mono outline-none"
                        >
                          {KIND_OPTIONS.map((k) => (
                            <option key={k.value} value={k.value}>{k.label}</option>
                          ))}
                        </select>
                      </label>
                      <label className="flex-1 flex flex-col gap-1">
                        <span className="text-[8px] tracking-[0.2em] text-white/30 uppercase">Match</span>
                        <input
                          type="text"
                          value={row.match_value}
                          onChange={(e) => updateItem(row.id, 'match_value', e.target.value)}
                          placeholder={kindMeta.hint}
                          className="bg-white/[0.04] border border-white/[0.08] text-[9px] text-white/70 py-1.5 px-2 font-mono outline-none focus:border-[var(--accent)]/30"
                        />
                      </label>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => updateItem(row.id, 'enabled', !row.enabled)}
                        className={`text-[8px] tracking-[0.15em] uppercase font-mono px-2 py-1 border transition-colors ${
                          row.enabled !== false
                            ? 'border-[var(--accent)]/30 text-[var(--accent)]/70'
                            : 'border-white/10 text-white/30'
                        }`}
                      >
                        {row.enabled !== false ? 'On' : 'Off'}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeItem(row.id)}
                        className="ml-auto text-[10px] text-white/20 hover:text-red-400/60"
                        title="Delete"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                )
              })
            )}

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={addItem}
                className="flex-1 py-2 min-h-[36px] border border-white/[0.08] hover:border-white/15
                           text-[9px] tracking-[0.3em] text-white/40 hover:text-white/60 font-mono uppercase"
              >
                + Add Watchlist
              </button>
              {items.length > 0 && (
                <button
                  type="button"
                  onClick={saveAll}
                  disabled={saving}
                  className="flex-1 py-2 min-h-[36px] border border-[var(--accent)]/20 hover:border-[var(--accent)]/40
                             text-[9px] tracking-[0.3em] text-[var(--accent)]/60 font-mono uppercase disabled:opacity-30"
                >
                  {saving ? 'Saving...' : 'Save All'}
                </button>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
