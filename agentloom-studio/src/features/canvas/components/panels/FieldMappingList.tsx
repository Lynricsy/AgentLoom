import { ArrowRightLeft } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { Badge } from '@/shared/ui/badge'
import { CoercionConfigPopover } from './CoercionConfigPopover'
import { getStrategyLabel } from '../../lib/coercionStrategies'
import type { FieldMapping, NestedFieldNode, TypeCoercionConfig } from '../../types'
import type { PortDataType } from '../../types/typeSchema'

export interface FieldMappingListProps {
  mappings: FieldMapping[]
  sourceLeafMap: Map<string, NestedFieldNode>
  targetLeafMap: Map<string, NestedFieldNode>
  onCoercionChange: (
    targetField: string,
    coercionConfig: TypeCoercionConfig | undefined,
  ) => void
}

/** 已落地的映射清单；源 / 目标 kind 不一致时挂类型转换配置入口 */
export function FieldMappingList({
  mappings,
  sourceLeafMap,
  targetLeafMap,
  onCoercionChange,
}: FieldMappingListProps) {
  return (
    <div className="mt-3 space-y-1">
      {mappings.map((m) => {
        const srcNode = sourceLeafMap.get(m.sourceField)
        const tgtNode = targetLeafMap.get(m.targetField)
        const srcKind = srcNode?.schema.kind as PortDataType | undefined
        const tgtKind = tgtNode?.schema.kind as PortDataType | undefined
        return (
          <div
            key={`${m.sourceField}->${m.targetField}`}
            className={cn(
              'flex min-w-0 items-center gap-2 rounded-md border border-border bg-surface px-2 py-1.5 font-mono text-xs text-foreground',
              m.autoRecommended && 'border-dashed',
            )}
          >
            <span className="min-w-0 truncate" title={m.sourceField}>
              {m.sourceField}
            </span>
            <span className="shrink-0 text-muted-foreground">→</span>
            <span className="min-w-0 truncate" title={m.targetField}>
              {m.targetField}
            </span>

            {srcKind && tgtKind && srcKind !== tgtKind && (
              <>
                <Badge
                  variant="warning"
                  size="sm"
                  className="ml-auto shrink-0 font-sans"
                  data-testid={`mapping-line-coercion-${m.targetField}`}
                >
                  <ArrowRightLeft className="size-3 shrink-0" />
                  <span className="truncate">
                    {m.coercionConfig
                      ? getStrategyLabel(m.coercionConfig.strategy)
                      : '待配置转换'}
                  </span>
                </Badge>

                <CoercionConfigPopover
                  sourceType={srcKind}
                  targetType={tgtKind}
                  value={m.coercionConfig}
                  onChange={(config) => onCoercionChange(m.targetField, config)}
                />
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
