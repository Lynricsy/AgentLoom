import { useEffect, useMemo, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, ShieldAlert } from 'lucide-react'
import { z } from 'zod'
import {
  getNodeTypeConfigOrNull,
  type CanvasNode,
} from '@/features/canvas'
import { Button } from '@/shared/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select'
import { Slider } from '@/shared/ui/slider'
import { useToast } from '@/shared/ui/toast'
import {
  useCreateInterventionPolicy,
  useDeleteInterventionPolicy,
  useInterventionPolicies,
  useResolvedInterventionPolicy,
  useUpdateInterventionPolicy,
} from '../api/interventionPolicyQueries'
import {
  DEFAULT_INTERVENTION_POLICY,
  formatInterventionTimeoutLabel,
  INTERVENTION_ROLE_LABELS,
  NOTIFY_CHANNEL_LABELS,
  POLICY_SOURCE_LABELS,
  TIMEOUT_ACTION_LABELS,
  TIMEOUT_OPTIONS,
} from '../lib/interventionPolicyOptions'
import {
  CONFIGURABLE_INTERVENTION_ROLES,
  type CreateInterventionPolicyData,
  INTERVENTION_ROLES,
  NOTIFY_CHANNELS,
  TIMEOUT_ACTIONS,
  type ConfigurableInterventionRole,
  type InterventionPolicy,
  type InterventionRole,
  type NotifyChannel,
  type ResolvedInterventionPolicy,
  type TimeoutAction,
} from '../types'

const interventionPolicyFormSchema = z
  .object({
    allowedRoles: z.array(z.enum(INTERVENTION_ROLES)).min(1, '至少选择一个允许角色'),
    timeoutSeconds: z.number().min(300).max(604800),
    timeoutAction: z.enum(TIMEOUT_ACTIONS),
    escalateToRole: z.union([z.literal(''), z.enum(INTERVENTION_ROLES)]),
    notifyChannels: z.array(z.enum(NOTIFY_CHANNELS)).min(1, '至少选择一个通知通道'),
  })
  .superRefine((value, ctx) => {
    if (value.timeoutAction === 'escalate' && !value.escalateToRole) {
      ctx.addIssue({
        code: 'custom',
        message: '请选择升级目标角色',
        path: ['escalateToRole'],
      })
    }
  })

type InterventionPolicyFormValues = z.infer<typeof interventionPolicyFormSchema>
type InterventionPolicyFormInput = z.input<typeof interventionPolicyFormSchema>

interface LegacyRoleCompatibility {
  unsupportedAllowedRoles: InterventionRole[]
  unsupportedEscalateToRole: InterventionRole | null
}

function isConfigurableInterventionRole(
  role: InterventionRole,
): role is ConfigurableInterventionRole {
  return CONFIGURABLE_INTERVENTION_ROLES.some((candidate) => candidate === role)
}

function toConfigurableInterventionRoles(
  roles: InterventionRole[],
): ConfigurableInterventionRole[] {
  return roles.filter(isConfigurableInterventionRole)
}

function toConfigurableEscalateRole(
  role: InterventionRole | null,
): ConfigurableInterventionRole | '' {
  if (!role) {
    return ''
  }

  return isConfigurableInterventionRole(role) ? role : ''
}

function resolveLegacyRoleCompatibility(
  policy?: ResolvedInterventionPolicy | InterventionPolicy | null,
): LegacyRoleCompatibility {
  if (!policy) {
    return {
      unsupportedAllowedRoles: [],
      unsupportedEscalateToRole: null,
    }
  }

  return {
    unsupportedAllowedRoles: policy.allowedRoles.filter(
      (role) => !isConfigurableInterventionRole(role),
    ),
    unsupportedEscalateToRole:
      policy.escalateToRole && !isConfigurableInterventionRole(policy.escalateToRole)
        ? policy.escalateToRole
        : null,
  }
}

function requiresLegacyRoleAction({
  compatibility,
  currentAction,
  allowedRolesDirty,
  timeoutActionDirty,
  escalateToRoleDirty,
}: {
  compatibility: LegacyRoleCompatibility
  currentAction: TimeoutAction
  allowedRolesDirty: boolean
  timeoutActionDirty: boolean
  escalateToRoleDirty: boolean
}): boolean {
  if (compatibility.unsupportedAllowedRoles.length > 0 && !allowedRolesDirty) {
    return true
  }

  if (
    compatibility.unsupportedEscalateToRole &&
    currentAction === 'escalate' &&
    !timeoutActionDirty &&
    !escalateToRoleDirty
  ) {
    return true
  }

  return false
}

interface InterventionPolicyTabProps {
  workflowId: string
  workflowName: string
  nodes: CanvasNode[]
  isReadOnly: boolean
}

function buildFormValues(
  policy?: ResolvedInterventionPolicy | InterventionPolicy | null,
): InterventionPolicyFormValues {
  const base = policy ?? DEFAULT_INTERVENTION_POLICY
  const allowedRoles = toConfigurableInterventionRoles(base.allowedRoles)

  return {
    allowedRoles,
    timeoutSeconds: base.timeoutSeconds,
    timeoutAction: base.timeoutAction,
    escalateToRole: toConfigurableEscalateRole(base.escalateToRole),
    notifyChannels: [...base.notifyChannels],
  }
}

function toMutationData(
  values: InterventionPolicyFormValues,
  nodeId: string | null,
): CreateInterventionPolicyData {
  return {
    nodeId,
    allowedRoles: values.allowedRoles,
    timeoutSeconds: values.timeoutSeconds,
    timeoutAction: values.timeoutAction,
    escalateToRole: values.timeoutAction === 'escalate' ? values.escalateToRole || null : null,
    notifyChannels: values.notifyChannels,
  }
}

function normalizeMutationPayload(
  values: InterventionPolicyFormValues,
  nodeId: string | null,
) {
  const payload = toMutationData(values, nodeId)

  return {
    nodeId: payload.nodeId,
    allowedRoles: payload.allowedRoles,
    timeoutSeconds: payload.timeoutSeconds,
    timeoutAction: payload.timeoutAction,
    escalateToRole: payload.escalateToRole,
    notifyChannels: payload.notifyChannels,
  }
}

function formatRoles(roles: InterventionRole[]): string {
  return roles.map((role) => INTERVENTION_ROLE_LABELS[role]).join('、')
}

function formatChannels(channels: NotifyChannel[]): string {
  return channels.map((channel) => NOTIFY_CHANNEL_LABELS[channel]).join('、')
}

function getTimeoutOptionIndex(timeoutSeconds: number): number {
  const matchedIndex = TIMEOUT_OPTIONS.findIndex((option) => option.value === timeoutSeconds)
  return matchedIndex >= 0 ? matchedIndex : TIMEOUT_OPTIONS.findIndex((option) => option.value === DEFAULT_INTERVENTION_POLICY.timeoutSeconds)
}

function getTimeoutSecondsFromIndex(index: number): number {
  return TIMEOUT_OPTIONS[index]?.value ?? DEFAULT_INTERVENTION_POLICY.timeoutSeconds
}

function RoleCheckboxGroup({
  fieldId,
  label,
  value,
  onChange,
  disabled,
}: {
  fieldId: string
  label: string
  value: InterventionRole[]
  onChange: (nextValue: InterventionRole[]) => void
  disabled: boolean
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-foreground">{label}</legend>
      <div id={fieldId} className="grid gap-2 sm:grid-cols-2">
        {CONFIGURABLE_INTERVENTION_ROLES.map((role) => {
          const checked = value.includes(role)

          return (
            <label
              key={role}
              className="flex items-center gap-2 rounded-lg border border-border/70 bg-background/40 px-3 py-2 text-sm text-foreground"
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={(event) => {
                  if (event.target.checked) {
                    onChange([...value, role])
                    return
                  }

                  onChange(value.filter((currentRole) => currentRole !== role))
                }}
              />
              {INTERVENTION_ROLE_LABELS[role]}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

function NotifyChannelCheckboxGroup({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string
  value: NotifyChannel[]
  onChange: (nextValue: NotifyChannel[]) => void
  disabled: boolean
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-foreground">{label}</legend>
      <div className="grid gap-2 sm:grid-cols-3">
        {NOTIFY_CHANNELS.map((channel) => {
          const checked = value.includes(channel)

          return (
            <label
              key={channel}
              className="flex items-center gap-2 rounded-lg border border-border/70 bg-background/40 px-3 py-2 text-sm text-foreground"
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={(event) => {
                  if (event.target.checked) {
                    onChange([...value, channel])
                    return
                  }

                  onChange(value.filter((currentChannel) => currentChannel !== channel))
                }}
              />
              {NOTIFY_CHANNEL_LABELS[channel]}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

function PolicySummary({
  title,
  source,
  allowedRoles,
  timeoutSeconds,
  timeoutAction,
  escalateToRole,
  notifyChannels,
}: {
  title: string
  source: string
  allowedRoles: InterventionRole[]
  timeoutSeconds: number
  timeoutAction: TimeoutAction
  escalateToRole: InterventionRole | null
  notifyChannels: NotifyChannel[]
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-background/35 p-3 text-sm text-muted-foreground">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <div className="mt-2 grid gap-1">
        <p>来源：{source}</p>
        <p>允许角色：{formatRoles(allowedRoles)}</p>
        <p>超时：{formatInterventionTimeoutLabel(timeoutSeconds)}</p>
        <p>
          超时动作：{TIMEOUT_ACTION_LABELS[timeoutAction]}
          {timeoutAction === 'escalate' && escalateToRole
            ? ` → ${INTERVENTION_ROLE_LABELS[escalateToRole]}`
            : ''}
        </p>
        <p>通知：{formatChannels(notifyChannels)}</p>
      </div>
    </div>
  )
}

function LegacyRoleWarning({
  testId,
  compatibility,
  requiresAction,
}: {
  testId: string
  compatibility: LegacyRoleCompatibility
  requiresAction: boolean
}) {
  if (
    compatibility.unsupportedAllowedRoles.length === 0 &&
    !compatibility.unsupportedEscalateToRole
  ) {
    return null
  }

  const warningParts: string[] = []

  if (compatibility.unsupportedAllowedRoles.length > 0) {
    warningParts.push(
      `允许角色包含旧版兼容角色：${formatRoles(compatibility.unsupportedAllowedRoles)}`,
    )
  }

  if (compatibility.unsupportedEscalateToRole) {
    warningParts.push(
      `升级目标角色包含旧版兼容角色：${INTERVENTION_ROLE_LABELS[compatibility.unsupportedEscalateToRole]}`,
    )
  }

  return (
    <div
      className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning"
      data-testid={testId}
    >
      <p className="font-medium text-warning">检测到旧版兼容角色配置</p>
      <p className="mt-1 leading-6 text-foreground">{warningParts.join('；')}。</p>
      <p className="mt-2 text-foreground/85">
        {requiresAction
          ? '请先重新选择当前界面支持的角色后再保存；保存后会以你当前的可见选择覆盖旧版兼容角色。'
          : '当前保存将以你现在的可见选择覆盖旧版兼容角色，请确认后再继续。'}
      </p>
    </div>
  )
}

export function InterventionPolicyTab({
  workflowId,
  workflowName,
  nodes,
  isReadOnly,
}: InterventionPolicyTabProps) {
  const { notify } = useToast()
  const policiesQuery = useInterventionPolicies(workflowId)
  const workflowResolvedQuery = useResolvedInterventionPolicy(workflowId)
  const createMutation = useCreateInterventionPolicy(workflowId)
  const updateMutation = useUpdateInterventionPolicy(workflowId)
  const deleteMutation = useDeleteInterventionPolicy(workflowId)

  const agentNodes = useMemo(
    () =>
      nodes.filter((node) => {
        const nodeType = typeof node.data?.nodeType === 'string' ? node.data.nodeType : node.type
        return getNodeTypeConfigOrNull(nodeType)?.category === 'agent'
      }),
    [nodes],
  )

  const policies = useMemo(() => policiesQuery.data?.data ?? [], [policiesQuery.data])
  const workflowPolicy = useMemo(
    () => policies.find((policy) => policy.nodeId === null) ?? null,
    [policies],
  )
  const nodePoliciesById = useMemo(
    () =>
      new Map(
        policies
          .filter((policy) => policy.nodeId)
          .map((policy) => [policy.nodeId as string, policy]),
      ),
    [policies],
  )

  const [selectedNodeId, setSelectedNodeId] = useState<string>(agentNodes[0]?.id ?? '')

  useEffect(() => {
    if (!agentNodes.length) {
      setSelectedNodeId('')
      return
    }

    setSelectedNodeId((current) =>
      agentNodes.some((node) => node.id === current) ? current : agentNodes[0]?.id ?? '',
    )
  }, [agentNodes])

  const selectedNode = agentNodes.find((node) => node.id === selectedNodeId) ?? null
  const selectedNodePolicy = selectedNodeId ? nodePoliciesById.get(selectedNodeId) ?? null : null
  const nodeResolvedQuery = useResolvedInterventionPolicy(
    workflowId,
    selectedNodeId || undefined,
  )

  const workflowForm = useForm<InterventionPolicyFormInput, undefined, InterventionPolicyFormValues>({
    resolver: zodResolver(interventionPolicyFormSchema),
    defaultValues: buildFormValues(),
  })

  const nodeForm = useForm<InterventionPolicyFormInput, undefined, InterventionPolicyFormValues>({
    resolver: zodResolver(interventionPolicyFormSchema),
    defaultValues: buildFormValues(),
  })

  useEffect(() => {
    workflowForm.reset(buildFormValues(workflowResolvedQuery.data ?? workflowPolicy))
  }, [workflowForm, workflowPolicy, workflowResolvedQuery.data])

  useEffect(() => {
    nodeForm.reset(buildFormValues(nodeResolvedQuery.data ?? selectedNodePolicy ?? workflowResolvedQuery.data))
  }, [nodeForm, nodeResolvedQuery.data, selectedNodePolicy, workflowResolvedQuery.data])

  const workflowAction = workflowForm.watch('timeoutAction')
  const nodeAction = nodeForm.watch('timeoutAction')
  const workflowLegacyCompatibility = useMemo(
    () => resolveLegacyRoleCompatibility(workflowResolvedQuery.data ?? workflowPolicy),
    [workflowPolicy, workflowResolvedQuery.data],
  )
  const nodeLegacyCompatibility = useMemo(
    () =>
      resolveLegacyRoleCompatibility(
        nodeResolvedQuery.data ?? selectedNodePolicy ?? workflowResolvedQuery.data,
      ),
    [nodeResolvedQuery.data, selectedNodePolicy, workflowResolvedQuery.data],
  )
  const workflowRequiresLegacyReview = requiresLegacyRoleAction({
    compatibility: workflowLegacyCompatibility,
    currentAction: workflowAction,
    allowedRolesDirty: Boolean(workflowForm.formState.dirtyFields.allowedRoles),
    timeoutActionDirty: Boolean(workflowForm.formState.dirtyFields.timeoutAction),
    escalateToRoleDirty: Boolean(workflowForm.formState.dirtyFields.escalateToRole),
  })
  const nodeRequiresLegacyReview = requiresLegacyRoleAction({
    compatibility: nodeLegacyCompatibility,
    currentAction: nodeAction,
    allowedRolesDirty: Boolean(nodeForm.formState.dirtyFields.allowedRoles),
    timeoutActionDirty: Boolean(nodeForm.formState.dirtyFields.timeoutAction),
    escalateToRoleDirty: Boolean(nodeForm.formState.dirtyFields.escalateToRole),
  })

  const isLoading =
    policiesQuery.isLoading || workflowResolvedQuery.isLoading || (selectedNodeId ? nodeResolvedQuery.isLoading : false)
  const error =
    (policiesQuery.error as Error | null) ??
    (workflowResolvedQuery.error as Error | null) ??
    (nodeResolvedQuery.error as Error | null)

  const isSaving = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending

  async function saveWorkflowPolicy(values: InterventionPolicyFormValues) {
    const payload = normalizeMutationPayload(values, null)

    try {
      if (workflowPolicy) {
        await updateMutation.mutateAsync({
          policyId: workflowPolicy.id,
          data: {
            ...payload,
            version: workflowPolicy.version,
          },
        })
      } else {
        await createMutation.mutateAsync(payload)
      }

      notify({
        title: '工作流介入策略已保存',
        description: `已更新「${workflowName}」的默认介入策略。`,
        variant: 'success',
      })
    } catch (mutationError) {
      notify({
        title: '保存失败',
        description: mutationError instanceof Error ? mutationError.message : '请稍后重试。',
        variant: 'error',
      })
    }
  }

  async function saveNodePolicy(values: InterventionPolicyFormValues) {
    if (!selectedNode) {
      return
    }

    const payload = normalizeMutationPayload(values, selectedNode.id)

    try {
      if (selectedNodePolicy) {
        await updateMutation.mutateAsync({
          policyId: selectedNodePolicy.id,
          data: {
            ...payload,
            version: selectedNodePolicy.version,
          },
        })
      } else {
        await createMutation.mutateAsync(payload)
      }

      notify({
        title: '节点介入策略已保存',
        description: `已更新节点「${selectedNode.data.label}」的介入策略。`,
        variant: 'success',
      })
    } catch (mutationError) {
      notify({
        title: '保存失败',
        description: mutationError instanceof Error ? mutationError.message : '请稍后重试。',
        variant: 'error',
      })
    }
  }

  async function restoreNodePolicy() {
    if (!selectedNodePolicy || isReadOnly) {
      return
    }

    try {
      await deleteMutation.mutateAsync(selectedNodePolicy.id)
      notify({
        title: '节点覆盖已移除',
        description: '该节点将回退为工作流级策略。',
        variant: 'success',
      })
    } catch (mutationError) {
      notify({
        title: '恢复默认失败',
        description: mutationError instanceof Error ? mutationError.message : '请稍后重试。',
        variant: 'error',
      })
    }
  }

  if (isLoading) {
    return (
      <section className="flex h-full flex-col rounded-2xl border border-border/70 bg-surface/95 p-4 shadow-xl backdrop-blur-md">
        <div className="flex min-h-[280px] flex-1 items-center justify-center rounded-2xl border border-border/70 bg-background/30">
          <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            正在加载介入策略...
          </div>
        </div>
      </section>
    )
  }

  if (policiesQuery.isError || workflowResolvedQuery.isError || nodeResolvedQuery.isError) {
    return (
      <section className="flex h-full flex-col rounded-2xl border border-border/70 bg-surface/95 p-4 shadow-xl backdrop-blur-md">
        <div className="flex min-h-[280px] flex-1 items-center justify-center rounded-2xl border border-error/20 bg-error/10 px-6 text-center">
          <div>
            <p className="text-base font-medium text-error">加载介入策略失败</p>
            <p className="mt-2 text-sm text-muted-foreground">
              {error instanceof Error ? error.message : '请稍后重试。'}
            </p>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="flex h-full flex-col rounded-2xl border border-border/70 bg-surface/95 p-4 shadow-xl backdrop-blur-md">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Intervention Policy
          </p>
          <h2 className="text-lg font-semibold text-foreground">介入权限策略</h2>
          <p className="text-sm text-muted-foreground">
            为「{workflowName}」配置工作流默认策略，并按 Agent 节点定义单独覆盖规则。
          </p>
        </div>

        {isReadOnly ? (
          <div className="inline-flex items-center gap-2 rounded-full border border-warning/30 bg-warning/10 px-3 py-1.5 text-xs font-medium text-warning">
            <ShieldAlert className="h-3.5 w-3.5" />
            当前角色仅可查看策略配置
          </div>
        ) : null}
      </div>

      <div className="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        <div className="rounded-2xl border border-border/70 bg-background/20 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-foreground">工作流级介入策略</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                作为所有 Agent 节点的默认审批权限与超时处理策略。
              </p>
            </div>
          </div>

          <div className="mt-4">
            <PolicySummary
              title="当前工作流默认值"
              source={POLICY_SOURCE_LABELS[workflowResolvedQuery.data?.source ?? 'system_default']}
              allowedRoles={workflowResolvedQuery.data?.allowedRoles ?? DEFAULT_INTERVENTION_POLICY.allowedRoles}
              timeoutSeconds={workflowResolvedQuery.data?.timeoutSeconds ?? DEFAULT_INTERVENTION_POLICY.timeoutSeconds}
              timeoutAction={workflowResolvedQuery.data?.timeoutAction ?? DEFAULT_INTERVENTION_POLICY.timeoutAction}
              escalateToRole={workflowResolvedQuery.data?.escalateToRole ?? DEFAULT_INTERVENTION_POLICY.escalateToRole}
              notifyChannels={workflowResolvedQuery.data?.notifyChannels ?? DEFAULT_INTERVENTION_POLICY.notifyChannels}
            />
          </div>

          <form className="mt-4 space-y-4" onSubmit={workflowForm.handleSubmit(saveWorkflowPolicy)}>
            <LegacyRoleWarning
              testId="workflow-legacy-role-warning"
              compatibility={workflowLegacyCompatibility}
              requiresAction={workflowRequiresLegacyReview}
            />

            <Controller
              control={workflowForm.control}
              name="allowedRoles"
              render={({ field }) => (
                <RoleCheckboxGroup
                  fieldId="workflow-allowed-roles"
                  label="工作流允许处理角色"
                  value={field.value}
                  onChange={field.onChange}
                  disabled={isReadOnly || isSaving}
                />
              )}
            />
            {workflowForm.formState.errors.allowedRoles ? (
              <p className="text-sm text-error">
                {workflowForm.formState.errors.allowedRoles.message}
              </p>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="workflow-timeout-seconds" className="text-sm font-medium text-foreground">
                    工作流超时时间
                  </label>
                  <span className="text-xs text-muted-foreground">
                    {formatInterventionTimeoutLabel(workflowForm.watch('timeoutSeconds'))}
                  </span>
                </div>
                <Controller
                  control={workflowForm.control}
                  name="timeoutSeconds"
                  render={({ field }) => (
                    <Slider
                      id="workflow-timeout-seconds"
                      aria-label="工作流超时时间"
                      min={0}
                      max={TIMEOUT_OPTIONS.length - 1}
                      step={1}
                      value={[
                        getTimeoutOptionIndex(
                          typeof field.value === 'number'
                            ? field.value
                            : DEFAULT_INTERVENTION_POLICY.timeoutSeconds,
                        ),
                      ]}
                      disabled={isReadOnly || isSaving}
                      onValueChange={(value) =>
                        field.onChange(getTimeoutSecondsFromIndex(value[0] ?? 0))
                      }
                    />
                  )}
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="workflow-timeout-action" className="text-sm font-medium text-foreground">
                  工作流超时动作
                </label>
                <Controller
                  control={workflowForm.control}
                  name="timeoutAction"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      disabled={isReadOnly || isSaving}
                      onValueChange={field.onChange}
                    >
                      <SelectTrigger id="workflow-timeout-action" aria-label="工作流超时动作">
                        <SelectValue placeholder="请选择超时动作" />
                      </SelectTrigger>
                      <SelectContent>
                        {TIMEOUT_ACTIONS.map((action) => (
                          <SelectItem key={action} value={action}>
                            {TIMEOUT_ACTION_LABELS[action]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>

            {workflowAction === 'escalate' ? (
              <div className="space-y-2">
                <label htmlFor="workflow-escalate-role" className="text-sm font-medium text-foreground">
                  工作流升级目标角色
                </label>
                <Controller
                  control={workflowForm.control}
                  name="escalateToRole"
                  render={({ field }) => (
                    <Select
                      value={field.value ?? ''}
                      disabled={isReadOnly || isSaving}
                      onValueChange={field.onChange}
                    >
                      <SelectTrigger id="workflow-escalate-role" aria-label="工作流升级目标角色">
                        <SelectValue placeholder="请选择角色" />
                      </SelectTrigger>
                      <SelectContent>
                        {CONFIGURABLE_INTERVENTION_ROLES.map((role) => (
                          <SelectItem key={role} value={role}>
                            {INTERVENTION_ROLE_LABELS[role]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {workflowForm.formState.errors.escalateToRole ? (
                  <p className="text-sm text-error">
                    {workflowForm.formState.errors.escalateToRole.message}
                  </p>
                ) : null}
              </div>
            ) : null}

            <Controller
              control={workflowForm.control}
              name="notifyChannels"
              render={({ field }) => (
                <NotifyChannelCheckboxGroup
                  label="工作流通知渠道"
                  value={field.value}
                  onChange={field.onChange}
                  disabled={isReadOnly || isSaving}
                />
              )}
            />

            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={isReadOnly || isSaving || workflowRequiresLegacyReview}
              >
                保存工作流策略
              </Button>
            </div>
          </form>
        </div>

        <div className="rounded-2xl border border-border/70 bg-background/20 p-4">
          <div>
            <h3 className="text-base font-semibold text-foreground">节点级覆盖</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              仅 Agent 节点可以设置覆盖策略；未配置覆盖时会继承工作流默认值。
            </p>
          </div>

          <div className="mt-4 grid gap-3">
            {agentNodes.length ? (
              agentNodes.map((node) => {
                const override = nodePoliciesById.get(node.id) ?? null
                const isSelected = node.id === selectedNodeId

                return (
                  <button
                    key={node.id}
                    type="button"
                    className={`rounded-xl border px-3 py-3 text-left transition ${
                      isSelected
                        ? 'border-primary/40 bg-primary/10'
                        : 'border-border/70 bg-background/35 hover:border-primary/30'
                    }`}
                    onClick={() => setSelectedNodeId(node.id)}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">{node.data.label}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {override ? '已配置节点覆盖' : '使用工作流默认策略'}
                        </p>
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        <p>
                          {formatInterventionTimeoutLabel(
                            override?.timeoutSeconds ?? workflowResolvedQuery.data?.timeoutSeconds ?? DEFAULT_INTERVENTION_POLICY.timeoutSeconds,
                          )}
                        </p>
                        <p>
                          {TIMEOUT_ACTION_LABELS[
                            override?.timeoutAction ?? workflowResolvedQuery.data?.timeoutAction ?? DEFAULT_INTERVENTION_POLICY.timeoutAction
                          ]}
                        </p>
                      </div>
                    </div>
                  </button>
                )
              })
            ) : (
              <div className="rounded-xl border border-dashed border-border/70 bg-background/20 px-4 py-6 text-sm text-muted-foreground">
                当前工作流中还没有可配置介入策略的 Agent 节点。
              </div>
            )}
          </div>

          {selectedNode ? (
            <>
              <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,240px),minmax(0,1fr)]">
                <div className="space-y-2">
                  <label htmlFor="node-policy-target" className="text-sm font-medium text-foreground">
                    选择 Agent 节点
                  </label>
                  <Select
                    value={selectedNodeId}
                    disabled={isSaving}
                    onValueChange={setSelectedNodeId}
                  >
                    <SelectTrigger id="node-policy-target" aria-label="选择 Agent 节点">
                      <SelectValue placeholder="请选择 Agent 节点" />
                    </SelectTrigger>
                    <SelectContent>
                      {agentNodes.map((node) => (
                        <SelectItem key={node.id} value={node.id}>
                          {node.data.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <PolicySummary
                  title={`节点「${selectedNode.data.label}」当前生效值`}
                  source={POLICY_SOURCE_LABELS[nodeResolvedQuery.data?.source ?? 'system_default']}
                  allowedRoles={nodeResolvedQuery.data?.allowedRoles ?? workflowResolvedQuery.data?.allowedRoles ?? DEFAULT_INTERVENTION_POLICY.allowedRoles}
                  timeoutSeconds={nodeResolvedQuery.data?.timeoutSeconds ?? workflowResolvedQuery.data?.timeoutSeconds ?? DEFAULT_INTERVENTION_POLICY.timeoutSeconds}
                  timeoutAction={nodeResolvedQuery.data?.timeoutAction ?? workflowResolvedQuery.data?.timeoutAction ?? DEFAULT_INTERVENTION_POLICY.timeoutAction}
                  escalateToRole={nodeResolvedQuery.data?.escalateToRole ?? workflowResolvedQuery.data?.escalateToRole ?? DEFAULT_INTERVENTION_POLICY.escalateToRole}
                  notifyChannels={nodeResolvedQuery.data?.notifyChannels ?? workflowResolvedQuery.data?.notifyChannels ?? DEFAULT_INTERVENTION_POLICY.notifyChannels}
                />
              </div>

              <form className="mt-4 space-y-4" onSubmit={nodeForm.handleSubmit(saveNodePolicy)}>
                <LegacyRoleWarning
                  testId="node-legacy-role-warning"
                  compatibility={nodeLegacyCompatibility}
                  requiresAction={nodeRequiresLegacyReview}
                />

                <Controller
                  control={nodeForm.control}
                  name="allowedRoles"
                  render={({ field }) => (
                    <RoleCheckboxGroup
                      fieldId="node-allowed-roles"
                      label="节点允许处理角色"
                      value={field.value}
                      onChange={field.onChange}
                      disabled={isReadOnly || isSaving}
                    />
                  )}
                />
                {nodeForm.formState.errors.allowedRoles ? (
                  <p className="text-sm text-error">
                    {nodeForm.formState.errors.allowedRoles.message}
                  </p>
                ) : null}

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <label htmlFor="node-timeout-seconds" className="text-sm font-medium text-foreground">
                        节点超时时间
                      </label>
                      <span className="text-xs text-muted-foreground">
                        {formatInterventionTimeoutLabel(nodeForm.watch('timeoutSeconds'))}
                      </span>
                    </div>
                    <Controller
                      control={nodeForm.control}
                      name="timeoutSeconds"
                      render={({ field }) => (
                        <Slider
                          id="node-timeout-seconds"
                          aria-label="节点超时时间"
                          min={0}
                          max={TIMEOUT_OPTIONS.length - 1}
                          step={1}
                          value={[
                            getTimeoutOptionIndex(
                              typeof field.value === 'number'
                                ? field.value
                                : DEFAULT_INTERVENTION_POLICY.timeoutSeconds,
                            ),
                          ]}
                          disabled={isReadOnly || isSaving}
                          onValueChange={(value) =>
                            field.onChange(getTimeoutSecondsFromIndex(value[0] ?? 0))
                          }
                        />
                      )}
                    />
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="node-timeout-action" className="text-sm font-medium text-foreground">
                      节点超时动作
                    </label>
                    <Controller
                      control={nodeForm.control}
                      name="timeoutAction"
                      render={({ field }) => (
                        <Select
                          value={field.value}
                          disabled={isReadOnly || isSaving}
                          onValueChange={field.onChange}
                        >
                          <SelectTrigger id="node-timeout-action" aria-label="节点超时动作">
                            <SelectValue placeholder="请选择超时动作" />
                          </SelectTrigger>
                          <SelectContent>
                            {TIMEOUT_ACTIONS.map((action) => (
                              <SelectItem key={action} value={action}>
                                {TIMEOUT_ACTION_LABELS[action]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                </div>

                {nodeAction === 'escalate' ? (
                  <div className="space-y-2">
                    <label htmlFor="node-escalate-role" className="text-sm font-medium text-foreground">
                      节点升级目标角色
                    </label>
                    <Controller
                      control={nodeForm.control}
                      name="escalateToRole"
                      render={({ field }) => (
                        <Select
                          value={field.value ?? ''}
                          disabled={isReadOnly || isSaving}
                          onValueChange={field.onChange}
                        >
                          <SelectTrigger id="node-escalate-role" aria-label="节点升级目标角色">
                            <SelectValue placeholder="请选择角色" />
                          </SelectTrigger>
                          <SelectContent>
                            {CONFIGURABLE_INTERVENTION_ROLES.map((role) => (
                              <SelectItem key={role} value={role}>
                                {INTERVENTION_ROLE_LABELS[role]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                    {nodeForm.formState.errors.escalateToRole ? (
                      <p className="text-sm text-error">
                        {nodeForm.formState.errors.escalateToRole.message}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                <Controller
                  control={nodeForm.control}
                  name="notifyChannels"
                  render={({ field }) => (
                    <NotifyChannelCheckboxGroup
                      label="节点通知渠道"
                      value={field.value}
                      onChange={field.onChange}
                      disabled={isReadOnly || isSaving}
                    />
                  )}
                />

                <div className="flex flex-wrap justify-end gap-2">
                  {selectedNodePolicy ? (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isReadOnly || isSaving}
                      onClick={() => void restoreNodePolicy()}
                    >
                      恢复节点默认策略
                    </Button>
                  ) : null}
                  <Button
                    type="submit"
                    disabled={
                      isReadOnly ||
                      isSaving ||
                      !selectedNodeId ||
                      nodeRequiresLegacyReview
                    }
                  >
                    保存节点策略
                  </Button>
                </div>
              </form>
            </>
          ) : null}
        </div>
      </div>
    </section>
  )
}
