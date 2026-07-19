/**
 * Right-click location context menu — [place] economy / top news / weather.
 * Anchored at the cursor; clamps inside the viewport.
 * Prefetches TOP NEWS on open / hover (moderate eagerness).
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { TrendingUp, Newspaper, CloudSun } from 'lucide-react'
import { useAtlasStore } from '../../store/atlasStore'
import { placeDisplayLabel } from '../../utils/placeHierarchy'
import { prefetchPlaceTopNews } from '../../utils/placeNewsPrefetch'
import { cn } from '../../lib/utils'

const MENU_PAD = 12
const EST_W = 280
const EST_H = 220

function clampMenuPosition(x, y, width, height) {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800
  return {
    left: Math.max(MENU_PAD, Math.min(x, vw - width - MENU_PAD)),
    top: Math.max(MENU_PAD, Math.min(y, vh - height - MENU_PAD)),
  }
}

function formatCoord(n, axis) {
  if (!Number.isFinite(n)) return '—'
  const hemi = axis === 'lat' ? (n >= 0 ? 'N' : 'S') : (n >= 0 ? 'E' : 'W')
  return `${Math.abs(n).toFixed(2)}°${hemi}`
}

const ACTIONS = [
  {
    id: 'economy',
    type: 'economy',
    label: 'economy',
    hint: 'GDP, FX, and macro indicators for this place',
    icon: TrendingUp,
    accent: 'text-dim-economy',
  },
  {
    id: 'news',
    type: 'countryNews',
    label: 'top news',
    hint: 'Latest GDELT headlines for this place',
    icon: Newspaper,
    accent: 'text-dim-narrative',
  },
  {
    id: 'weather',
    type: 'weather',
    label: 'weather',
    hint: 'Conditions at the cursor lat/long',
    icon: CloudSun,
    accent: 'text-dim-environment',
  },
]

export default function CountryContextMenu() {
  const menu = useAtlasStore((s) => s.countryContextMenu)
  const closeCountryContextMenu = useAtlasStore((s) => s.closeCountryContextMenu)
  const openCountryInspect = useAtlasStore((s) => s.openCountryInspect)
  const rootRef = useRef(null)
  const [size, setSize] = useState({ w: EST_W, h: EST_H })

  const locationLabel = useMemo(() => {
    if (!menu) return 'Location'
    // Prefer reverse-geocoded place; while pending, avoid flashing the country name.
    if (menu.place) return placeDisplayLabel(menu.place, menu.country)
    if (menu.placeStatus === 'pending') return 'Location'
    return placeDisplayLabel(null, menu.country)
  }, [menu?.place, menu?.placeStatus, menu?.country?.name])

  // Intent prefetch when menu has a resolvable place (or country-only fallback).
  // Do not abort in-flight on unmount — panel open may share the same ArtList fetch.
  useEffect(() => {
    if (!menu) return undefined
    if (menu.placeStatus === 'pending' && !menu.place) return undefined
    prefetchPlaceTopNews({
      place: menu.place,
      country: menu.country,
      lat: menu.lat,
      lng: menu.lng,
    })
    return undefined
  }, [menu?.place, menu?.placeStatus, menu?.country?.name, menu?.lat, menu?.lng])

  useLayoutEffect(() => {
    if (!menu || !rootRef.current) return
    const rect = rootRef.current.getBoundingClientRect()
    if (rect.width > 0 && rect.height > 0) {
      setSize({ w: rect.width, h: rect.height })
    }
  }, [menu, locationLabel])

  useEffect(() => {
    if (!menu) return undefined
    const onPointerDown = (e) => {
      // Primary only — secondary button opens/replaces the menu via contextmenu.
      // Closing on button=2 races the next right-click and makes it flaky.
      if (e.button !== 0) return
      if (rootRef.current?.contains(e.target)) return
      closeCountryContextMenu()
    }
    const onScroll = () => closeCountryContextMenu()
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [menu, closeCountryContextMenu])

  const pos = menu
    ? clampMenuPosition(menu.x, menu.y, size.w, size.h)
    : { left: 0, top: 0 }

  return (
    <AnimatePresence>
      {menu && (
        <motion.div
          key={`${menu.lat}-${menu.lng}-${menu.x}-${menu.y}`}
          ref={rootRef}
          role="menu"
          aria-label={`${locationLabel} options`}
          className="country-context-menu fixed z-[60] w-[min(300px,calc(100vw-24px))] overflow-hidden rounded-xl border border-line bg-bg/92 shadow-[0_16px_48px_rgba(0,0,0,0.55)] backdrop-blur-xl print:hidden"
          style={{ left: pos.left, top: pos.top }}
          initial={{ opacity: 0, scale: 0.96, y: -4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98, y: -2 }}
          transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
        >
          <header className="border-b border-line px-3.5 py-2.5">
            <p className="truncate font-ui text-[13px] font-semibold leading-tight text-text">
              {locationLabel}
              {menu.placeStatus === 'pending' && !menu.place && (
                <span className="ml-1.5 font-data text-[9px] font-normal uppercase tracking-wider text-faint">
                  resolving…
                </span>
              )}
            </p>
            <p className="mt-0.5 font-data text-[9px] uppercase tracking-[0.12em] text-faint">
              {menu.country.iso ? `${menu.country.iso} · ` : ''}
              {formatCoord(menu.lat, 'lat')} {formatCoord(menu.lng, 'lng')}
            </p>
          </header>

          <ul className="flex flex-col p-1.5">
            {ACTIONS.map((action) => {
              const Icon = action.icon
              return (
                <li key={action.id}>
                  <button
                    type="button"
                    role="menuitem"
                    className={cn(
                      'group flex w-full cursor-pointer items-start gap-3 rounded-lg px-2.5 py-2.5 text-left transition-colors duration-150',
                      'hover:bg-accent-dim focus-visible:bg-accent-dim focus-visible:outline-none',
                    )}
                    onMouseEnter={() => {
                      if (action.type === 'countryNews') {
                        prefetchPlaceTopNews({
                          place: menu.place,
                          country: menu.country,
                          lat: menu.lat,
                          lng: menu.lng,
                        })
                      }
                    }}
                    onFocus={() => {
                      if (action.type === 'countryNews') {
                        prefetchPlaceTopNews({
                          place: menu.place,
                          country: menu.country,
                          lat: menu.lat,
                          lng: menu.lng,
                        })
                      }
                    }}
                    onClick={() => openCountryInspect(action.type, {
                      country: menu.country,
                      place: menu.place,
                      lat: menu.lat,
                      lng: menu.lng,
                    })}
                  >
                    <span
                      className={cn(
                        'mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line bg-surface',
                        action.accent,
                      )}
                    >
                      <Icon size={15} strokeWidth={2} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-ui text-[12px] font-semibold leading-tight text-text group-hover:text-accent">
                        {action.label}
                      </span>
                      <span className="mt-0.5 block font-data text-[10px] leading-snug text-muted">
                        {action.hint}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
