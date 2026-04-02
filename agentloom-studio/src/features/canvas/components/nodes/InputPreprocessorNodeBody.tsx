import { memo } from 'react'
import { Filter } from 'lucide-react'

const TRANSFORM_TYPE_LABELS: Record<string, string> = {
  jmespath: 'JMESPath',
  jsonata: 'JSONata',
  template: '模板',
  script: '脚本',
}

export const InputPreprocessorNodeBody = memo(function InputPreprocessorNodeBody({
  config,
}: {
  config: Record<string, unknown>
}) {
  const transformType =
    typeof config.transformType === 'string'
      ? config.transformType
      : typeof config.transform_type === 'string'
        ? config.transform_type
        : 'jmespath'
  const expression =
    typeof config.expression === 'string'
      ? config.expression
      : typeof config.template === 'string'
        ? config.template
        : ''
  const outputFormat =
    typeof config.outputFormat === 'string' && config.outputFormat.length > 0
      ? config.outputFormat
      : typeof config.output_format === 'string' &&
          config.output_format.length > 0
        ? config.output_format
      : ''
  const label = TRANSFORM_TYPE_LABELS[transformType] ?? transformType

  return (
    <div className="flex flex-col gap-1" data-testid="input-preprocessor-node-body">
      <div className="flex items-center gap-1.5">
        <Filter className="h-3.5 w-3.5 shrink-0 text-type-tool" />
        <span className="rounded bg-type-tool/15 px-1.5 py-0.5 text-[10px] font-medium text-type-tool">
          {label}
        </span>
        {outputFormat && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {outputFormat}
          </span>
        )}
      </div>
      {expression ? (
        <p className="truncate font-mono text-[10px] text-muted-foreground">
          {expression.length > 60 ? `${expression.slice(0, 60)}…` : expression}
        </p>
      ) : (
        <p className="text-[10px] text-muted-foreground/60">未配置表达式</p>
      )}
    </div>
  )
})
