import { memo, useMemo, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { motion } from 'motion/react'
import { ListTree } from 'lucide-react'

import { Card } from '@/shared/ui/card'
import { EmptyState } from '@/shared/components/empty-state/EmptyState'
import { fadeInUp } from '@/shared/lib/motion'

import type { TimelineData } from '../../hooks/useTimelineData'
import { TimelineEntry } from './TimelineEntry'

interface TimelineGroup {
  stepOrder: number
  items: TimelineData[]
}

function groupByStepOrder(data: TimelineData[]): TimelineGroup[] {
  const groups = new Map<number, TimelineData[]>()
  const sorted = [...data].sort(
    (a, b) => (a.step.stepOrder ?? 0) - (b.step.stepOrder ?? 0),
  )

  for (const item of sorted) {
    const stepOrder = item.step.stepOrder ?? 0
    const bucket = groups.get(stepOrder)
    if (bucket) {
      bucket.push(item)
      continue
    }
    groups.set(stepOrder, [item])
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => a - b)
    .map(([stepOrder, items]) => ({ stepOrder, items }))
}

const VIRTUAL_SCROLL_THRESHOLD = 50

interface ExecutionTimelineVerticalProps {
  timelineData: TimelineData[]
  selectedNodeId: string | null
  onSelectNode: (nodeId: string) => void
  executionId?: string
  executionStartedAt: string | null
  executionCompletedAt: string | null
}

export const ExecutionTimelineVertical = memo(
  function ExecutionTimelineVertical({
    timelineData,
    selectedNodeId,
    onSelectNode,
    executionId,
    executionStartedAt,
    executionCompletedAt,
  }: ExecutionTimelineVerticalProps) {
    const groups = useMemo(
      () => groupByStepOrder(timelineData),
      [timelineData],
    )

    const useVirtual = timelineData.length > VIRTUAL_SCROLL_THRESHOLD
    const parentRef = useRef<HTMLDivElement>(null)
    /** 首次渲染时已有的分组视为历史，不播放入场；执行中新追加的分组淡入（无延迟） */
    const historyGroupsRef = useRef<Set<number> | null>(null)
    if (historyGroupsRef.current === null) {
      historyGroupsRef.current = new Set(groups.map((group) => group.stepOrder))
    }
    const historyGroups = historyGroupsRef.current

    const virtualizer = useVirtualizer({
      count: groups.length,
      getScrollElement: () => parentRef.current,
      estimateSize: () => 100,
      overscan: 5,
      enabled: useVirtual,
    })

    const renderGroup = (group: TimelineGroup) => (
      <div
        key={group.stepOrder}
        className={
          group.items.length > 1
            ? 'grid grid-cols-1 items-start gap-3 xl:auto-cols-[minmax(0,1fr)] xl:grid-flow-col xl:grid-cols-none'
            : undefined
        }
        data-testid={`timeline-group-${group.stepOrder}`}
      >
        {group.items.map((data) => (
          <TimelineEntry
            key={data.step.id}
            data={data}
            isSelected={data.step.nodeId === selectedNodeId}
            onSelect={() => onSelectNode(data.step.nodeId)}
            executionId={executionId}
            executionStartedAt={executionStartedAt}
            executionCompletedAt={executionCompletedAt}
          />
        ))}
      </div>
    )

    return (
      <Card
        className="flex h-full min-h-[320px] flex-col overflow-hidden"
        data-testid="execution-timeline-vertical"
      >
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">执行时间线</h2>
          <p className="text-xs text-muted-foreground">
            节点执行顺序、决策详情与证据链
          </p>
        </div>

        <div
          ref={parentRef}
          className="flex-1 overflow-y-auto px-4 py-4"
        >
          {groups.length === 0 ? (
            <div className="flex h-full min-h-[220px] items-center justify-center" data-testid="timeline-empty">
              <EmptyState
                className="border-0 px-0 py-0"
                icon={ListTree}
                title="暂无执行步骤"
                description="工作流开始运行后，节点执行顺序会按时间线逐条呈现。"
              />
            </div>
          ) : useVirtual ? (
            <div
              style={{
                height: `${virtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
              }}
            >
              {virtualizer.getVirtualItems().map((virtualRow) => (
                <div
                  key={virtualRow.key}
                  ref={virtualizer.measureElement}
                  data-index={virtualRow.index}
                  className="pb-3"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  {renderGroup(groups[virtualRow.index]!)}
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {groups.map((group) => (
                <motion.div
                  key={group.stepOrder}
                  initial={historyGroups.has(group.stepOrder) ? false : fadeInUp.initial}
                  animate={fadeInUp.animate}
                  transition={fadeInUp.transition}
                >
                  {renderGroup(group)}
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </Card>
    )
  },
)
