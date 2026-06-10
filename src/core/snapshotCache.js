/**
 * L1 client feed snapshot cache (IndexedDB).
 * Used by fetchManager.worker for instant hydrate + persist after fetch.
 */

const DB_NAME = 'atlas_feed_cache'
const DB_VERSION = 1
const STORE = 'snapshots'

/** @type {Promise<IDBDatabase> | null} */
let dbPromise = null

function openDb() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onerror = () => reject(req.error)
    req.onsuccess = () => resolve(req.result)
    req.onupgradeneeded = (ev) => {
      const db = ev.target.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'sourceId' })
      }
    }
  })
  return dbPromise
}

/**
 * @param {string} sourceId
 * @param {{ events?: object[], aggregates?: object, fetchedAt: number, expiresAt?: number, stale?: boolean }} entry
 */
export async function saveSnapshot(sourceId, entry) {
  try {
    const db = await openDb()
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put({
      sourceId,
      events: entry.events || [],
      aggregates: entry.aggregates || null,
      fetchedAt: entry.fetchedAt,
      expiresAt: entry.expiresAt || entry.fetchedAt + 3_600_000,
      stale: Boolean(entry.stale),
    })
    await new Promise((res, rej) => {
      tx.oncomplete = () => res()
      tx.onerror = () => rej(tx.error)
    })
  } catch {
    /* IndexedDB unavailable — non-fatal */
  }
}

/**
 * @param {string} sourceId
 */
export async function loadSnapshot(sourceId) {
  try {
    const db = await openDb()
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(sourceId)
    const row = await new Promise((res, rej) => {
      req.onsuccess = () => res(req.result || null)
      req.onerror = () => rej(req.error)
    })
    return row
  } catch {
    return null
  }
}

/**
 * @param {string[]} [sourceIds]
 */
export async function loadSnapshots(sourceIds) {
  try {
    const db = await openDb()
    const tx = db.transaction(STORE, 'readonly')
    const store = tx.objectStore(STORE)

    if (sourceIds?.length) {
      const out = {}
      await Promise.all(sourceIds.map(async (id) => {
        const req = store.get(id)
        const row = await new Promise((res) => {
          req.onsuccess = () => res(req.result || null)
          req.onerror = () => res(null)
        })
        if (row) out[id] = row
      }))
      return out
    }

    const req = store.getAll()
    const rows = await new Promise((res, rej) => {
      req.onsuccess = () => res(req.result || [])
      req.onerror = () => rej(req.error)
    })
    const out = {}
    for (const row of rows) {
      if (row?.sourceId) out[row.sourceId] = row
    }
    return out
  } catch {
    return {}
  }
}

export function isSnapshotFresh(row, now = Date.now()) {
  if (!row) return false
  const exp = row.expiresAt || 0
  return exp > now && !row.stale
}

/** Live track sources — stale snapshots should not render as authoritative. */
export const LIVE_TRACK_SOURCES = new Set(['opensky', 'aisstream'])
