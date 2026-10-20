import { useMemo } from 'react'

import { useAgentList } from '@/features/agent'
import { useWorkflowList } from '@/features/workflow'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select'
import type { GeneratedAppBindingTarget } from '../types'

/** Radix Select 不接受空串 value，用哨兵表示「由模型选择」，对外映射回 undefined */
const AUTO_BINDING = '__auto__'
/** 列表接口单页上限；候选超过这个数时只列最近更新的已发布资源 */
const CANDIDATE_PAGE_SIZE = 100

function encodeBindingTarget(target: GeneratedAppBindingTarget | undefined) {
  if (!target) {
    return AUTO_BINDING
  }

  return target.kind === 'workflow'
    ? `workflow:${target.workflowDefinitionId}`
    : `agent:${target.agentDefinitionId}`
}

function decodeBindingTarget(
  value: string,
): GeneratedAppBindingTarget | undefined {
  if (value.startsWith('workflow:')) {
    return { kind: 'workflow', workflowDefinitionId: value.slice(9) }
  }

  if (value.startsWith('agent:')) {
    return { kind: 'agent', agentDefinitionId: value.slice(6) }
  }

  return undefined
}

export interface GeneratedAppBindingTargetSelectProps {
  id: string
  /** undefined 表示由模型在本租户已发布的工作流与 Agent 中选择 */
  value: GeneratedAppBindingTarget | undefined
  onValueChange: (value: GeneratedAppBindingTarget | undefined) => void
  disabled?: boolean
}

/**
 * 生成应用的绑定目标：只列已发布（有已发布版本）的工作流与 Agent，与服务端创建校验一致；
 * 生成应用自己的 Agent 包装工作流（metadata.generatedAppId）不作为候选。
 */
export function GeneratedAppBindingTargetSelect({
  id,
  value,
  onValueChange,
  disabled,
}: GeneratedAppBindingTargetSelectProps) {
  const workflowsQuery = useWorkflowList({
    status: 'published',
    pageSize: CANDIDATE_PAGE_SIZE,
  })
  const agentsQuery = useAgentList({
    status: 'published',
    pageSize: CANDIDATE_PAGE_SIZE,
  })

  const workflows = useMemo(
    () =>
      (workflowsQuery.data?.data ?? []).filter(
        (workflow) =>
          !!workflow.publishedVersionId && !workflow.metadata?.generatedAppId,
      ),
    [workflowsQuery.data],
  )
  const agents = useMemo(
    () =>
      (agentsQuery.data?.data ?? []).filter(
        (agent) => !!agent.publishedVersionId,
      ),
    [agentsQuery.data],
  )
  const isLoading = workflowsQuery.isLoading || agentsQuery.isLoading

  return (
    <Select
      value={encodeBindingTarget(value)}
      onValueChange={(next) => onValueChange(decodeBindingTarget(next))}
      disabled={disabled}
    >
      <SelectTrigger id={id} data-testid="generated-app-binding-target-select">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={AUTO_BINDING}>
          自动（由模型在已发布的工作流与 Agent 中选择）
        </SelectItem>
        {workflows.length > 0 ? (
          <SelectGroup>
            <SelectLabel>已发布的工作流</SelectLabel>
            {workflows.map((workflow) => (
              <SelectItem key={workflow.id} value={`workflow:${workflow.id}`}>
                {workflow.name}
              </SelectItem>
            ))}
          </SelectGroup>
        ) : null}
        {agents.length > 0 ? (
          <SelectGroup>
            <SelectLabel>已发布的 Agent</SelectLabel>
            {agents.map((agent) => (
              <SelectItem key={agent.id} value={`agent:${agent.id}`}>
                {agent.name}
              </SelectItem>
            ))}
          </SelectGroup>
        ) : null}
        {!isLoading && workflows.length === 0 && agents.length === 0 ? (
          <SelectGroup>
            <SelectLabel>没有已发布的工作流或 Agent</SelectLabel>
          </SelectGroup>
        ) : null}
      </SelectContent>
    </Select>
  )
}
