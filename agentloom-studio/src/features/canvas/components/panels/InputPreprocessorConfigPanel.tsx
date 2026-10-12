import { memo, type ChangeEvent } from 'react'
import { Filter } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select'
import { Input } from '@/shared/ui/input'
import { Textarea } from '@/shared/ui/textarea'
import { FormField } from '@/shared/components/form-field/FormField'
import { Badge } from '@/shared/ui/badge'
import { Card } from '@/shared/ui/card'

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
  const transformType =
    typeof config.transformType === 'string'
      ? config.transformType
      : config.transform_type
  return {
    transformType:
      transformType === 'jmespath' ||
      transformType === 'jsonata' ||
      transformType === 'template' ||
      transformType === 'script'
        ? transformType
        : 'jmespath',
    expression:
      typeof config.expression === 'string'
        ? config.expression
        : typeof config.template === 'string'
          ? config.template
          : '',
    outputFormat:
      typeof config.outputFormat === 'string'
        ? config.outputFormat
        : typeof config.output_format === 'string'
          ? config.output_format
          : '',
  }
}

export const InputPreprocessorConfigPanel = memo(function InputPreprocessorConfigPanel({
  config,
  onApply,
}: InputPreprocessorConfigPanelProps) {
  const parsed = parseInputPreprocessorConfig(config)

  function applyPatch(patch: Partial<InputPreprocessorConfig>) {
    const next = { ...parseInputPreprocessorConfig(config), ...patch }
    onApply({ config: next })
  }

  const handleTransformType = (value: string) => {
    applyPatch({ transformType: value as InputPreprocessorTransformType })
  }

  const handleExpression = (e: ChangeEvent<HTMLTextAreaElement>) => {
    applyPatch({ expression: e.target.value })
  }

  const handleOutputFormat = (e: ChangeEvent<HTMLInputElement>) => {
    applyPatch({ outputFormat: e.target.value })
  }

  const selectedOption = TRANSFORM_TYPE_OPTIONS.find((o) => o.value === parsed.transformType)

  return (
    <div className="space-y-4 px-4 py-4">
      <div className="flex items-center gap-2">
        <Filter className="size-4 shrink-0 text-type-tool" />
        <Badge tone="var(--color-type-tool)">输入预处理器</Badge>
      </div>

      <FormField label="转换类型" htmlFor="preprocessor-transform-type">
        <Select value={parsed.transformType} onValueChange={handleTransformType}>
          <SelectTrigger id="preprocessor-transform-type" aria-label="转换类型">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TRANSFORM_TYPE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      <FormField label="转换表达式" htmlFor="preprocessor-expression">
        <Textarea
          id="preprocessor-expression"
          value={parsed.expression}
          onChange={handleExpression}
          rows={6}
          // 服务端以端口 ID 为键组装 input（如 { "text-in": ..., "json-in": ... }），
          // 脚本由 vm.Script 求值、结果取最后一个表达式的值，顶层 return 是语法错误。
          placeholder={
            parsed.transformType === 'jmespath'
              ? '例："json-in".items[?status==`active`]'
              : parsed.transformType === 'jsonata'
                ? '例：`json-in`.items.{ "id": id, "name": name }'
                : parsed.transformType === 'template'
                  ? '例：Hello, {{json-in.name}}!'
                  : "例：input['text-in'].trim().toUpperCase()"
          }
          className="font-mono"
        />
      </FormField>

      <FormField
        label="输出格式（可选）"
        htmlFor="preprocessor-output-format"
        hint="描述转换结果的格式，供下游节点参考。"
      >
        <Input
          id="preprocessor-output-format"
          type="text"
          value={parsed.outputFormat}
          onChange={handleOutputFormat}
          placeholder="例：json / text / csv"
        />
      </FormField>

      <Card className="space-y-2 p-3 text-xs">
        <p className="font-medium text-foreground">当前配置</p>
        <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
          <span>{selectedOption?.label ?? parsed.transformType}</span>
          {parsed.outputFormat && (
            <>
              <span>&middot;</span>
              <span className="min-w-0 break-all">输出：{parsed.outputFormat}</span>
            </>
          )}
        </div>
        {parsed.expression && (
          <p className="break-all font-mono text-muted-foreground">
            {parsed.expression.length > 80
              ? `${parsed.expression.slice(0, 80)}…`
              : parsed.expression}
          </p>
        )}
      </Card>
    </div>
  )
})
