import { memo, useCallback, type ChangeEvent } from 'react'
import { Filter } from 'lucide-react'

type InputPreprocessorTransformType = 'jmespath' | 'jsonata' | 'template' | 'script'

interface InputPreprocessorConfigPanelProps {
  config: Record<string, unknown>
  onApply: (patch: Record<string, unknown>) => void
}

interface InputPreprocessorConfig {
  transformType: InputPreprocessorTransformType
  expression: string
  outputFormat: string
}

const TRANSFORM_TYPE_OPTIONS: { value: InputPreprocessorTransformType; label: string }[] = [
  { value: 'jmespath', label: 'JMESPath' },
  { value: 'jsonata', label: 'JSONata' },
  { value: 'template', label: '模板' },
  { value: 'script', label: '脚本' },
]

function parseInputPreprocessorConfig(config: Record<string, unknown>): InputPreprocessorConfig {
  const transformType = config.transformType
  return {
    transformType:
      transformType === 'jmespath' ||
      transformType === 'jsonata' ||
      transformType === 'template' ||
      transformType === 'script'
        ? transformType
        : 'jmespath',
    expression: typeof config.expression === 'string' ? config.expression : '',
    outputFormat: typeof config.outputFormat === 'string' ? config.outputFormat : '',
  }
}

export const InputPreprocessorConfigPanel = memo(
  function InputPreprocessorConfigPanel({
    config,
    onApply,
  }: InputPreprocessorConfigPanelProps) {
    const parsed = parseInputPreprocessorConfig(config)

    const applyField = useCallback(
      (field: keyof InputPreprocessorConfig, value: string) => {
        const next = { ...parseInputPreprocessorConfig(config), [field]: value }
        onApply({ config: next })
      },
      [config, onApply],
    )

    const handleTransformType = useCallback(
      (e: ChangeEvent<HTMLSelectElement>) => {
        applyField('transformType', e.target.value)
      },
      [applyField],
    )

    const handleExpression = useCallback(
      (e: ChangeEvent<HTMLTextAreaElement>) => {
        applyField('expression', e.target.value)
      },
      [applyField],
    )

    const handleOutputFormat = useCallback(
      (e: ChangeEvent<HTMLInputElement>) => {
        applyField('outputFormat', e.target.value)
      },
      [applyField],
    )

    const selectedOption = TRANSFORM_TYPE_OPTIONS.find((o) => o.value === parsed.transformType)

    return (
      <div className="space-y-4 px-4 py-4">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-type-tool" />
          <span className="rounded-full bg-type-tool/10 px-2 py-0.5 text-xs font-medium text-type-tool">
            输入预处理器
          </span>
        </div>

        <div>
          <label
            htmlFor="preprocessor-transform-type"
            className="mb-2 block text-xs font-medium text-foreground"
          >
            转换类型
          </label>
          <select
            id="preprocessor-transform-type"
            value={parsed.transformType}
            onChange={handleTransformType}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            {TRANSFORM_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="preprocessor-expression"
            className="mb-2 block text-xs font-medium text-foreground"
          >
            转换表达式
          </label>
          <textarea
            id="preprocessor-expression"
            value={parsed.expression}
            onChange={handleExpression}
            rows={6}
            placeholder={
              parsed.transformType === 'jmespath'
                ? '例：data.items[?status==`active`]'
                : parsed.transformType === 'jsonata'
                  ? '例：$.items.{ "id": id, "name": name }'
                  : parsed.transformType === 'template'
                    ? '例：Hello, {{name}}!'
                    : '例：return input.trim().toUpperCase()'
            }
            className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm"
          />
        </div>

        <div>
          <label
            htmlFor="preprocessor-output-format"
            className="mb-2 block text-xs font-medium text-foreground"
          >
            输出格式（可选）
          </label>
          <input
            id="preprocessor-output-format"
            type="text"
            value={parsed.outputFormat}
            onChange={handleOutputFormat}
            placeholder="例：json / text / csv"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            描述转换结果的格式，供下游节点参考
          </p>
        </div>

        <div className="space-y-2 rounded-lg border border-border bg-card p-3 text-xs">
          <p className="font-medium text-foreground">当前配置</p>
          <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
            <span>{selectedOption?.label ?? parsed.transformType}</span>
            {parsed.outputFormat && (
              <>
                <span>&middot;</span>
                <span>输出：{parsed.outputFormat}</span>
              </>
            )}
          </div>
          {parsed.expression && (
            <p className="break-all font-mono text-muted">
              {parsed.expression.length > 80
                ? `${parsed.expression.slice(0, 80)}…`
                : parsed.expression}
            </p>
          )}
        </div>
      </div>
    )
  },
)
