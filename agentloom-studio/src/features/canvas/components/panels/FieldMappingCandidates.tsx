import type { CandidateFieldMapping } from '../../types'

export interface FieldMappingCandidatesProps {
  candidates: CandidateFieldMapping[]
  onAccept: (candidate: CandidateFieldMapping) => void
  onAcceptAll: () => void
}

/** 来自 type-engine 的 canonical 候选映射（`edge.data.candidateMappings`） */
export function FieldMappingCandidates({
  candidates,
  onAccept,
  onAcceptAll,
}: FieldMappingCandidatesProps) {
  return (
    <div className="mapping-panel__candidates" data-testid="mapping-candidates-section">
      <div className="flex items-center justify-between px-2 py-1">
        <span className="text-xs text-muted">{candidates.length} 个推荐映射</span>
        <button
          type="button"
          className="text-xs text-primary hover:underline"
          data-testid="accept-all-candidates"
          onClick={onAcceptAll}
        >
          全部接受
        </button>
      </div>
      {candidates.map((c) => (
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
            onClick={() => onAccept(c)}
          >
            接受
          </button>
        </div>
      ))}
    </div>
  )
}
