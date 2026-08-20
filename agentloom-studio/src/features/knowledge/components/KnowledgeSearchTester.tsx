import { FileSearch, Loader2 } from 'lucide-react'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'
import { Input } from '@/shared/ui/input'
import { renderLocation } from '../lib/knowledgeBaseDetail'
import type { KnowledgeSearchResult } from '../types'

export interface KnowledgeSearchTesterProps {
  query: string
  topK: number
  isPending: boolean
  results: KnowledgeSearchResult[] | undefined
  onQueryChange: (query: string) => void
  onTopKChange: (topK: number) => void
  onRunTest: () => void
}

/** 用当前知识库的完整策略直接验证检索结果 */
export function KnowledgeSearchTester({
  query,
  topK,
  isPending,
  results,
  onQueryChange,
  onTopKChange,
  onRunTest,
}: KnowledgeSearchTesterProps) {
  return (
    <Card className="space-y-4 p-5">
      <div>
        <h2 className="text-base font-semibold text-foreground">测试检索</h2>
        <p className="text-sm text-muted">
          用当前知识库的完整策略直接验证检索结果。
        </p>
      </div>

      <div className="space-y-3">
        <Input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="输入你希望验证的查询问题"
        />
        <div className="flex flex-wrap items-center gap-3">
          <Input
            type="number"
            min={1}
            max={20}
            value={topK}
            onChange={(event) => onTopKChange(Number(event.target.value))}
            className="max-w-28"
          />
          <Button onClick={onRunTest} disabled={isPending}>
            {isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileSearch className="mr-2 h-4 w-4" />
            )}
            执行测试检索
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {results?.length ? (
          results.map((result) => (
            <div
              key={result.nodeId}
              className="rounded-card border border-border bg-surface-elevated p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                  {result.fileName ?? result.documentId}
                </p>
                <Badge size="sm" className="whitespace-nowrap">
                  score {result.score.toFixed(3)}
                </Badge>
              </div>
              <p className="mt-2 text-sm text-foreground/90">{result.content}</p>
              <p className="mt-2 text-xs text-muted">{renderLocation(result)}</p>
            </div>
          ))
        ) : (
          <div className="rounded-card border border-dashed border-border p-4 text-sm text-muted">
            {isPending ? '正在执行测试检索...' : '这里会展示测试检索结果。'}
          </div>
        )}
      </div>
    </Card>
  )
}
