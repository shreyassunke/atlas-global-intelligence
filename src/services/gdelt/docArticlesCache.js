/**
 * L0 memory + L1 IndexedDB SWR cache for GDELT DOC ArtList results.
 * Fresh window + stale-while-revalidate; stale-if-error via getCachedArticles.
 */

const DB_NAME = 'atlas_doc_articles_cache'
const DB_VERSION = 1
const STORE = 'articles'

/** Fresh for 20 minutes; serve stale up to 4 hours with background revalidate. */
export const ARTLIST_FRESH_MS = 20 * 60 * 1000
export const ARTLIST_STALE_MS = 4 * 60 * 60 * 1000

/** @type {Map<string, { articles: object[], fetchedAt: number }>} */
const memory = new Map()

/** @type {Promise<IDBDatabase> | null} */
let dbPromise = null

function openDb() {
  if (typeof indexedDB === 'undefined') return null
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onerror = () => reject(req.error)
    req.onsuccess = () => resolve(req.result)
    req.onupgradeneeded = (ev) => {
      const db = ev.target.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'key' })
      }
    }
  }).catch(() => null)
  return dbPromise
}

/**
 * @param {string} query
 * @param {string} timespan
 * @param {number} maxrecords
 * @param {string} [sort]
 */
export function artlistCacheKey(query, timespan, maxrecords, sort = 'hybridrel') {
  return [
    String(query || '').trim().toLowerCase(),
    String(timespan || ''),
    String(maxrecords || 12),
    String(sort || 'hybridrel'),
  ].join('|')
}

/**
 * @param {string} key
 * @returns {Promise<{ articles: object[], fetchedAt: number, layer: 'L0'|'L1', fresh: boolean, stale: boolean } | null>}
 */
export async function getCachedArticles(key) {
  const now = Date.now()
  const mem = memory.get(key)
  if (mem?.articles) {
    const age = now - mem.fetchedAt
    if (age <= ARTLIST_STALE_MS) {
      return {
        articles: mem.articles,
        fetchedAt: mem.fetchedAt,
        layer: 'L0',
        fresh: age <= ARTLIST_FRESH_MS,
        stale: age > ARTLIST_FRESH_MS,
      }
    }
    memory.delete(key)
  }

  try {
    const db = await openDb()
    if (!db) return null
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(key)
    const row = await new Promise((res, rej) => {
      req.onsuccess = () => res(req.result || null)
      req.onerror = () => rej(req.error)
    })
    if (!row?.articles || !Array.isArray(row.articles)) return null
    const age = now - (row.fetchedAt || 0)
    if (age > ARTLIST_STALE_MS) return null
    memory.set(key, { articles: row.articles, fetchedAt: row.fetchedAt })
    return {
      articles: row.articles,
      fetchedAt: row.fetchedAt,
      layer: 'L1',
      fresh: age <= ARTLIST_FRESH_MS,
      stale: age > ARTLIST_FRESH_MS,
    }
  } catch {
    return null
  }
}

/**
 * @param {string} key
 * @param {object[]} articles
 */
export async function setCachedArticles(key, articles) {
  const fetchedAt = Date.now()
  const rows = Array.isArray(articles) ? articles : []
  memory.set(key, { articles: rows, fetchedAt })
  if (memory.size > 80) {
    const first = memory.keys().next().value
    if (first) memory.delete(first)
  }
  try {
    const db = await openDb()
    if (!db) return
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put({ key, articles: rows, fetchedAt })
    await new Promise((res, rej) => {
      tx.oncomplete = () => res()
      tx.onerror = () => rej(tx.error)
    })
  } catch {
    /* non-fatal */
  }
}
