/**
 * Server-side report engine — Handlebars compile + optional PDF via Chromium.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Handlebars from 'handlebars'
import { PRINT_STYLES } from './printStyles.js'
import { CLASSIFICATION_LABELS } from '../../src/core/reportBlueprint.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TEMPLATES_DIR = path.join(__dirname, '../../templates/reports')

/** @type {Map<string, Handlebars.TemplateDelegate>} */
const templateCache = new Map()

let helpersRegistered = false

function registerHelpers() {
  if (helpersRegistered) return
  Handlebars.registerHelper('eq', (a, b) => a === b)
  Handlebars.registerPartial('printStyles', PRINT_STYLES)
  helpersRegistered = true
}

/**
 * @param {string} templateId
 * @returns {Promise<Handlebars.TemplateDelegate>}
 */
async function loadTemplate(templateId) {
  registerHelpers()
  if (templateCache.has(templateId)) return templateCache.get(templateId)

  const filePath = path.join(TEMPLATES_DIR, `${templateId}.hbs`)
  const source = await fs.readFile(filePath, 'utf8')
  const compiled = Handlebars.compile(source)
  templateCache.set(templateId, compiled)
  return compiled
}

/**
 * Escape plain text for HTML body paragraphs (preserve newlines).
 * @param {string} text
 */
function textToHtml(text) {
  if (!text) return ''
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br/>')
}

/**
 * Prepare blueprint for Handlebars (add derived fields).
 * @param {Object} blueprint
 */
function prepareViewModel(blueprint) {
  return {
    ...blueprint,
    classificationLabel: CLASSIFICATION_LABELS[blueprint.classification] || blueprint.classification,
    sections: (blueprint.sections || []).map((section) => ({
      ...section,
      bodyHtml: textToHtml(section.body),
    })),
  }
}

/**
 * @param {Object} blueprint — ReportBlueprint JSON
 * @returns {Promise<string>} HTML
 */
export async function renderReportHtml(blueprint) {
  const templateId = blueprint.templateId || 'general'
  const template = await loadTemplate(templateId)
  return template(prepareViewModel(blueprint))
}

/**
 * @param {string} html
 * @returns {Promise<Buffer>}
 */
export async function htmlToPdf(html) {
  const chromium = await import('@sparticuz/chromium')
  const puppeteer = await import('puppeteer-core')

  const executablePath = await chromium.default.executablePath()

  const browser = await puppeteer.default.launch({
    args: chromium.default.args,
    defaultViewport: chromium.default.defaultViewport,
    executablePath,
    headless: chromium.default.headless,
  })

  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle0' })
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '18mm', right: '16mm', bottom: '18mm', left: '16mm' },
    })
    return Buffer.from(pdf)
  } finally {
    await browser.close()
  }
}
