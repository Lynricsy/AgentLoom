/**
 * 共享面板注册表 — 单一数据源
 *
 * NodeConfigPanel (workflow canvas) 和 AgentNodeConfigPanel (agent canvas)
 * 都从这里查表，避免面板分发逻辑重复。
 *
 * 提取为独立文件以避免循环引用：
 *   agent-canvas/AgentNodeConfigPanel → 本文件 (OK)
 *   canvas/NodeConfigPanel → 本文件 (OK)
 *   本文件 → agent-canvas/SkillPanel (单向，无环)
 */
import type React from 'react'
import {
  LlmModelConfigPanel,
  parseLlmModelConfig,
  type LlmNodeDataPatch,
} from '@/features/llm'
import type { CanvasNode } from '../../types'
import { McpToolConfigPanel } from './McpToolConfigPanel'
import { KnowledgeBaseConfigPanel } from './KnowledgeBaseConfigPanel'
import { SandboxConfigPanel } from './SandboxConfigPanel'
import { HttpToolConfigPanel } from './HttpToolConfigPanel'
import { CodeToolConfigPanel } from './CodeToolConfigPanel'
import { ReusableBlockPanel } from './ReusableBlockPanel'
import { SmartRoutingConfigPanel } from './SmartRoutingConfigPanel'
import { PluginConfigPanel } from './PluginConfigPanel'
import { AgentNodeConfigPanel } from './AgentNodeConfigPanel'
import { MemoryConfigPanel } from './MemoryConfigPanel'
import { WorkspaceConfigPanel } from './WorkspaceConfigPanel'
import { InputPreprocessorConfigPanel } from './InputPreprocessorConfigPanel'
import { ConditionConfigPanel } from './ConditionConfigPanel'
import { LoopConfigPanel } from './LoopConfigPanel'
import { MergeConfigPanel } from './MergeConfigPanel'
import { ScheduleTriggerConfigPanel } from './ScheduleTriggerConfigPanel'
import { WebhookTriggerConfigPanel } from './WebhookTriggerConfigPanel'
import { ApiEventTriggerConfigPanel } from './ApiEventTriggerConfigPanel'
import { SkillPanel } from '../../../agent-canvas/components/panels/SkillPanel'
import { SubAgentConfigPanel } from '../../../agent-canvas/components/panels/SubAgentConfigPanel'

export interface CustomPanelRendererProps {
  node: CanvasNode
  onConfigChange: (patch: Record<string, unknown>) => void
  onValidationChange: (hasErrors: boolean) => void
}

export interface CustomPanelEntry {
  handlesValidation?: boolean
  render: (props: CustomPanelRendererProps) => React.ReactNode
}

export const CUSTOM_PANEL_REGISTRY: Partial<Record<string, CustomPanelEntry>> = {
  'llm-model': {
    render: ({ node, onConfigChange }) => {
      const handleLlmChange = (patch: LlmNodeDataPatch) => {
        onConfigChange(patch as unknown as Record<string, unknown>)
      }

      return (
        <LlmModelConfigPanel
          config={parseLlmModelConfig(node.data)}
          onApply={handleLlmChange}
        />
      )
    },
  },
  'mcp-tool': {
    render: ({ node, onConfigChange }) => (
      <McpToolConfigPanel
        data={node.data}
        onApply={onConfigChange}
      />
    ),
  },
  'knowledge-base': {
    handlesValidation: true,
    render: ({ node, onConfigChange, onValidationChange }) => (
      <KnowledgeBaseConfigPanel
        config={node.data.config}
        onApply={onConfigChange}
        onValidationChange={onValidationChange}
      />
    ),
  },
  sandbox: {
    render: ({ node, onConfigChange }) => (
      <SandboxConfigPanel
        config={node.data.config}
        onApply={onConfigChange}
      />
    ),
  },
  'http-tool': {
    handlesValidation: true,
    render: ({ node, onConfigChange, onValidationChange }) => (
      <HttpToolConfigPanel
        config={node.data.config}
        onApply={onConfigChange}
        onValidationChange={onValidationChange}
      />
    ),
  },
  'code-tool': {
    handlesValidation: true,
    render: ({ node, onConfigChange, onValidationChange }) => (
      <CodeToolConfigPanel
        config={node.data.config}
        onApply={onConfigChange}
        onValidationChange={onValidationChange}
      />
    ),
  },
  'reusable-block': {
    render: ({ node, onConfigChange }) => (
      <ReusableBlockPanel data={node.data} onApply={onConfigChange} />
    ),
  },
  'smart-routing': {
    render: ({ node, onConfigChange }) => (
      <SmartRoutingConfigPanel node={node} onConfigChange={onConfigChange} />
    ),
  },
  'plugin': {
    handlesValidation: true,
    render: ({ node, onConfigChange }) => (
      <PluginConfigPanel node={node} onConfigChange={onConfigChange} />
    ),
  },
  'agent': {
    render: ({ node, onConfigChange }) => (
      <AgentNodeConfigPanel
        config={node.data.config}
        onApply={onConfigChange}
      />
    ),
  },
  'memory': {
    handlesValidation: true,
    render: ({ node, onConfigChange, onValidationChange }) => (
      <MemoryConfigPanel
        config={node.data.config}
        onApply={onConfigChange}
        onValidationChange={onValidationChange}
      />
    ),
  },
  'workspace': {
    render: ({ node, onConfigChange }) => (
      <WorkspaceConfigPanel
        config={node.data.config}
        onApply={onConfigChange}
      />
    ),
  },
  'skill': {
    render: ({ node, onConfigChange }) => (
      <SkillPanel
        config={node.data.config}
        onApply={(config) => onConfigChange({ config })}
      />
    ),
  },
  'sub-agent': {
    render: ({ node, onConfigChange }) => (
      <SubAgentConfigPanel
        config={node.data.config}
        onApply={(config) => onConfigChange({ config })}
      />
    ),
  },
  'input-preprocessor': {
    render: ({ node, onConfigChange }) => (
      <InputPreprocessorConfigPanel
        config={node.data.config}
        onApply={onConfigChange}
      />
    ),
  },
  'condition': {
    render: ({ node, onConfigChange }) => (
      <ConditionConfigPanel
        config={node.data.config}
        onApply={onConfigChange}
      />
    ),
  },
  'loop': {
    render: ({ node, onConfigChange }) => (
      <LoopConfigPanel
        config={node.data.config}
        onApply={onConfigChange}
      />
    ),
  },
  'merge': {
    render: ({ node, onConfigChange }) => (
      <MergeConfigPanel
        config={node.data.config}
        onApply={onConfigChange}
      />
    ),
  },
  'schedule-trigger': {
    render: ({ node, onConfigChange }) => (
      <ScheduleTriggerConfigPanel
        config={node.data.config}
        onApply={onConfigChange}
      />
    ),
  },
  'webhook-trigger': {
    render: ({ node, onConfigChange }) => (
      <WebhookTriggerConfigPanel
        config={node.data.config}
        onApply={onConfigChange}
      />
    ),
  },
  'api-event-trigger': {
    render: ({ node, onConfigChange }) => (
      <ApiEventTriggerConfigPanel
        config={node.data.config}
        onApply={onConfigChange}
      />
    ),
  },
}
