/**
 * Print / PDF stylesheet — embedded in Handlebars partial for server render.
 * Mirrors src/design/print.css for offline PDF fidelity.
 */
export const PRINT_STYLES = `
@page { size: A4; margin: 18mm 16mm; }
* { box-sizing: border-box; }
body {
  font-family: 'Georgia', 'Times New Roman', serif;
  font-size: 10.5pt;
  line-height: 1.45;
  color: #111;
  margin: 0;
  padding: 0;
}
h1 { font-size: 18pt; font-weight: 700; margin: 0 0 6pt; letter-spacing: 0.02em; }
h2 {
  font-size: 11pt;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin: 18pt 0 8pt;
  padding-bottom: 4pt;
  border-bottom: 1px solid #ccc;
  color: #333;
}
.report-header { margin-bottom: 16pt; }
.report-header--executive h1 { font-size: 20pt; }
.report-classification {
  font-family: 'Courier New', monospace;
  font-size: 8pt;
  font-weight: 700;
  letter-spacing: 0.15em;
  color: #666;
  margin-bottom: 8pt;
}
.report-meta {
  font-family: 'Courier New', monospace;
  font-size: 8.5pt;
  color: #666;
  margin: 0;
}
.report-body { white-space: pre-wrap; margin-bottom: 8pt; }
.report-section { page-break-inside: avoid; margin-bottom: 12pt; }
.report-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 9pt;
  margin-top: 6pt;
}
.report-table th,
.report-table td {
  border: 1px solid #ddd;
  padding: 4pt 6pt;
  text-align: left;
  vertical-align: top;
}
.report-table th {
  background: #f4f4f4;
  font-weight: 600;
  font-size: 8pt;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.report-table tr.low-confidence { background: #fff8e6; }
.report-timeline, .report-sources, .report-signals, .report-chronology {
  margin: 6pt 0;
  padding-left: 18pt;
  font-size: 9.5pt;
}
.report-chronology li { margin-bottom: 4pt; }
.report-chronology time { font-family: monospace; color: #555; }
.muted { color: #888; font-size: 8.5pt; }
.report-map { max-width: 100%; height: auto; border: 1px solid #ddd; margin-top: 8pt; }
.report-footer {
  margin-top: 24pt;
  padding-top: 8pt;
  border-top: 1px solid #ccc;
  font-family: 'Courier New', monospace;
  font-size: 7.5pt;
  color: #888;
  text-align: center;
}
.atlas-report--sitrep .report-header { border-left: 4px solid #1a365d; padding-left: 10pt; }
.atlas-report--executive .report-header { border-left: 4px solid #c05621; padding-left: 10pt; }
.atlas-report--ngo .report-header { border-left: 4px solid #276749; padding-left: 10pt; }
.atlas-report--journalism .report-header { border-left: 4px solid #553c9a; padding-left: 10pt; }
`
