import { useRef, useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAtlasStore } from '../../store/atlasStore'

function getAvatarUrl(user) {
  if (!user?.user_metadata) return null
  const m = user.user_metadata
  return m.avatar_url || m.picture || null
}

function getInitials(user) {
  const email = user?.email || ''
  const local = email.split('@')[0] || email
  const cleaned = local.replace(/[^a-zA-Z0-9]/g, '')
  if (cleaned.length >= 2) return cleaned.slice(0, 2).toUpperCase()
  if (local.length >= 2) return local.slice(0, 2).toUpperCase()
  return email.slice(0, 1).toUpperCase() || '?'
}

const IconUserOutline = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
)

const IconSliders = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <line x1="4" y1="21" x2="4" y2="14" />
    <line x1="4" y1="10" x2="4" y2="3" />
    <line x1="12" y1="21" x2="12" y2="12" />
    <line x1="12" y1="8" x2="12" y2="3" />
    <line x1="20" y1="21" x2="20" y2="16" />
    <line x1="20" y1="12" x2="20" y2="3" />
    <line x1="1" y1="14" x2="7" y2="14" />
    <line x1="9" y1="8" x2="15" y2="8" />
    <line x1="17" y1="16" x2="23" y2="16" />
  </svg>
)

const IconLogOut = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
)

const IconLogIn = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
    <polyline points="10 17 15 12 10 7" />
    <line x1="15" y1="12" x2="3" y2="12" />
  </svg>
)

export default function HeaderUserMenu() {
  const user = useAtlasStore((s) => s.user)
  const mobileMode = useAtlasStore((s) => s.mobileMode)
  const signOut = useAtlasStore((s) => s.signOut)
  const toggleSettings = useAtlasStore((s) => s.toggleSettings)
  const reopenOnboarding = useAtlasStore((s) => s.reopenOnboarding)

  const [open, setOpen] = useState(false)
  const containerRef = useRef(null)

  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    if (!open) return
    function handleOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) close()
    }
    document.addEventListener('mousedown', handleOutside)
    document.addEventListener('touchstart', handleOutside)
    return () => {
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('touchstart', handleOutside)
    }
  }, [open, close])

  useEffect(() => {
    if (!open) return
    function onKey(e) {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  const avatarUrl = user ? getAvatarUrl(user) : null
  const initials = user ? getInitials(user) : ''

  const handlePreferences = () => {
    toggleSettings()
    close()
  }

  const handleSignOut = async () => {
    await signOut()
    close()
  }

  const handleSignIn = () => {
    reopenOnboarding()
    close()
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        type="button"
        className={`hud-icon-btn ${open ? 'active' : ''} ${user ? 'p-0 overflow-hidden' : ''}`}
        style={user ? { borderRadius: 8 } : undefined}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={user ? 'Account menu' : 'Guest — sign in'}
        title={user ? (user.email || 'Account') : 'Guest'}
        onClick={() => setOpen((v) => !v)}
      >
        {user ? (
          avatarUrl ? (
            <img
              src={avatarUrl}
              alt=""
              className="w-full h-full object-cover"
              width={38}
              height={38}
              referrerPolicy="no-referrer"
            />
          ) : (
            <span className="flex items-center justify-center w-full h-full text-[10px] font-mono font-semibold tracking-wider text-[var(--accent)]/90 bg-[var(--accent)]/10">
              {initials}
            </span>
          )
        ) : (
          <IconUserOutline />
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            className="hud-dropdown hud-user-dropdown"
            initial={{ opacity: 0, y: -6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.96 }}
            transition={{ duration: 0.15 }}
          >
            {user ? (
              <>
                <div className="px-3 py-2.5 border-b border-white/[0.08]">
                  <div
                    className="text-[10px] font-mono text-white/90 truncate"
                    title={user.email || ''}
                  >
                    {user.email || 'Signed in'}
                  </div>
                  {!mobileMode && (
                    <p className="mt-1.5 text-[8px] leading-snug text-white/45 font-mono tracking-[0.06em]">
                      Preferences sync to your account when you change settings.
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  role="menuitem"
                  className="hud-dropdown-item"
                  onClick={handlePreferences}
                >
                  <IconSliders />
                  <span>Preferences &amp; alerts</span>
                </button>
                <button type="button" role="menuitem" className="hud-dropdown-item" onClick={handleSignOut}>
                  <IconLogOut />
                  <span>Sign out</span>
                </button>
              </>
            ) : (
              <>
                <div className="px-3 py-2.5 border-b border-white/[0.08]">
                  <div className="text-[10px] font-mono text-white/70 tracking-[0.12em] uppercase">
                    Guest
                  </div>
                  <p className="mt-1 text-[8px] text-white/45 font-mono leading-snug">
                    Sign in to sync preferences across devices.
                  </p>
                </div>
                <button type="button" role="menuitem" className="hud-dropdown-item" onClick={handleSignIn}>
                  <IconLogIn />
                  <span>Sign in</span>
                </button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
