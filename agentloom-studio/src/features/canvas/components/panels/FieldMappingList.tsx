import { ArrowRightLeft } from 'lucide-react'
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
            className={`mapping-line${m.autoRecommended ? ' mapping-line--auto' : ''}`}
          >
            <span className="truncate">{m.sourceField}</span>
            <span className="shrink-0 text-muted">→</span>
            <span className="truncate">{m.targetField}</span>

            {srcKind && tgtKind && srcKind !== tgtKind && (
              <>
                <span
                  className="mapping-line__coercion ml-auto inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-medium text-warning"
                  data-testid={`mapping-line-coercion-${m.targetField}`}
                >
                  <ArrowRightLeft size={12} />
                  <span>
                    {m.coercionConfig
                      ? getStrategyLabel(m.coercionConfig.strategy)
                      : '待配置转换'}
                  </span>
                </span>

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
