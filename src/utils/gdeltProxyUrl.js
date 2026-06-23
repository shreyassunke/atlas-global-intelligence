/**
 * Rewrite GDELT REST URLs to same-origin proxy (avoids CORS in browser/worker).
 */

const GDELT_API_ORIGIN = 'https://api.gdeltproject.org'

export function gdeltApiProxyUrl(absoluteUrl) {
  try {
    const u = new URL(absoluteUrl)
    if (u.origin !== GDELT_API_ORIGIN) return absoluteUrl
    const path = u.pathname.replace(/^\/api\/v2\//, '')
    if (!path) return absoluteUrl
    const params = new URLSearchParams(u.searchParams)
    params.set('path', path)
    return `/api/gdelt-api?${params}`
  } catch {
    return absoluteUrl
  }
}

/** Rewrite data.gdeltproject.org URLs (HTTP mixed-content safe). */
export function gdeltDataProxyUrl(absoluteUrl) {
  try {
    const u = new URL(absoluteUrl)
    if (u.hostname !== 'data.gdeltproject.org') return absoluteUrl
    const file = u.pathname.replace(/^\/+/, '')
    if (!file) return absoluteUrl
    return `/api/gdelt-data?file=${encodeURIComponent(file)}`
  } catch {
    return absoluteUrl
  }
}

export function gdeltDataProxyFile(relativePath) {
  const file = String(relativePath || '').replace(/^\/+/, '')
  return `/api/gdelt-data?file=${encodeURIComponent(file)}`
}
