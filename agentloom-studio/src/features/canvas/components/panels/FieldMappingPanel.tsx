import { memo, useCallback, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import type {
  CandidateFieldMapping,
  CanvasEdge,
  CanvasNode,
  FieldMapping,
  PortDefinition,
  TypeSchema,
} from '../../types'

interface FlatField {
  path: string
  label: string
  dataType: string
  required: boolean
}

export interface FieldMappingPanelProps {
  open: boolean
  edgeId: string | null
  edge: CanvasEdge | null
  sourceNode: CanvasNode | null
  targetNode: CanvasNode | null
  onClose: () => void
  onChange: (edgeId: string, mappings: FieldMapping[]) => void
}

function flattenSchema(prefix: string, schema: TypeSchema, required = false): FlatField[] {
  if (schema.kind === 'json' && schema.shape === 'object') {
    const requiredProps = schema.required ?? []
    return Object.entries(schema.properties).flatMap(([propName, propSchema]) =>
      flattenSchema(
        `${prefix}.${propName}`,
        propSchema,
        requiredProps.includes(propName),
      )
    )
  }

  const fallbackLabel = prefix.split('.').at(-1) ?? prefix

  return [
    {
      path: prefix,
      label: schema.title ?? fallbackLabel,
      dataType: schema.kind,
      required,
    },
  ]
}

function flattenPortFields(ports: PortDefinition[]): FlatField[] {
  const fields: FlatField[] = []
  for (const port of ports) {
    if (port.schema.kind === 'json' && port.schema.shape === 'object') {
      fields.push(...flattenSchema(port.id, port.schema))
    } else {
      fields.push({
        path: port.id,
        label: port.label,
        dataType: port.dataType,
        required: port.required,
      })
    }
  }
  return fields
}

export const FieldMappingPanel = memo(function FieldMappingPanel({
  open,
  edgeId,
  edge,
  sourceNode,
  targetNode,
  onClose,
  onChange,
}: FieldMappingPanelProps) {
  const [selectedSource, setSelectedSource] = useState<string | null>(null)
  const [dragSource, setDragSource] = useState<string | null>(null)

  const edgeData = edge?.data
  const isReadonly = edgeData?.visualLevel === 'L0'
  const mappings = useMemo(() => edgeData?.fieldMapping ?? [], [edgeData?.fieldMapping])
  const candidates = useMemo<CandidateFieldMapping[]>(
    () => edgeData?.candidateMappings ?? [],
    [edgeData?.candidateMappings]
  )

  const sourceFields = useMemo(
    () => (sourceNode ? flattenPortFields(sourceNode.data.outputPorts) : []),
    [sourceNode]
  )

  const targetFields = useMemo(
    () => (targetNode ? flattenPortFields(targetNode.data.inputPorts) : []),
    [targetNode]
  )

  const mappedTargets = useMemo(
    () => new Set(mappings.map((m) => m.targetField)),
    [mappings]
  )

  const mappedSources = useMemo(
    () => new Set(mappings.map((m) => m.sourceField)),
    [mappings]
  )

  const visibleCandidates = useMemo(
    () => candidates.filter((candidate) => !mappedTargets.has(candidate.targetPath)),
    [candidates, mappedTargets]
  )

  const targetToSource = useMemo(() => {
    const map = new Map<string, string>()
    for (const m of mappings) {
      map.set(m.targetField, m.sourceField)
    }
    return map
  }, [mappings])

  const requiredUnmappedCount = useMemo(
    () => targetFields.filter((f) => f.required && !mappedTargets.has(f.path)).length,
    [targetFields, mappedTargets]
  )

  const suggestedTargetFields = useMemo(
    () =>
      new Set(
        visibleCandidates
          .filter((candidate) => candidate.autoRecommended)
          .map((candidate) => candidate.targetPath)
      ),
    [visibleCandidates]
  )

  const suggestedSourceFields = useMemo(
    () =>
      new Set(
        visibleCandidates
          .filter((candidate) => candidate.autoRecommended)
          .map((candidate) => candidate.sourcePath)
      ),
    [visibleCandidates]
  )

  const createMapping = useCallback(
    (sourceField: string, targetField: string) => {
      if (!edgeId) return
      const existing = mappings.filter((m) => m.targetField !== targetField)
      const newMapping: FieldMapping = {
        sourceField,
        targetField,
        compatLevel: 'L1',
        autoRecommended: false,
      }
      onChange(edgeId, [...existing, newMapping])
    },
    [edgeId, mappings, onChange]
  )

  const handleSourceClick = useCallback(
    (path: string) => {
      if (isReadonly) return
      setSelectedSource((prev) => (prev === path ? null : path))
    },
    [isReadonly]
  )

  const handleTargetClick = useCallback(
    (path: string) => {
      if (isReadonly || !selectedSource) return
      createMapping(selectedSource, path)
      setSelectedSource(null)
    },
    [isReadonly, selectedSource, createMapping]
  )

  const handleDragStart = useCallback(
    (e: React.DragEvent, path: string) => {
      if (isReadonly) return
      e.dataTransfer.setData('text/plain', path)
      e.dataTransfer.effectAllowed = 'link'
      setDragSource(path)
    },
    [isReadonly]
  )

  const handleDragEnd = useCallback(() => {
    setDragSource(null)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'link'
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent, targetPath: string) => {
      e.preventDefault()
      const sourcePath = e.dataTransfer.getData('text/plain')
      if (sourcePath) {
        createMapping(sourcePath, targetPath)
      }
      setDragSource(null)
    },
    [createMapping]
  )

  const handleRemoveMapping = useCallback(
    (targetField: string) => {
      if (isReadonly || !edgeId) return
      onChange(
        edgeId,
        mappings.filter((m) => m.targetField !== targetField)
      )
    },
    [isReadonly, edgeId, mappings, onChange]
  )

  const acceptCandidate = useCallback(
    (candidate: CandidateFieldMapping) => {
      if (isReadonly || !edgeId) return
      const existing = mappings.filter((m) => m.targetField !== candidate.targetPath)
      const newMapping: FieldMapping = {
        sourceField: candidate.sourcePath,
        targetField: candidate.targetPath,
        compatLevel: 'L1',
        autoRecommended: true,
        confidence: candidate.confidence,
      }
      onChange(edgeId, [...existing, newMapping])
    },
    [isReadonly, edgeId, mappings, onChange]
  )

  const acceptAllCandidates = useCallback(() => {
    if (isReadonly || !edgeId || candidates.length === 0) return
    const manualMappedTargets = new Set(mappings.map((m) => m.targetField))
    const newMappings = candidates
      .filter((c) => !manualMappedTargets.has(c.targetPath))
      .map(
        (c): FieldMapping => ({
          sourceField: c.sourcePath,
          targetField: c.targetPath,
          compatLevel: 'L1',
          autoRecommended: true,
          confidence: c.confidence,
        })
      )
    onChange(edgeId, [...mappings, ...newMappings])
  }, [isReadonly, edgeId, candidates, mappings, onChange])

  return (
    <aside
      className={`mapping-panel${open ? ' mapping-panel--open' : ''}`}
      data-testid="field-mapping-panel"
      aria-label="字段映射面板"
      aria-hidden={!open}
    >
      <div className="mapping-panel__header">
        <h3 className="mapping-panel__title">字段映射</h3>
        <button
          type="button"
          className="mapping-panel__close"
          data-testid="mapping-panel-close"
          aria-label="关闭映射面板"
          onClick={onClose}
        >
          <X size={16} />
        </button>
      </div>

      <div className="mapping-panel__summary" data-testid="mapping-required-summary">
        {isReadonly ? (
          <span>完全匹配，无需映射</span>
        ) : requiredUnmappedCount > 0 ? (
          <span className="mapping-panel__summary-item--warning">
            {requiredUnmappedCount} 个必填字段未映射
          </span>
        ) : (
          <span>所有必填字段已映射</span>
        )}
      </div>

      {!isReadonly && visibleCandidates.length > 0 && (
        <div className="mapping-panel__candidates" data-testid="mapping-candidates-section">
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-xs text-muted">
              {visibleCandidates.length} 个推荐映射
            </span>
            <button
              type="button"
              className="text-xs text-primary hover:underline"
              data-testid="accept-all-candidates"
              onClick={acceptAllCandidates}
            >
              全部接受
            </button>
          </div>
          {visibleCandidates.map((c) => (
              <div
                key={`candidate-${c.targetPath}`}
                className="mapping-line mapping-line--auto"
                data-testid={`candidate-${c.targetPath}`}
              >
                <span className="truncate">{c.sourcePath}</span>
                <span className="shrink-0 text-muted">→</span>
                <span className="truncate">{c.targetPath}</span>
                <button
                  type="button"
                  className="shrink-0 rounded px-1.5 py-0.5 text-xs text-primary hover:bg-primary/10"
                  data-testid={`accept-candidate-${c.targetPath}`}
                  onClick={() => acceptCandidate(c)}
                >
                  接受
                </button>
              </div>
            ))}
        </div>
      )}

      {!isReadonly && (
        <div className="mapping-panel__body">
          <div className="flex gap-2">
            <div className="flex-1 min-w-0">
              <div
                className="mapping-panel__section-title"
                data-testid="mapping-source-summary"
              >
                源: {sourceNode?.data.label ?? '—'} ({sourceFields.length})
              </div>
              {sourceFields.map((field) => (
                <button
                  key={field.path}
                  type="button"
                  className={[
                    'mapping-field',
                     selectedSource === field.path ? 'mapping-field--selected' : '',
                     mappedSources.has(field.path) ? 'mapping-field--mapped' : '',
                     suggestedSourceFields.has(field.path) ? 'mapping-field--suggested' : '',
                     field.required ? 'mapping-field--required' : '',
                     dragSource === field.path ? 'mapping-field--selected' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  data-testid={`mapping-field-${field.path}`}
                  draggable={!isReadonly}
                  onClick={() => handleSourceClick(field.path)}
                  onDragStart={(e) => handleDragStart(e, field.path)}
                  onDragEnd={handleDragEnd}
                  aria-pressed={selectedSource === field.path}
                >
                  <span className="truncate">{field.label}</span>
                  <span className="mapping-field__type">{field.dataType}</span>
                </button>
              ))}
            </div>

            <div className="flex-1 min-w-0">
              <div
                className="mapping-panel__section-title"
                data-testid="mapping-target-summary"
              >
                目标: {targetNode?.data.label ?? '—'} ({targetFields.length})
              </div>
              {targetFields.map((field) => {
                const sourceForThis = targetToSource.get(field.path)
                return (
                  <div key={field.path} className="flex items-center gap-1">
                    <button
                      type="button"
                      className={[
                         'mapping-field',
                         'flex-1',
                         mappedTargets.has(field.path) ? 'mapping-field--mapped' : '',
                         suggestedTargetFields.has(field.path)
                           ? 'mapping-field--suggested'
                           : '',
                         field.required ? 'mapping-field--required' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      data-testid={`mapping-field-${field.path}`}
                      onClick={() => handleTargetClick(field.path)}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, field.path)}
                      disabled={!selectedSource && !dragSource}
                      title={sourceForThis ? `← ${sourceForThis}` : undefined}
                    >
                      <span className="truncate">{field.label}</span>
                      <span className="mapping-field__type">{field.dataType}</span>
                    </button>
                    {sourceForThis && (
                      <button
                        type="button"
                        className="shrink-0 rounded p-0.5 text-muted hover:text-error"
                        aria-label={`删除 ${field.label} 映射`}
                        onClick={() => handleRemoveMapping(field.path)}
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {mappings.length > 0 && (
            <div className="mt-3 space-y-1">
              {mappings.map((m) => (
                <div
                  key={`${m.sourceField}->${m.targetField}`}
                  className={`mapping-line${m.autoRecommended ? ' mapping-line--auto' : ''}`}
                >
                  <span className="truncate">{m.sourceField}</span>
                  <span className="shrink-0 text-muted">→</span>
                  <span className="truncate">{m.targetField}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </aside>
  )
})
