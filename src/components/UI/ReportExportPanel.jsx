/**
 * Report export panel — template picker + redaction options + PDF/MD/JSON export.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  REPORT_TEMPLATE_IDS,
  REPORT_TEMPLATE_LABELS,
  buildReportBlueprint,
} from '../../core/reportBlueprint.js'
import { buildInvestigationFromDossier, defaultTemplateForIndustry } from '../../core/investigationSchema.js'
import { exportReport, exportHtmlAsPdf } from '../../core/reportExport.js'
import { useAtlasStore } from '../../store/atlasStore.js'
import Panel from '../../design/Panel.jsx'

const CLASSIFICATIONS = [
  { id: 'unclassified', label: 'Unclassified' },
  { id: 'internal', label: 'Internal' },
  { id: 'confidential', label: 'Confidential' },
]

/**
 * @param {Object} props
 * @param {{ target, dossierData, signals, timeFilter, industry? }} props.dossierContext
 * @param {() => void} [props.onClose]
 */
export default function ReportExportPanel({ dossierContext, onClose }) {
  const pushToast = useAtlasStore((s) => s.pushToast)
  const [templateId, setTemplateId] = useState(
    () => defaultTemplateForIndustry(dossierContext?.industry),
  )
  const [classification, setClassification] = useState('unclassified')
  const [hideSources, setHideSources] = useState(false)
  const [hideHypotheses, setHideHypotheses] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [asyncPdf, setAsyncPdf] = useState(false)

  useEffect(() => {
    setTemplateId(defaultTemplateForIndustry(dossierContext?.industry))
  }, [dossierContext?.industry, dossierContext?.target?.iso])

  const investigation = useMemo(() => {
    if (!dossierContext?.target) return null
    return buildInvestigationFromDossier({
      target: dossierContext.target,
      dossierData: dossierContext.dossierData || {},
      signals: dossierContext.signals || [],
      timeFilter: dossierContext.timeFilter || 'live',
      industry: dossierContext.industry || 'general',
    })
  }, [dossierContext])

  const blueprint = useMemo(() => {
    if (!investigation) return null
    return buildReportBlueprint(investigation, {
      templateId,
      classification,
      redaction: { hideSources, hideHypotheses },
    })
  }, [investigation, templateId, classification, hideSources, hideHypotheses])

  const runExport = useCallback(async (format) => {
    if (!blueprint) return
    setExporting(true)
    try {
      const result = await exportReport(blueprint, format, { async: asyncPdf && format === 'pdf' })
      if (result.ok) {
        pushToast({ label: 'Export', message: `${format.toUpperCase()} report saved` })
        return
      }
      if (result.html && format === 'pdf') {
        await exportHtmlAsPdf(result.html, `atlas-report-${templateId}-${Date.now()}.pdf`)
        pushToast({ label: 'Export', message: 'PDF saved (client fallback)' })
        return
      }
      pushToast({ label: 'Export', message: result.error || 'Export failed' })
    } catch (err) {
      pushToast({ label: 'Export', message: err?.message || 'Export failed' })
    } finally {
      setExporting(false)
    }
  }, [blueprint, templateId, pushToast, asyncPdf])

  if (!dossierContext?.target) {
    return (
      <Panel title="Export Report" provenance="Delivery plane">
        <p className="text-[11px] text-white/45">
          Open a dossier or investigation to export an industry-ready report.
        </p>
      </Panel>
    )
  }

  return (
    <Panel
      title="Export Report"
      provenance={`${dossierContext.target.name} · ${blueprint?.provenance?.evidenceCount ?? 0} evidence`}
      actions={onClose && (
        <button type="button" className="report-export-panel__btn" onClick={onClose}>
          Close
        </button>
      )}
    >
      <div className="report-export-panel">
        <div className="report-export-panel__templates">
          {REPORT_TEMPLATE_IDS.map((id) => (
            <button
              key={id}
              type="button"
              className={`report-export-panel__template-btn${templateId === id ? ' is-selected' : ''}`}
              onClick={() => setTemplateId(id)}
            >
              <span className="report-export-panel__template-label">
                {REPORT_TEMPLATE_LABELS[id]}
              </span>
              <span className="report-export-panel__template-desc">{id}</span>
            </button>
          ))}
        </div>

        <div className="report-export-panel__options">
          <label className="report-export-panel__option">
            Classification
            <select
              value={classification}
              onChange={(e) => setClassification(e.target.value)}
              className="ml-auto rounded border border-white/10 bg-black/30 px-2 py-1 text-[10px] text-white/70"
            >
              {CLASSIFICATIONS.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </label>
          <label className="report-export-panel__option">
            <input
              type="checkbox"
              checked={hideSources}
              onChange={(e) => setHideSources(e.target.checked)}
            />
            Hide source URLs in body
          </label>
          <label className="report-export-panel__option">
            <input
              type="checkbox"
              checked={hideHypotheses}
              onChange={(e) => setHideHypotheses(e.target.checked)}
            />
            Exclude unverified hypotheses
          </label>
          <label className="report-export-panel__option">
            <input
              type="checkbox"
              checked={asyncPdf}
              onChange={(e) => setAsyncPdf(e.target.checked)}
            />
            Background PDF job (heavy reports)
          </label>
        </div>

        <div className="report-export-panel__actions">
          <button
            type="button"
            className="report-export-panel__btn report-export-panel__btn--primary"
            disabled={exporting || !blueprint}
            onClick={() => runExport('pdf')}
          >
            {exporting ? 'Exporting…' : 'PDF'}
          </button>
          <button
            type="button"
            className="report-export-panel__btn"
            disabled={exporting || !blueprint}
            onClick={() => runExport('markdown')}
          >
            Markdown
          </button>
          <button
            type="button"
            className="report-export-panel__btn"
            disabled={exporting || !blueprint}
            onClick={() => runExport('json')}
          >
            JSON
          </button>
          <button
            type="button"
            className="report-export-panel__btn"
            disabled={exporting || !blueprint}
            onClick={() => runExport('stix')}
          >
            STIX 2.1
          </button>
        </div>
      </div>
    </Panel>
  )
}
