import { motion } from 'motion/react'
import { FileSearch, Loader2 } from 'lucide-react'
import { EmptyState } from '@/shared/components/empty-state/EmptyState'
import { staggerList } from '@/shared/lib/motion'
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
        <p className="text-sm text-muted-foreground">
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
            aria-label="Top K"
          />
          <Button onClick={onRunTest} disabled={isPending}>
            {isPending ? <Loader2 className="animate-spin" /> : <FileSearch />}
            执行测试检索
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {results?.length ? (
          results.map((result, index) => (
            <motion.div
              key={result.nodeId}
              {...staggerList(index)}
              className="rounded-lg border border-border bg-muted p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <p
                  className="min-w-0 flex-1 truncate text-sm font-medium text-foreground"
                  title={result.fileName ?? result.documentId}
                >
                  {result.fileName ?? result.documentId}
                </p>
                <Badge size="sm" className="shrink-0 whitespace-nowrap tabular-nums">
                  score {result.score.toFixed(3)}
                </Badge>
              </div>
              <p className="mt-2 line-clamp-6 break-words text-sm text-foreground/90">
                {result.content}
              </p>
              <p className="mt-2 break-all text-xs text-muted-foreground">
                {renderLocation(result)}
              </p>
            </motion.div>
          ))
        ) : (
          <EmptyState
            icon={FileSearch}
            tone="var(--color-type-knowledge)"
            className="py-8"
            title={isPending ? '正在执行测试检索…' : '这里会展示测试检索结果。'}
          />
        )}
      </div>
    </Card>
  )
}
