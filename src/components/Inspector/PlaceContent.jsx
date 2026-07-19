/**
 * Inspector content — place search result (former SearchResultCard body).
 * Renders the place name, hero photo, description, and location inspect
 * actions (economy / top news / weather) wired to the same lat/lng
 * resolution path as the right-click context menu.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { TrendingUp, Newspaper, CloudSun } from 'lucide-react'
import { PLACE_SEARCH_PIN_SRC } from '../../constants/placeSearchPin'
import { useAtlasStore } from '../../store/atlasStore'
import { resolveLocationInspectContext } from '../../globe-core/interactions'
import { prefetchPlaceTopNews } from '../../utils/placeNewsPrefetch'
import { cn } from '../../lib/utils'
import {
  InspectorWindowControls,
  useInspectorWindow,
} from './InspectorWindowContext'

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
    hint: 'Conditions at this place lat/long',
    icon: CloudSun,
    accent: 'text-dim-environment',
  },
]

export default function PlaceContent({ highlight, onClose }) {
  const openCountryInspect = useAtlasStore((s) => s.openCountryInspect)
  const pushToast = useAtlasStore((s) => s.pushToast)
  const [context, setContext] = useState(null)
  const [resolving, setResolving] = useState(true)
  const [opening, setOpening] = useState(false)
  const contextRef = useRef(null)

  const locationLabel = highlight?.label || context?.place?.label || 'Location'

  useEffect(() => {
    if (!highlight || !Number.isFinite(highlight.lat) || !Number.isFinite(highlight.lng)) {
      setResolving(false)
      setContext(null)
      contextRef.current = null
      return undefined
    }
    let cancelled = false
    setResolving(true)

    resolveLocationInspectContext(highlight.lat, highlight.lng, {
      label: highlight.label,
      formattedAddress: highlight.formattedAddress,
    }).then((resolved) => {
      if (cancelled) return
      contextRef.current = resolved
      setContext(resolved)
      setResolving(false)
      if (resolved?.place || resolved?.country) {
        prefetchPlaceTopNews({
          place: resolved.place,
          country: resolved.country,
          lat: highlight.lat,
          lng: highlight.lng,
        })
      }
    })

    return () => {
      cancelled = true
    }
  }, [highlight?.createdAt, highlight?.lat, highlight?.lng, highlight?.label, highlight?.formattedAddress])

  const openAction = useCallback(
    async (type) => {
      if (!highlight || !Number.isFinite(highlight.lat) || !Number.isFinite(highlight.lng)) return
      setOpening(true)
      try {
        let resolved = contextRef.current
        if (!resolved?.country?.fips && !resolved?.country?.name) {
          resolved = await resolveLocationInspectContext(highlight.lat, highlight.lng, {
            label: highlight.label,
            formattedAddress: highlight.formattedAddress,
          })
          contextRef.current = resolved
          setContext(resolved)
        }

        if (!resolved?.country?.fips && !resolved?.country?.name) {
          pushToast({
            label: 'Place',
            message: 'Could not resolve a country for this place',
          })
          return
        }

        openCountryInspect(type, {
          country: resolved.country,
          place: resolved.place,
          lat: highlight.lat,
          lng: highlight.lng,
        })
      } finally {
        setOpening(false)
      }
    },
    [highlight, openCountryInspect, pushToast],
  )

  const windowApi = useInspectorWindow()

  if (!highlight) return null

  const busy = opening || (resolving && !context?.country)

  return (
    <>
      <header
        className={cn(
          'search-result-card__header',
          windowApi && 'inspector-panel__drag-header',
        )}
        onPointerDown={windowApi?.onDragHandlePointerDown}
      >
        <div className="search-result-card__title-row">
          <span className="search-result-card__pin" aria-hidden>
            <img
              src={PLACE_SEARCH_PIN_SRC}
              width={20}
              height={23}
              alt=""
              draggable={false}
            />
          </span>
          <h3 className="search-result-card__title" title={highlight.label || ''}>
            {highlight.label || 'Selected place'}
          </h3>
        </div>
        <InspectorWindowControls />
      </header>

      {highlight.photoUrl && (
        <div className="search-result-card__photo">
          <img
            src={highlight.photoUrl}
            alt={highlight.label || ''}
            loading="lazy"
            draggable={false}
          />
          {highlight.photoAttribution && (
            <span
              className="search-result-card__photo-credit"
              dangerouslySetInnerHTML={{ __html: highlight.photoAttribution }}
            />
          )}
        </div>
      )}

      <div className="search-result-card__body">
        {highlight.description ? (
          <p className="search-result-card__desc">{highlight.description}</p>
        ) : highlight.formattedAddress ? (
          <p className="search-result-card__desc search-result-card__desc--address">
            {highlight.formattedAddress}
          </p>
        ) : null}

        {highlight.secondary && highlight.secondary !== highlight.formattedAddress && (
          <p className="search-result-card__meta">{highlight.secondary}</p>
        )}

        <ul className="search-result-card__actions" aria-label={`${locationLabel} options`}>
          {ACTIONS.map((action) => {
            const Icon = action.icon
            return (
              <li key={action.id}>
                <button
                  type="button"
                  className="search-result-card__action"
                  disabled={busy}
                  onClick={() => openAction(action.type)}
                  onMouseEnter={() => {
                    if (action.type === 'countryNews' && (context?.place || context?.country)) {
                      prefetchPlaceTopNews({
                        place: context.place,
                        country: context.country,
                        lat: highlight.lat,
                        lng: highlight.lng,
                      })
                    }
                  }}
                >
                  <span className={cn('search-result-card__action-icon', action.accent)}>
                    <Icon size={15} strokeWidth={2} aria-hidden />
                  </span>
                  <span className="search-result-card__action-text">
                    <span className="search-result-card__action-label">{action.label}</span>
                    <span className="search-result-card__action-hint">{action.hint}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </>
  )
}
