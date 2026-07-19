import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAtlasStore } from '../../store/atlasStore'
import { loadCountryIndex } from '../../services/countryIndex'
import { DIMENSIONS } from '../../core/eventSchema'

const ALL_DIMENSIONS = Object.values(DIMENSIONS)

export default function CreateWorkspaceModal({ open, onClose }) {
  const createWorkspace = useAtlasStore((s) => s.createWorkspace)
  const openWorkspace = useAtlasStore((s) => s.openWorkspace)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [keywordsRaw, setKeywordsRaw] = useState('')
  const [selectedRegions, setSelectedRegions] = useState([])
  const [countryIndex, setCountryIndex] = useState([])
  const [countryQuery, setCountryQuery] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    loadCountryIndex().then(setCountryIndex).catch(() => {})
  }, [open])

  const filteredCountries = useMemo(() => {
    const q = countryQuery.trim().toLowerCase()
    if (!q) return countryIndex.slice(0, 24)
    return countryIndex
      .filter((c) => c.name.toLowerCase().includes(q) || c.iso.toLowerCase().includes(q))
      .slice(0, 24)
  }, [countryIndex, countryQuery])

  const toggleRegion = (iso) => {
    setSelectedRegions((prev) =>
      prev.includes(iso) ? prev.filter((r) => r !== iso) : [...prev, iso],
    )
  }

  const reset = () => {
    setName('')
    setDescription('')
    setKeywordsRaw('')
    setSelectedRegions([])
    setCountryQuery('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    const keywords = keywordsRaw.split(',').map((k) => k.trim()).filter(Boolean)
    const created = await createWorkspace({
      name,
      description,
      focus_regions: selectedRegions,
      keywords,
      active_dimensions: [...ALL_DIMENSIONS],
    })
    setSaving(false)
    if (created) {
      reset()
      onClose()
      openWorkspace(created.id)
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="ws-modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.form
            className="ws-modal"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSubmit}
          >
            <header className="ws-modal__header">
              <h2>New investigation workspace</h2>
              <button type="button" className="ws-modal__close" onClick={onClose} aria-label="Close">×</button>
            </header>

            <div className="ws-modal__body">
              <label className="ws-field">
                <span>Name</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Red Sea shipping monitor"
                  required
                  autoFocus
                />
              </label>

              <label className="ws-field">
                <span>Description</span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What are you watching for?"
                  rows={2}
                />
              </label>

              <div className="ws-field">
                <span>Focus regions</span>
                <input
                  type="search"
                  value={countryQuery}
                  onChange={(e) => setCountryQuery(e.target.value)}
                  placeholder="Search countries…"
                  className="ws-field__search"
                />
                <div className="ws-country-picker">
                  {filteredCountries.map((c) => (
                    <button
                      key={c.iso}
                      type="button"
                      className={`ws-country-chip ${selectedRegions.includes(c.iso) ? 'is-selected' : ''}`}
                      onClick={() => toggleRegion(c.iso)}
                    >
                      {c.iso} · {c.name}
                    </button>
                  ))}
                </div>
                {selectedRegions.length > 0 && (
                  <p className="ws-field__hint">{selectedRegions.length} region{selectedRegions.length !== 1 ? 's' : ''} selected</p>
                )}
              </div>

              <label className="ws-field">
                <span>Keywords <em className="ws-field__optional">optional, comma-separated</em></span>
                <input
                  type="text"
                  value={keywordsRaw}
                  onChange={(e) => setKeywordsRaw(e.target.value)}
                  placeholder="Houthi, shipping, blockade"
                />
              </label>

            </div>

            <footer className="ws-modal__footer">
              <button type="button" className="ws-modal__btn ws-modal__btn--ghost" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="ws-modal__btn ws-modal__btn--primary" disabled={saving || !name.trim()}>
                {saving ? 'Creating…' : 'Create & open'}
              </button>
            </footer>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
