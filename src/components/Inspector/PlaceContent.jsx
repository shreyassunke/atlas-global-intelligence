/**
 * Inspector content — place search result (former SearchResultCard body).
 * Renders the place name, hero photo (Google Places `photos`), and a short
 * description (`editorial_summary`, falling back to the formatted address).
 * Closing clears the highlight, which wipes the pin + boundary from the globe.
 */
import { PLACE_SEARCH_PIN_SRC } from '../../constants/placeSearchPin'
import { useAtlasStore } from '../../store/atlasStore'
import { loadCountryIndex, findCountry } from '../../services/countryIndex'

/** Phase 5 — resolve the searched place to a country and open its Dossier. */
async function openPlaceDossier(highlight) {
  try {
    const index = await loadCountryIndex()
    const hit = findCountry(index, {
      text: highlight.label,
      lat: highlight.lat,
      lng: highlight.lng,
    })
    if (hit) useAtlasStore.getState().openDossier(hit)
    else useAtlasStore.getState().pushToast({ label: 'Dossier', message: 'Could not resolve a country for this place' })
  } catch {
    /* country index unavailable — ignore */
  }
}

const IconClose = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <line x1="5" y1="5" x2="19" y2="19" />
    <line x1="19" y1="5" x2="5" y2="19" />
  </svg>
)

export default function PlaceContent({ highlight, onClose }) {
  return (
    <>
      <header className="search-result-card__header">
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
        <button
          type="button"
          className="search-result-card__close"
          aria-label="Close"
          onClick={onClose}
        >
          <IconClose />
        </button>
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

        <button
          type="button"
          className="search-result-card__dossier-btn"
          onClick={() => openPlaceDossier(highlight)}
          title="Open the country dossier for this place"
        >
          ◉ Open Country Dossier
        </button>
      </div>
    </>
  )
}
