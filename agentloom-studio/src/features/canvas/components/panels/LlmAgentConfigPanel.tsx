import { memo, Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuthToken } from '@/features/execution'
import {
  AUTONOMY_MODES,
  getAutonomyModeDescription,
  getAutonomyModeLabel,
  isAutonomyMode,
  isAutonomyModeWithinCap,
} from '@/features/organization-autonomy-policy/lib/autonomyModePolicy'
import { useOrganizationAutonomyPolicy } from '@/features/organization-autonomy-policy/hooks/useOrganizationAutonomyPolicy'
import { getOrganizationIdFromToken } from '@/features/organization-autonomy-policy/lib/organizationAutonomyPolicyPermissions'
import { useTheme } from '@/shared/hooks/use-theme'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Select } from '@/shared/ui/select'
import {
  DEFAULT_AUTONOMY_CONFIG,
  type AutonomyConfig,
  type AutonomyMode,
  type FallbackStrategy,
} from '../../autonomy.types'
import { useCanvasStore } from '../../stores/canvasStore'

const MonacoEditor = lazy(() => import('@monaco-editor/react'))

const FALLBACK_STRATEGIES = [
  'REQUIRE_CONFIRMATION',
  'USE_DEFAULT',
  'SKIP_FIELD',
  'ABORT_EXECUTION',
] as const

const AUTONOMY_MODE_NOTE_CLASS_NAMES: Record<AutonomyMode, string> = {
  MANUAL_CONFIRM: 'border-border/60 bg-muted/15 text-muted-foreground',
  RULE_BASED: 'border-primary/20 bg-primary/5 text-muted-foreground',
  LLM_SUGGEST: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
}

const FALLBACK_STRATEGY_META: Record<
  FallbackStrategy,
  {
    label: string
    description: string
  }
> = {
  REQUIRE_CONFIRMATION: {
    label: '需要人工确认',
    description: '保留待确认项，等待人工继续。',
  },
  USE_DEFAULT: {
    label: '使用默认值',
    description: '使用预设默认值补齐字段。',
  },
  SKIP_FIELD: {
    label: '跳过字段',
    description: '跳过当前字段，尽量继续执行。',
  },
  ABORT_EXECUTION: {
    label: '终止执行',
    description: '在关键字段缺失时直接停止当前执行。',
  },
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

function isFallbackStrategy(value: unknown): value is FallbackStrategy {
  return FALLBACK_STRATEGIES.includes(value as FallbackStrategy)
}

function parseAllowedInferenceFields(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/\r?\n|,/)
        .map((field) => field.trim())
        .filter((field) => field.length > 0),
    ),
  )
}

interface ParsedAutonomyConfigResult {
  config: AutonomyConfig
  rawMode: string | null
  hasLegacyMode: boolean
}

interface AutonomyModeMirrorSources {
  autonomyMode: unknown
  autonomyConfig: unknown
  settings: unknown
  config: unknown
}

function resolveAutonomyMode({
  autonomyMode,
  autonomyConfig,
  settings,
  config,
}: AutonomyModeMirrorSources): Pick<ParsedAutonomyConfigResult, 'rawMode' | 'hasLegacyMode'> & {
  mode: AutonomyMode
} {
  const normalizedAutonomyConfig = isRecord(autonomyConfig) ? autonomyConfig : {}
  const normalizedSettings = isRecord(settings) ? settings : {}
  const normalizedConfig = isRecord(config) ? config : {}
  const rawModeValue = [
    autonomyMode,
    normalizedAutonomyConfig.mode,
    normalizedSettings.autonomyMode,
    normalizedConfig.autonomyMode,
  ].find((value) => value !== undefined && value !== null)

  const rawMode =
    rawModeValue === undefined || rawModeValue === null
      ? null
      : typeof rawModeValue === 'string'
        ? rawModeValue
        : String(rawModeValue)
  const resolvedMode = isAutonomyMode(rawMode) ? rawMode : DEFAULT_AUTONOMY_CONFIG.mode

  return {
    mode: resolvedMode,
    rawMode,
    hasLegacyMode: rawMode !== null && !isAutonomyMode(rawMode),
  }
}

function parseAutonomyConfig({ autonomyConfig, ...modeSources }: AutonomyModeMirrorSources): ParsedAutonomyConfigResult {
  const normalizedAutonomyConfig = isRecord(autonomyConfig) ? autonomyConfig : {}
  const resolvedMode = resolveAutonomyMode({
    autonomyConfig: normalizedAutonomyConfig,
    ...modeSources,
  })

  return {
    config: {
      mode: resolvedMode.mode,
      allowedInferenceFields: Array.isArray(normalizedAutonomyConfig.allowedInferenceFields)
        ? normalizedAutonomyConfig.allowedInferenceFields
            .filter((field): field is string => typeof field === 'string')
            .map((field) => field.trim())
            .filter((field) => field.length > 0)
        : [...DEFAULT_AUTONOMY_CONFIG.allowedInferenceFields],
      confirmationThreshold:
        typeof normalizedAutonomyConfig.confirmationThreshold === 'number' &&
        Number.isFinite(normalizedAutonomyConfig.confirmationThreshold)
          ? normalizedAutonomyConfig.confirmationThreshold
          : DEFAULT_AUTONOMY_CONFIG.confirmationThreshold,
      fallbackStrategy: isFallbackStrategy(normalizedAutonomyConfig.fallbackStrategy)
        ? normalizedAutonomyConfig.fallbackStrategy
        : DEFAULT_AUTONOMY_CONFIG.fallbackStrategy,
    },
    rawMode: resolvedMode.rawMode,
    hasLegacyMode: resolvedMode.hasLegacyMode,
  }
}

function buildAutosavePatch({
  autonomyConfig,
  config,
  settings,
}: Pick<AutonomyModeMirrorSources, 'autonomyConfig' | 'config' | 'settings'>, values: LlmAgentFormValues) {
  const nextAutonomyConfig = buildAutonomyConfig(values)
  const nextAutonomyMode = nextAutonomyConfig.mode

  return {
    autonomyMode: nextAutonomyMode,
    autonomyConfig: {
      ...asRecord(autonomyConfig),
      ...nextAutonomyConfig,
      mode: nextAutonomyMode,
    },
    config: {
      ...asRecord(config),
      systemPrompt: values.systemPrompt ?? '',
      outputSchemaTitle: values.outputSchemaTitle ?? '',
      autonomyMode: nextAutonomyMode,
    },
    settings: {
      ...asRecord(settings),
      autonomyMode: nextAutonomyMode,
    },
  }
}

function formatThresholdInput(value: number): string {
  return Number.isInteger(value) ? value.toFixed(0) : value.toString()
}

const llmAgentSchema = z
  .object({
    systemPrompt: z.string().optional(),
    outputSchemaTitle: z.string().optional(),
    mode: z.enum(AUTONOMY_MODES),
    allowedInferenceFieldsText: z.string(),
    confirmationThresholdInput: z.string(),
    fallbackStrategy: z.enum(FALLBACK_STRATEGIES),
  })
  .superRefine((values, context) => {
    if (values.mode === 'LLM_SUGGEST') {
      const threshold = Number(values.confirmationThresholdInput)
      if (
        values.confirmationThresholdInput.trim().length === 0 ||
        !Number.isFinite(threshold) ||
        threshold < 0 ||
        threshold > 1
      ) {
        context.addIssue({
          code: 'custom',
          path: ['confirmationThresholdInput'],
          message: '确认阈值必须在 0 到 1 之间',
        })
      }
    }
  })

type LlmAgentFormValues = z.infer<typeof llmAgentSchema>

type HiddenAutonomyDraftValues = Pick<
  LlmAgentFormValues,
  'allowedInferenceFieldsText' | 'confirmationThresholdInput' | 'fallbackStrategy'
>

interface LlmAgentConfigPanelProps {
  config: Record<string, unknown>
  onApply: (patch: Record<string, unknown>) => void
  onValidationChange?: (hasErrors: boolean) => void
}

function extractHiddenDraftValues(values: LlmAgentFormValues): HiddenAutonomyDraftValues {
  return {
    allowedInferenceFieldsText: values.allowedInferenceFieldsText,
    confirmationThresholdInput: values.confirmationThresholdInput,
    fallbackStrategy: values.fallbackStrategy,
  }
}

function mergeHiddenDraftValues(
  values: LlmAgentFormValues,
  hiddenDrafts: HiddenAutonomyDraftValues,
): LlmAgentFormValues {
  if (values.mode === 'LLM_SUGGEST') {
    return values
  }

  if (values.mode === 'RULE_BASED') {
    return {
      ...values,
      confirmationThresholdInput: hiddenDrafts.confirmationThresholdInput,
    }
  }

  return {
    ...values,
    allowedInferenceFieldsText: hiddenDrafts.allowedInferenceFieldsText,
    confirmationThresholdInput: hiddenDrafts.confirmationThresholdInput,
    fallbackStrategy: hiddenDrafts.fallbackStrategy,
  }
}

function buildFormValues(
  config: Record<string, unknown>,
  autonomyConfig: AutonomyConfig,
): LlmAgentFormValues {
  return {
    systemPrompt: (config.systemPrompt as string) ?? '',
    outputSchemaTitle: (config.outputSchemaTitle as string) ?? '',
    mode: autonomyConfig.mode,
    allowedInferenceFieldsText: autonomyConfig.allowedInferenceFields.join('\n'),
    confirmationThresholdInput: formatThresholdInput(autonomyConfig.confirmationThreshold),
    fallbackStrategy: autonomyConfig.fallbackStrategy,
  }
}

function buildAutonomyConfig(values: LlmAgentFormValues): AutonomyConfig {
  if (values.mode === 'MANUAL_CONFIRM') {
    return {
      mode: 'MANUAL_CONFIRM',
      allowedInferenceFields: [],
      confirmationThreshold: DEFAULT_AUTONOMY_CONFIG.confirmationThreshold,
      fallbackStrategy: 'REQUIRE_CONFIRMATION',
    }
  }

  if (values.mode === 'RULE_BASED') {
    return {
      mode: 'RULE_BASED',
      allowedInferenceFields: parseAllowedInferenceFields(values.allowedInferenceFieldsText),
      confirmationThreshold: DEFAULT_AUTONOMY_CONFIG.confirmationThreshold,
      fallbackStrategy: values.fallbackStrategy,
    }
  }

  return {
    mode: 'LLM_SUGGEST',
    allowedInferenceFields: parseAllowedInferenceFields(values.allowedInferenceFieldsText),
    confirmationThreshold: Number(values.confirmationThresholdInput),
    fallbackStrategy: values.fallbackStrategy,
  }
}

function FieldError({ message }: { message?: string }) {
  if (!message) {
    return null
  }

  return (
    <p className="mt-1 text-xs text-error" aria-live="polite">
      {message}
    </p>
  )
}

export const LlmAgentConfigPanel = memo(function LlmAgentConfigPanel({
  config,
  onApply,
  onValidationChange,
}: LlmAgentConfigPanelProps) {
  const { resolvedTheme } = useTheme()
  const authToken = useAuthToken()
  const organizationId = useMemo(() => getOrganizationIdFromToken(authToken) ?? undefined, [authToken])
  const { data: organizationAutonomyPolicy } = useOrganizationAutonomyPolicy(organizationId, {
    enabled: Boolean(organizationId),
  })
  const autonomyCap = organizationAutonomyPolicy?.autonomyCap

  const selectedNodeId = useCanvasStore((state) => state.selectedNodeId)
  const selectedAutonomyModeSource = useCanvasStore((state) => {
    const selectedNodeId = state.selectedNodeId
    if (!selectedNodeId) {
      return null
    }

    const selectedNode = state.nodes.find((node) => node.id === selectedNodeId)
    if (!selectedNode) {
      return null
    }

    return 'autonomyMode' in selectedNode.data ? selectedNode.data.autonomyMode : null
  })
  const selectedAutonomyConfigSource = useCanvasStore((state) => {
    const selectedNodeId = state.selectedNodeId
    if (!selectedNodeId) {
      return null
    }

    const selectedNode = state.nodes.find((node) => node.id === selectedNodeId)
    if (!selectedNode) {
      return null
    }

    return 'autonomyConfig' in selectedNode.data ? selectedNode.data.autonomyConfig : null
  })
  const selectedSettingsSource = useCanvasStore((state) => {
    const selectedNodeId = state.selectedNodeId
    if (!selectedNodeId) {
      return null
    }

    const selectedNode = state.nodes.find((node) => node.id === selectedNodeId)
    if (!selectedNode) {
      return null
    }

    return 'settings' in selectedNode.data ? selectedNode.data.settings : null
  })
  const parsedAutonomyConfig = useMemo(
    () =>
      parseAutonomyConfig({
        autonomyMode: selectedAutonomyModeSource,
        autonomyConfig: selectedAutonomyConfigSource,
        settings: selectedSettingsSource,
        config,
      }),
    [config, selectedAutonomyConfigSource, selectedAutonomyModeSource, selectedSettingsSource],
  )
  const selectedAutonomyConfig = parsedAutonomyConfig.config

  const defaultValues = useMemo(
    () => buildFormValues(config, selectedAutonomyConfig),
    [config, selectedAutonomyConfig],
  )

  const {
    control,
    register,
    reset,
    trigger,
    watch,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<LlmAgentFormValues>({
    resolver: zodResolver(llmAgentSchema),
    defaultValues,
    mode: 'onBlur',
  })

  const mode = useWatch({
    control,
    name: 'mode',
  })
  const fallbackStrategy = useWatch({
    control,
    name: 'fallbackStrategy',
  })
  const currentValues = useWatch({ control })
  const systemPromptValue = useWatch({
    control,
    name: 'systemPrompt',
  })
  const legacyModeResetKey = `${selectedNodeId ?? '__none__'}:${parsedAutonomyConfig.rawMode ?? '__none__'}`

  const hiddenDraftsRef = useRef<HiddenAutonomyDraftValues>(extractHiddenDraftValues(defaultValues))
  const lastSelectedNodeIdRef = useRef<string | null>(selectedNodeId)
  const didMountRef = useRef(false)
  const [legacyModeAcknowledged, setLegacyModeAcknowledged] = useState(
    !parsedAutonomyConfig.hasLegacyMode,
  )
  const legacyModeAcknowledgedRef = useRef(legacyModeAcknowledged)

  useEffect(() => {
    legacyModeAcknowledgedRef.current = legacyModeAcknowledged
  }, [legacyModeAcknowledged])

  useEffect(() => {
    if (!legacyModeResetKey) {
      return
    }

    const nextAcknowledged = !parsedAutonomyConfig.hasLegacyMode
    legacyModeAcknowledgedRef.current = nextAcknowledged
    setLegacyModeAcknowledged(nextAcknowledged)
  }, [legacyModeResetKey, parsedAutonomyConfig.hasLegacyMode])

  useEffect(() => {
    const nextValues = currentValues ?? defaultValues
    const nextAllowedInferenceFieldsText =
      nextValues.allowedInferenceFieldsText ?? defaultValues.allowedInferenceFieldsText
    const nextFallbackStrategy = nextValues.fallbackStrategy ?? defaultValues.fallbackStrategy
    const nextConfirmationThresholdInput =
      nextValues.confirmationThresholdInput ?? defaultValues.confirmationThresholdInput

    if (nextValues.mode !== 'MANUAL_CONFIRM') {
      hiddenDraftsRef.current.allowedInferenceFieldsText = nextAllowedInferenceFieldsText
      hiddenDraftsRef.current.fallbackStrategy = nextFallbackStrategy
    }

    if (nextValues.mode === 'LLM_SUGGEST') {
      hiddenDraftsRef.current.confirmationThresholdInput = nextConfirmationThresholdInput
    }
  }, [currentValues, defaultValues])

  useEffect(() => {
    const selectedNodeChanged = lastSelectedNodeIdRef.current !== selectedNodeId
    lastSelectedNodeIdRef.current = selectedNodeId

    if (!didMountRef.current) {
      hiddenDraftsRef.current = extractHiddenDraftValues(defaultValues)
      didMountRef.current = true
      return
    }

    if (selectedNodeChanged) {
      hiddenDraftsRef.current = extractHiddenDraftValues(defaultValues)
      reset(defaultValues)
      return
    }

    reset(mergeHiddenDraftValues(defaultValues, hiddenDraftsRef.current))
  }, [defaultValues, reset, selectedNodeId])

  const onApplyRef = useRef(onApply)
  onApplyRef.current = onApply
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const subscription = watch(() => {
      const activeTimer = debounceRef.current
      if (activeTimer !== null) {
        clearTimeout(activeTimer)
      }

      debounceRef.current = setTimeout(() => {
        const parsed = llmAgentSchema.safeParse(getValues())
        if (!parsed.success) {
          return
        }

        const nextValues = parsed.data

        if (autonomyCap && !isAutonomyModeWithinCap(nextValues.mode, autonomyCap)) {
          return
        }

        if (parsedAutonomyConfig.hasLegacyMode && !legacyModeAcknowledgedRef.current) {
          return
        }

        onApplyRef.current(
          buildAutosavePatch(
            {
              autonomyConfig: selectedAutonomyConfigSource,
              config,
              settings: selectedSettingsSource,
            },
            nextValues,
          ),
        )
      }, 300)
    })

    return () => {
      subscription.unsubscribe()
      const activeTimer = debounceRef.current
      if (activeTimer !== null) {
        clearTimeout(activeTimer)
      }
    }
  }, [
    autonomyCap,
    config,
    getValues,
    parsedAutonomyConfig.hasLegacyMode,
    selectedAutonomyConfigSource,
    selectedSettingsSource,
    watch,
  ])

  const selectedMode = mode ?? DEFAULT_AUTONOMY_CONFIG.mode
  const hasFormErrors =
    Object.keys(errors).length > 0 || !llmAgentSchema.safeParse(currentValues ?? defaultValues).success
  const isCurrentModeBlockedByPolicy =
    autonomyCap != null && !isAutonomyModeWithinCap(selectedMode, autonomyCap)
  const hasLegacyModeBlockingSave = parsedAutonomyConfig.hasLegacyMode && !legacyModeAcknowledged
  const hasErrors = hasFormErrors || isCurrentModeBlockedByPolicy || hasLegacyModeBlockingSave

  useEffect(() => {
    onValidationChange?.(hasErrors)
  }, [hasErrors, onValidationChange])

  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      setValue('systemPrompt', value ?? '', {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      })
    },
    [setValue],
  )

  useEffect(() => {
    void trigger('confirmationThresholdInput')
  }, [trigger])

  const acknowledgeLegacyMode = useCallback(() => {
    if (!parsedAutonomyConfig.hasLegacyMode) {
      return
    }

    setLegacyModeAcknowledged(true)
  }, [parsedAutonomyConfig.hasLegacyMode])

  const handleModeChange = useCallback(
    (
      nextMode: AutonomyMode,
      currentMode: AutonomyMode,
      onChange: (value: AutonomyMode) => void,
    ) => {
      acknowledgeLegacyMode()

      if (autonomyCap && !isAutonomyModeWithinCap(nextMode, autonomyCap) && nextMode !== currentMode) {
        return
      }

      onChange(nextMode)
    },
    [acknowledgeLegacyMode, autonomyCap],
  )

  const confirmationThresholdRegistration = register('confirmationThresholdInput')

  const modeMeta = useMemo(
    () => ({
      label: getAutonomyModeLabel(selectedMode),
      description: getAutonomyModeDescription(selectedMode),
      noteClassName: AUTONOMY_MODE_NOTE_CLASS_NAMES[selectedMode],
    }),
    [selectedMode],
  )
  const blockedModes = useMemo(
    () =>
      autonomyCap
        ? AUTONOMY_MODES.filter((autonomyMode) => !isAutonomyModeWithinCap(autonomyMode, autonomyCap))
        : [],
    [autonomyCap],
  )
  const organizationCapMessage = autonomyCap
    ? `组织自治上限：${getAutonomyModeLabel(autonomyCap)}。${getAutonomyModeDescription(autonomyCap)}`
    : null
  const blockedModesMessage =
    autonomyCap && blockedModes.length > 0
      ? `高于该上限的模式不可新选：${blockedModes.map((autonomyMode) => getAutonomyModeLabel(autonomyMode)).join('、')}。`
      : null
  const legacyModeMessage = parsedAutonomyConfig.hasLegacyMode
    ? `检测到历史自主模式“${parsedAutonomyConfig.rawMode ?? '未知模式'}”。当前表单按“${getAutonomyModeLabel(selectedMode)}”呈现；重新保存后会迁移为该模式。`
    : null
  const blockedCurrentModeMessage =
    autonomyCap && isCurrentModeBlockedByPolicy
      ? `当前节点仍配置为“${getAutonomyModeLabel(selectedMode)}”，高于组织自治上限“${getAutonomyModeLabel(autonomyCap)}”。请先降级到允许范围后再保存。`
      : null
  const modeFieldErrorMessage =
    blockedCurrentModeMessage ?? (hasLegacyModeBlockingSave ? legacyModeMessage ?? undefined : undefined)
  const manualModeHiddenFieldError =
    errors.allowedInferenceFieldsText?.message ?? errors.fallbackStrategy?.message

  return (
    <div className="space-y-4 px-4 py-4" data-testid="llm-agent-config-panel">
      <div>
        <Label>systemPrompt</Label>
        <p className="mb-1 text-xs text-muted-foreground">
          定义 Agent 的行为和角色
        </p>
        <Suspense
          fallback={
            <div
              className="space-y-3 rounded-md border border-border bg-muted/20 px-4 py-4"
              data-testid="llm-agent-editor-fallback"
            >
              <div className="h-4 w-28 animate-pulse rounded bg-muted/60" />
              <div className="h-3 w-full animate-pulse rounded bg-muted/40" />
              <div className="h-3 w-5/6 animate-pulse rounded bg-muted/40" />
              <div className="h-3 w-2/3 animate-pulse rounded bg-muted/40" />
            </div>
          }
        >
          <div className="overflow-hidden rounded-md border border-border">
            <MonacoEditor
              height="200px"
              defaultLanguage="markdown"
              value={systemPromptValue ?? ''}
              onChange={handleEditorChange}
              theme={resolvedTheme === 'dark' ? 'vs-dark' : 'light'}
              options={{
                minimap: { enabled: false },
                lineNumbers: 'off',
                wordWrap: 'on',
                fontSize: 13,
                scrollBeyondLastLine: false,
                padding: { top: 8, bottom: 8 },
              }}
            />
          </div>
        </Suspense>
        <FieldError message={errors.systemPrompt?.message} />
      </div>

      <div>
        <Label>outputSchemaTitle</Label>
        <p className="mb-1 text-xs text-muted-foreground">
          结构化输出的 Schema 标题
        </p>
        <Input
          aria-label="outputSchemaTitle"
          id="outputSchemaTitle"
          autoComplete="off"
          placeholder="e.g. AnalysisResult"
          {...register('outputSchemaTitle')}
        />
        <FieldError message={errors.outputSchemaTitle?.message} />
      </div>

      <section
        className="space-y-3 rounded-md border border-border/60 bg-muted/10 px-3 py-3"
        data-testid="llm-agent-autonomy-configurator"
      >
        <div className="space-y-1">
          <Label>自主模式</Label>
          <p className="text-xs text-muted-foreground">
            决定 Agent 在缺失输入时是等待人工、按规则补全，还是仅生成可撤销建议。
          </p>
        </div>

        <Controller
          name="mode"
          control={control}
          render={({ field }) => (
            <Select
              aria-label="自主模式"
              id="llm-agent-autonomy-mode"
              value={field.value}
              onValueChange={(value) =>
                handleModeChange(value as AutonomyMode, field.value, field.onChange)
              }
              onBlur={() => {
                acknowledgeLegacyMode()
                field.onBlur()
              }}
              data-testid="llm-agent-autonomy-mode-select"
            >
              {AUTONOMY_MODES.map((autonomyMode) => {
                const isBlockedByPolicy =
                  autonomyCap != null && !isAutonomyModeWithinCap(autonomyMode, autonomyCap)

                return (
                  <option
                    key={autonomyMode}
                    value={autonomyMode}
                    disabled={isBlockedByPolicy && autonomyMode !== field.value}
                  >
                    {getAutonomyModeLabel(autonomyMode)}
                    {isBlockedByPolicy ? '（受组织策略限制）' : ''}
                  </option>
                )
              })}
            </Select>
          )}
        />

        {organizationCapMessage ? (
          <div
            className="rounded-md border border-border/60 bg-background/40 px-3 py-2 text-xs text-muted-foreground"
            data-testid="llm-agent-autonomy-cap-notice"
          >
            <p>{organizationCapMessage}</p>
            {blockedModesMessage ? <p className="mt-1">{blockedModesMessage}</p> : null}
          </div>
        ) : null}

        {legacyModeMessage ? (
          <div
            className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"
            data-testid="llm-agent-autonomy-legacy-warning"
          >
            {legacyModeMessage}
          </div>
        ) : null}

        {blockedCurrentModeMessage ? (
          <div
            className="rounded-md border border-error/40 bg-error/10 px-3 py-2 text-xs text-error"
            data-testid="llm-agent-autonomy-policy-warning"
          >
            {blockedCurrentModeMessage}
          </div>
        ) : null}

        <div className={`rounded-md border px-3 py-2 text-xs ${modeMeta.noteClassName}`}>
          {modeMeta.description}
        </div>

        <FieldError message={modeFieldErrorMessage} />

        {mode === 'MANUAL_CONFIRM' ? <FieldError message={manualModeHiddenFieldError} /> : null}

        {mode !== 'MANUAL_CONFIRM' ? (
          <div>
            <Label>允许推断字段</Label>
            <p className="mb-1 text-xs text-muted-foreground">
              每行一个字段路径，例如 <span className="font-mono">context.topic</span> 或{' '}
              <span className="font-mono">inputs.summary.title</span>。
            </p>
            <textarea
              id="allowedInferenceFieldsText"
              aria-label="允许推断字段"
              autoComplete="off"
              spellCheck={false}
              rows={4}
              data-testid="llm-agent-allowed-inference-fields"
              className="flex min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              placeholder="context.topic&#10;inputs.summary.title"
              {...register('allowedInferenceFieldsText')}
            />
            <FieldError message={errors.allowedInferenceFieldsText?.message} />
          </div>
        ) : null}

        {mode === 'LLM_SUGGEST' ? (
          <div>
            <Label>确认阈值</Label>
            <p className="mb-1 text-xs text-muted-foreground">
              取值范围为 0 到 1，低于该阈值的建议需要人工确认后才能继续。
            </p>
            <Input
              id="confirmationThresholdInput"
              type="number"
              step="0.01"
              min="0"
              max="1"
              inputMode="decimal"
              autoComplete="off"
              aria-label="确认阈值"
              data-testid="llm-agent-confirmation-threshold"
              placeholder="0.80"
              {...confirmationThresholdRegistration}
              onChange={(event) => {
                confirmationThresholdRegistration.onChange(event)
                void trigger('confirmationThresholdInput')
              }}
            />
            <FieldError message={errors.confirmationThresholdInput?.message} />
          </div>
        ) : null}

        {mode !== 'MANUAL_CONFIRM' ? (
          <div>
            <Label>兜底策略</Label>
            <p className="mb-1 text-xs text-muted-foreground">
              当规则或建议无法可靠补齐字段时，决定系统如何收束本次执行。
            </p>
            <Controller
              name="fallbackStrategy"
              control={control}
              render={({ field }) => (
                <Select
                  aria-label="兜底策略"
                  id="llm-agent-fallback-strategy"
                  value={field.value}
                  onValueChange={field.onChange}
                  onBlur={field.onBlur}
                  data-testid="llm-agent-fallback-strategy-select"
                >
                  {FALLBACK_STRATEGIES.map((strategy) => (
                    <option key={strategy} value={strategy}>
                      {FALLBACK_STRATEGY_META[strategy].label}
                    </option>
                  ))}
                </Select>
              )}
            />
            <p className="mt-1 text-xs text-muted-foreground/80">
              {FALLBACK_STRATEGY_META[fallbackStrategy ?? DEFAULT_AUTONOMY_CONFIG.fallbackStrategy].description}
            </p>
            <FieldError message={errors.fallbackStrategy?.message} />
          </div>
        ) : null}
      </section>
    </div>
  )
})
