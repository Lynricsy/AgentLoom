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
    <div className="space-y-1 px-3" data-testid="mapping-candidates-section">
      <div className="flex items-center justify-between gap-2 py-1">
        <span className="text-xs text-muted-foreground">{candidates.length} 个推荐映射</span>
        <Button
          variant="link"
          size="xs"
          className="px-0"
          data-testid="accept-all-candidates"
          onClick={onAcceptAll}
        >
          全部接受
        </Button>
      </div>
      {candidates.map((c) => (
        <div
          key={`candidate-${c.targetPath}`}
          className="flex min-w-0 items-center gap-2 rounded-md border border-dashed border-border bg-surface px-2 py-1 font-mono text-xs text-foreground"
          data-testid={`candidate-${c.targetPath}`}
        >
          <span className="min-w-0 truncate" title={c.sourcePath}>
            {c.sourcePath}
          </span>
          <span className="shrink-0 text-muted-foreground">→</span>
          <span className="min-w-0 truncate" title={c.targetPath}>
            {c.targetPath}
          </span>
          <Button
            variant="ghost"
            size="xs"
            className="ml-auto shrink-0 font-sans text-primary hover:bg-primary/10 hover:text-primary"
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
