/**
 * Async export job store — Phase 4 PDF job queue.
 * Uses Supabase when configured; falls back to in-memory for dev.
 */
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'

/** @type {Map<string, object>} */
const memoryJobs = new Map()
const MEMORY_TTL_MS = 30 * 60 * 1000

/** @type {import('@supabase/supabase-js').SupabaseClient | null} */
let adminClient = null

function getAdminClient() {
  if (adminClient) return adminClient
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  adminClient = createClient(url, key, { auth: { persistSession: false } })
  return adminClient
}

function pruneMemoryJobs() {
  const cutoff = Date.now() - MEMORY_TTL_MS
  for (const [id, job] of memoryJobs) {
    if (job.createdAt < cutoff) memoryJobs.delete(id)
  }
}

/**
 * @param {{ format: string, blueprint: object, userId?: string }} params
 */
export async function createExportJob(params) {
  const id = randomUUID()
  const job = {
    id,
    status: 'pending',
    format: params.format,
    blueprint: params.blueprint,
    userId: params.userId || null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    error: null,
    result: null,
  }

  const client = getAdminClient()
  if (client) {
    const { error } = await client.from('export_jobs').insert({
      id,
      user_id: params.userId || null,
      status: 'pending',
      format: params.format,
      blueprint: params.blueprint,
    })
    if (error) {
      memoryJobs.set(id, job)
      return { id, storage: 'memory', warning: error.message }
    }
    return { id, storage: 'supabase' }
  }

  pruneMemoryJobs()
  memoryJobs.set(id, job)
  return { id, storage: 'memory' }
}

/**
 * @param {string} id
 */
export async function getExportJob(id) {
  const client = getAdminClient()
  if (client) {
    const { data, error } = await client
      .from('export_jobs')
      .select('id, status, format, blueprint, error, created_at, updated_at, completed_at')
      .eq('id', id)
      .single()
    if (!error && data) return { ok: true, job: data, storage: 'supabase' }
  }

  const mem = memoryJobs.get(id)
  if (mem) return { ok: true, job: mem, storage: 'memory' }
  return { ok: false, reason: 'job_not_found' }
}

/**
 * @param {string} id
 * @param {'processing' | 'complete' | 'failed'} status
 * @param {{ error?: string, result?: Buffer | string, contentType?: string }} [extra]
 */
export async function updateExportJob(id, status, extra = {}) {
  const client = getAdminClient()
  const patch = {
    status,
    updated_at: new Date().toISOString(),
    ...(status === 'complete' || status === 'failed' ? { completed_at: new Date().toISOString() } : {}),
    ...(extra.error ? { error: extra.error } : {}),
  }

  if (client) {
    await client.from('export_jobs').update(patch).eq('id', id)
  }

  const mem = memoryJobs.get(id)
  if (mem) {
    mem.status = status
    mem.updatedAt = Date.now()
    if (extra.error) mem.error = extra.error
    if (extra.result) {
      mem.result = extra.result
      mem.contentType = extra.contentType
    }
  }
}

/**
 * @param {string} id
 */
export async function getExportJobResult(id) {
  const mem = memoryJobs.get(id)
  if (mem?.result) {
    return { ok: true, result: mem.result, contentType: mem.contentType || 'application/pdf' }
  }
  return { ok: false, reason: 'result_not_ready' }
}

/**
 * Store result in memory (Supabase bytea omitted for size limits).
 * @param {string} id
 * @param {Buffer | string} result
 * @param {string} contentType
 */
export function storeJobResult(id, result, contentType) {
  const mem = memoryJobs.get(id)
  if (mem) {
    mem.result = result
    mem.contentType = contentType
  } else {
    memoryJobs.set(id, {
      id,
      status: 'complete',
      result,
      contentType,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  }
}
