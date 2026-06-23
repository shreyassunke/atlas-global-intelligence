/**
 * Build same-origin proxy URLs for news providers (keys stay server-side).
 */

export function newsProxyUrl(provider, params = {}) {
  const sp = new URLSearchParams()
  sp.set('provider', provider)
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue
    sp.set(k, String(v))
  }
  return `/api/news-proxy?${sp}`
}

/** True when adapter should use server proxy (production or explicit flag). */
export function useNewsProxy() {
  return import.meta.env.PROD || import.meta.env.VITE_NEWS_PROXY === 'true'
}
