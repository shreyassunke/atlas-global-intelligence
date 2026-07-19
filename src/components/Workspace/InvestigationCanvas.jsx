/**
 * Investigation Canvas — React Flow graph for evidence + connections.
 * Scoped to the active workspace investigation document.
 */
import { useCallback, useMemo, useEffect } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  addEdge,
  MarkerType,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useAtlasStore } from '../../store/atlasStore'
import { suggestCanvasConnections } from '../../core/canvasSuggestions'
import { downloadMarkdownBrief } from '../../core/briefExport'
import { buildReportBlueprint, blueprintToMarkdown } from '../../core/reportBlueprint'

const EDGE_STYLES = {
  fact: { stroke: '#1D9E75', strokeDasharray: undefined },
  hypothesis: { stroke: '#EF9F27', strokeDasharray: '6 4' },
  correlation: { stroke: '#378ADD', strokeDasharray: '3 3' },
}

const SIGNAL_COLOR = '#1a90ff'

function EvidenceNode({ data, selected }) {
  return (
    <div className={`canvas-node ${selected ? 'is-selected' : ''}`} style={{ '--node-accent': SIGNAL_COLOR }}>
      <Handle type="target" position={Position.Top} className="canvas-handle" />
      <div className="canvas-node__header">
        <span className="canvas-node__dim" style={{ backgroundColor: SIGNAL_COLOR }} />
        <span className="canvas-node__kind">{data.kind || 'event'}</span>
      </div>
      <p className="canvas-node__title">{data.title}</p>
      <p className="canvas-node__meta">
        {data.source}
        {data.confidence != null && data.confidence > 0.5 && (
          <span className="canvas-node__conf"> · corroborated</span>
        )}
      </p>
      <Handle type="source" position={Position.Bottom} className="canvas-handle" />
    </div>
  )
}

const nodeTypes = { evidence: EvidenceNode }

function layoutNodes(evidence, connections) {
  const cols = Math.ceil(Math.sqrt(Math.max(evidence.length, 1)))
  return evidence.map((item, i) => ({
    id: item.id,
    type: 'evidence',
    position: { x: (i % cols) * 240 + 40, y: Math.floor(i / cols) * 140 + 40 },
    data: {
      title: item.title,
      source: item.source,
      dimension: item.dimension,
      kind: item.kind,
      confidence: item.confidence,
    },
  }))
}

function connectionsToEdges(connections) {
  return connections.map((c) => {
    const style = EDGE_STYLES[c.type] || EDGE_STYLES.correlation
    return {
      id: c.id,
      source: c.from,
      target: c.to,
      label: c.label,
      type: 'smoothstep',
      animated: c.type === 'hypothesis',
      style: { stroke: style.stroke, strokeDasharray: style.strokeDasharray, strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color: style.stroke },
      labelStyle: { fill: 'rgba(255,255,255,0.6)', fontSize: 9, fontFamily: 'var(--font-data)' },
      labelBgStyle: { fill: 'rgba(8,12,24,0.9)' },
      labelBgPadding: [4, 2],
      labelBgBorderRadius: 4,
    }
  })
}

export default function InvestigationCanvas() {
  const investigation = useAtlasStore((s) => s.investigation)
  const addCanvasConnection = useAtlasStore((s) => s.addCanvasConnection)
  const removeEvidenceFromCanvas = useAtlasStore((s) => s.removeEvidenceFromCanvas)

  const suggestions = useMemo(
    () => (investigation ? suggestCanvasConnections(investigation) : []),
    [investigation],
  )

  const initialNodes = useMemo(
    () => layoutNodes(investigation?.evidence || [], investigation?.connections || []),
    [investigation?.evidence, investigation?.connections],
  )
  const initialEdges = useMemo(
    () => connectionsToEdges(investigation?.connections || []),
    [investigation?.connections],
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  // Sync when investigation changes externally
  useEffect(() => {
    setNodes(initialNodes)
    setEdges(initialEdges)
  }, [initialNodes, initialEdges, setNodes, setEdges])

  const onConnect = useCallback((params) => {
    setEdges((eds) => addEdge({
      ...params,
      type: 'smoothstep',
      style: EDGE_STYLES.correlation,
      markerEnd: { type: MarkerType.ArrowClosed, color: EDGE_STYLES.correlation.stroke },
    }, eds))
    addCanvasConnection({
      id: crypto.randomUUID(),
      from: params.source,
      to: params.target,
      label: 'Analyst link',
      type: 'correlation',
    })
  }, [setEdges, addCanvasConnection])

  const acceptSuggestion = (sug) => {
    addCanvasConnection({
      id: sug.id.replace('sug-', 'conn-'),
      from: sug.from,
      to: sug.to,
      label: sug.label,
      type: sug.type,
    })
  }

  const exportMarkdown = () => {
    if (!investigation) return
    const blueprint = buildReportBlueprint(investigation, { templateId: 'general' })
    const md = blueprintToMarkdown(blueprint)
    downloadMarkdownBrief(`${investigation.title}.md`, md)
  }

  if (!investigation) {
    return (
      <div className="canvas-empty">
        <p>Open a workspace to build an investigation canvas.</p>
      </div>
    )
  }

  return (
    <div className="investigation-canvas">
      <header className="canvas-toolbar">
        <div>
          <h2 className="canvas-toolbar__title">{investigation.title}</h2>
          <p className="canvas-toolbar__meta">
            {investigation.evidence.length} evidence
            {' · '}
            {investigation.connections.length} links
            {' · '}
            rev {investigation.audit.revision}
          </p>
        </div>
        <div className="canvas-toolbar__actions">
          <button type="button" className="canvas-toolbar__btn" onClick={exportMarkdown}>
            Export MD
          </button>
        </div>
      </header>

      {investigation.evidence.length === 0 ? (
        <div className="canvas-empty canvas-empty--inline">
          <p>Add signals from the timeline or inspector.</p>
          <p className="canvas-empty__hint">Each pin becomes a node you can connect and export.</p>
        </div>
      ) : (
        <div className="canvas-flow-wrap">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            fitView
            minZoom={0.3}
            maxZoom={1.8}
            proOptions={{ hideAttribution: true }}
            className="atlas-react-flow"
          >
            <Background color="rgba(255,255,255,0.04)" gap={20} />
            <Controls showInteractive={false} className="canvas-controls" />
            <MiniMap
              nodeColor={() => SIGNAL_COLOR}
              maskColor="rgba(3,7,18,0.85)"
              className="canvas-minimap"
            />
          </ReactFlow>
        </div>
      )}

      {suggestions.length > 0 && (
        <section className="canvas-suggestions">
          <h3>Suggested links</h3>
          <ul>
            {suggestions.map((sug) => (
              <li key={sug.id}>
                <span className="canvas-sug__reason">{sug.reason}</span>
                <span className="canvas-sug__label">{sug.label}</span>
                <button type="button" className="canvas-sug__accept" onClick={() => acceptSuggestion(sug)}>
                  Accept
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {investigation.evidence.length > 0 && (
        <section className="canvas-evidence-list">
          <h3>Evidence ledger</h3>
          <ul>
            {investigation.evidence.map((ev) => (
              <li key={ev.id}>
                <span className="canvas-ev__dim" style={{ backgroundColor: '#1a90ff' }} />
                <span className="canvas-ev__title">{ev.title}</span>
                <button type="button" className="canvas-ev__remove" onClick={() => removeEvidenceFromCanvas(ev.id)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
