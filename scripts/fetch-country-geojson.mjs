/**
 * Ensures Natural Earth 110m country polygons exist for choropleth / map coloring.
 * Skips download when public/geo/ne_110m_admin_0_countries.geojson is already present.
 *
 * Source: https://github.com/nvkelso/natural-earth-vector (public domain)
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const outDir = path.join(root, 'public/geo')
const outPath = path.join(outDir, 'ne_110m_admin_0_countries.geojson')

const SOURCE_URL =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson'

const MIN_BYTES = 50_000

function isValidExisting(filePath) {
  try {
    const stat = fs.statSync(filePath)
    if (stat.size < MIN_BYTES) return false
    const head = fs.readFileSync(filePath, 'utf8').slice(0, 2000)
    return head.includes('"FeatureCollection"') && head.includes('FIPS_10')
  } catch {
    return false
  }
}

async function main() {
  if (isValidExisting(outPath)) {
    console.info('[geo:ensure] Country polygons OK —', outPath)
    return
  }

  fs.mkdirSync(outDir, { recursive: true })
  console.info('[geo:ensure] Downloading Natural Earth 110m countries…')
  console.info('[geo:ensure]', SOURCE_URL)

  const res = await fetch(SOURCE_URL, { signal: AbortSignal.timeout(120_000) })
  if (!res.ok) {
    throw new Error(`Download failed HTTP ${res.status}`)
  }

  const text = await res.text()
  if (!text.includes('FIPS_10') || !text.includes('FeatureCollection')) {
    throw new Error('Downloaded file does not look like ne_110m_admin_0_countries.geojson')
  }

  fs.writeFileSync(outPath, text, 'utf8')
  console.info('[geo:ensure] Wrote', outPath, `(${(text.length / 1024).toFixed(0)} KB)`)
}

main().catch((err) => {
  console.error('[geo:ensure] Failed:', err.message)
  console.error('[geo:ensure] Manual download:', SOURCE_URL)
  process.exit(1)
})
