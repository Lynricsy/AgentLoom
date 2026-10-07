import { Button } from '@/shared/ui/button'
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
        <span className="text-xs text-muted-foreground">{candidates.length} 个推荐映射</span>
        <Button
          variant="link"
          size="xs"
          className="h-auto p-0"
          data-testid="accept-all-candidates"
          onClick={onAcceptAll}
        >
          全部接受
        </Button>
      </div>
      {candidates.map((c) => (
        <div
          key={`candidate-${c.targetPath}`}
          className="mapping-line mapping-line--auto"
          data-testid={`candidate-${c.targetPath}`}
        >
          <span className="truncate">{c.sourcePath}</span>
          <span className="shrink-0 text-muted-foreground">→</span>
          <span className="truncate">{c.targetPath}</span>
          <Button
            variant="ghost"
            size="xs"
            className="shrink-0 px-1.5 text-primary hover:bg-primary/10 hover:text-primary"
            data-testid={`accept-candidate-${c.targetPath}`}
            onClick={() => onAccept(c)}
          >
            接受
          </Button>
        </div>
      ))}
    </div>
  )
}
