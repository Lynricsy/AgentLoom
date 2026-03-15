import { fireEvent, render, screen } from '@testing-library/react'
import * as crypto from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkflowDefinition } from '@/features/workflow'
import type { WorkflowInputSchema } from '@/features/workflow/types'
import { clonePortDefinitions, getNodeTypeConfig } from '@/features/canvas'
import { WorkflowCanvasPage } from '../WorkflowCanvasPage'

function createNodeData(nodeType: Parameters<typeof getNodeTypeConfig>[0]) {
  const config = getNodeTypeConfig(nodeType)

  return {
    label: config.label,
    nodeType: config.type,
    category: config.category,
    description: config.description,
    config: {},
    inputPorts: clonePortDefinitions(config.inputPorts),
    outputPorts: clonePortDefinitions(config.outputPorts),
  }
}

function createJwt(payload: Record<string, unknown>) {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(payload)}.`
}

let routeWorkflowId = 'wf-001'
let authToken: string | undefined
const versionToolbarMock = vi.fn()
const interventionPolicyTabMock = vi.fn()
const triggerTabMock = vi.fn()
const workflowInputSchemaTabMock = vi.fn()
const executionLaunchDialogMock = vi.fn()
const marketplacePublishDialogMock = vi.fn()

const workflowInputSchema: WorkflowInputSchema = {
  version: 1,
  collectionMode: 'form',
  fields: [
    {
      id: 'topic',
      type: 'text',
      label: '主题',
      required: true,
    },
  ],
}

const workflow: WorkflowDefinition = {
  id: 'wf-001',
  tenantId: 'tenant-1',
  name: 'Workflow One',
  slug: 'workflow-one',
  description: null,
  nodes: [
    {
      id: 'node-agent-1',
      type: 'agent',
      position: { x: 100, y: 120 },
      data: createNodeData('llm-agent'),
    },
    {
      id: 'node-tool-1',
      type: 'tool',
      position: { x: 300, y: 120 },
      data: createNodeData('http-tool'),
    },
  ],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 },
  inputSchema: workflowInputSchema,
  version: 1,
  status: 'draft',
  publishedVersionId: null,
  createdBy: 'user-1',
  updatedBy: 'user-1',
  createdAt: '2026-03-07T00:00:00.000Z',
  updatedAt: '2026-03-07T00:00:00.000Z',
}

vi.mock('@tanstack/react-router', () => ({
  useParams: () => ({ workflowId: routeWorkflowId }),
}))

vi.mock('@/features/workflow', () => ({
  useWorkflow: () => ({ data: workflow, isLoading: false, error: null }),
}))

vi.mock('@/features/execution/hooks/useAuthToken', () => ({
  useAuthToken: () => authToken,
}))

vi.mock('@/features/execution/hooks/useExecutionMonitor', () => ({
  useExecutionMonitor: vi.fn(),
}))

vi.mock('@/features/execution/hooks/useStartExecution', () => ({
  useStartExecution: () => ({
    startExecution: vi.fn(),
    isStarting: false,
    error: null,
    reset: vi.fn(),
  }),
}))

vi.mock('@/features/execution/stores/executionStore', () => ({
  useExecutionId: () => null,
  useIsExecutionActive: () => false,
  useExecutionStatus: () => null,
}))

vi.mock('@/features/execution/components/CelebrationEffect', () => ({
  CelebrationEffect: () => null,
}))

vi.mock('@/features/execution/components/ExecutionHistoryPanel', () => ({
  ExecutionHistoryPanel: () => <div data-testid="execution-history-panel" />,
}))

vi.mock('@/features/trigger', () => ({
  TriggerTab: (props: { workflowId: string; isPublished: boolean }) => {
    triggerTabMock(props)
    return <div data-testid="trigger-tab" />
  },
}))

vi.mock('@/features/workflow-input-schema/components/WorkflowInputSchemaTab', () => ({
  WorkflowInputSchemaTab: (props: {
    workflowId: string
    workflowVersion: number
    inputSchema: WorkflowInputSchema | null
    isReadOnly: boolean
  }) => {
    workflowInputSchemaTabMock(props)
    return <div data-testid="workflow-input-schema-tab" />
  },
}))

vi.mock('@/features/marketplace', () => ({
  MarketplacePublishDialog: (props: {
    open: boolean
    workflowId: string
    onOpenChange: (open: boolean) => void
  }) => {
    marketplacePublishDialogMock(props)
    return props.open ? <div data-testid="marketplace-publish-dialog" /> : null
  },
}))

vi.mock('@/features/workflow-input-schema/components/ExecutionLaunchDialog', () => ({
  ExecutionLaunchDialog: (props: {
    open: boolean
    workflowId: string
    workflowName: string
    workflowStatus: WorkflowDefinition['status']
    draftInputSchema: WorkflowInputSchema | null
  }) => {
    executionLaunchDialogMock(props)
    return props.open ? <div data-testid="execution-launch-dialog" /> : null
  },
}))

vi.mock('@/features/intervention-policy', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/intervention-policy')>()

  return {
    ...actual,
    InterventionPolicyTab: (props: {
      workflowId: string
      workflowName: string
      nodes: WorkflowDefinition['nodes']
      isReadOnly: boolean
    }) => {
      interventionPolicyTabMock(props)
      return <div data-testid="intervention-policy-tab" />
    },
  }
})

vi.mock('../NodePalette', () => ({
  NodePalette: () => null,
}))

vi.mock('../WorkflowCanvas', () => ({
  WorkflowCanvas: () => <div data-testid="workflow-canvas" />,
}))

vi.mock('../status/WorkflowStatusBar', () => ({
  WorkflowStatusBar: () => null,
}))

vi.mock('../panels/FieldMappingPanel', () => ({
  FieldMappingPanel: () => null,
}))

vi.mock('../panels/NodeConfigPanel', () => ({
  NodeConfigPanel: () => null,
}))

vi.mock('../toolbar/VersionToolbar', () => ({
  VersionToolbar: (props: {
    onToggleInterventionPolicies?: () => void
    onToggleInputSchema?: () => void
    onToggleTriggers?: () => void
    onPublishToMarketplace?: () => void
    onRun?: () => void
    isInputSchemaOpen?: boolean
    isInterventionPoliciesOpen?: boolean
    isTriggersOpen?: boolean
  }) => {
    versionToolbarMock(props)
    return (
      <>
        <button
          type="button"
          data-testid="toggle-intervention-policy-panel"
          onClick={props.onToggleInterventionPolicies}
        >
          {props.isInterventionPoliciesOpen ? 'close-intervention' : 'open-intervention'}
        </button>
        <button
          type="button"
          data-testid="toggle-input-schema-panel"
          onClick={props.onToggleInputSchema}
        >
          {props.isInputSchemaOpen ? 'close-input-schema' : 'open-input-schema'}
        </button>
        <button
          type="button"
          data-testid="toggle-trigger-panel"
          onClick={props.onToggleTriggers}
        >
          {props.isTriggersOpen ? 'close-trigger' : 'open-trigger'}
        </button>
        {props.onPublishToMarketplace ? (
          <button
            type="button"
            data-testid="btn-publish-to-marketplace"
            onClick={props.onPublishToMarketplace}
          >
            publish-to-marketplace
          </button>
        ) : null}
        {props.onRun ? (
          <button type="button" data-testid="btn-run-workflow" onClick={props.onRun}>
            run-workflow
          </button>
        ) : null}
      </>
    )
  },
}))

vi.mock('@/features/workflow/components/PublishSheet', () => ({
  PublishSheet: () => null,
}))

vi.mock('@/features/workflow/components/VersionHistoryPanel', () => ({
  VersionHistoryPanel: () => null,
}))

vi.mock('../../hooks/useAutoSave', () => ({
  useAutoSave: vi.fn(),
}))

describe('WorkflowCanvasPage workflow settings integration', () => {
  beforeEach(() => {
    routeWorkflowId = 'wf-001'
    authToken = undefined
    workflow.status = 'draft'
    workflow.publishedVersionId = null
    workflow.inputSchema = workflowInputSchema
    vi.clearAllMocks()
  })

  it('将共享 settings panel 的 tab 状态透传给 toolbar，并在不同入口之间切换', () => {
    authToken = createJwt({ role: 'owner' })

    render(<WorkflowCanvasPage />)

    expect(versionToolbarMock).toHaveBeenCalledWith(
      expect.objectContaining({
        onToggleInterventionPolicies: expect.any(Function),
        onToggleInputSchema: expect.any(Function),
        onToggleTriggers: expect.any(Function),
        isInputSchemaOpen: false,
        isInterventionPoliciesOpen: false,
        isTriggersOpen: false,
      }),
    )

    fireEvent.click(screen.getByTestId('toggle-intervention-policy-panel'))

    expect(versionToolbarMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        isInterventionPoliciesOpen: true,
        isTriggersOpen: false,
      }),
    )

    expect(screen.getByTestId('workflow-settings-panel')).toBeInTheDocument()
    expect(screen.getByTestId('workflow-settings-content-intervention-policies')).toHaveAttribute(
      'data-active',
      'true',
    )
    expect(screen.getByTestId('workflow-settings-content-input-schema')).toHaveAttribute(
      'data-active',
      'false',
    )
    expect(screen.getByTestId('workflow-settings-content-triggers')).toHaveAttribute(
      'data-active',
      'false',
    )

    fireEvent.click(screen.getByTestId('toggle-trigger-panel'))

    expect(versionToolbarMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        isInterventionPoliciesOpen: false,
        isTriggersOpen: true,
      }),
    )
    expect(screen.getByTestId('workflow-settings-content-intervention-policies')).toHaveAttribute(
      'data-active',
      'false',
    )
    expect(screen.getByTestId('workflow-settings-content-triggers')).toHaveAttribute(
      'data-active',
      'true',
    )
    expect(triggerTabMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowId: 'wf-001',
        isPublished: false,
      }),
    )

    fireEvent.click(screen.getByTestId('toggle-input-schema-panel'))

    expect(versionToolbarMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        isInputSchemaOpen: true,
        isInterventionPoliciesOpen: false,
        isTriggersOpen: false,
      }),
    )
    expect(screen.getByTestId('workflow-settings-content-input-schema')).toHaveAttribute(
      'data-active',
      'true',
    )
    expect(workflowInputSchemaTabMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowId: 'wf-001',
        workflowVersion: 1,
        inputSchema: workflowInputSchema,
        isReadOnly: false,
      }),
    )
  })

  it('打开面板后向 InterventionPolicyTab 传递工作流与可编辑权限', () => {
    authToken = createJwt({ role: 'owner' })

    render(<WorkflowCanvasPage />)
    fireEvent.click(screen.getByTestId('toggle-intervention-policy-panel'))

    expect(screen.getByTestId('intervention-policy-tab')).toBeInTheDocument()
    expect(interventionPolicyTabMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowId: 'wf-001',
        workflowName: 'Workflow One',
        nodes: workflow.nodes,
        isReadOnly: false,
      }),
    )
  })

  it('非 owner/admin/creator 角色在面板中应为只读', () => {
    authToken = createJwt({ role: 'viewer' })

    render(<WorkflowCanvasPage />)
    fireEvent.click(screen.getByTestId('toggle-intervention-policy-panel'))
    fireEvent.click(screen.getByTestId('toggle-input-schema-panel'))

    expect(interventionPolicyTabMock).toHaveBeenCalledWith(
      expect.objectContaining({
        isReadOnly: true,
      }),
    )
    expect(workflowInputSchemaTabMock).toHaveBeenCalledWith(
      expect.objectContaining({
        isReadOnly: true,
      }),
    )
  })

  it('草稿工作流不应提供运行入口', () => {
    render(<WorkflowCanvasPage />)

    expect(screen.queryByTestId('btn-run-workflow')).not.toBeInTheDocument()
    expect(screen.queryByTestId('execution-launch-dialog')).not.toBeInTheDocument()
  })

  it('已发布工作流点击运行按钮时打开 schema-driven launch dialog', () => {
    workflow.status = 'published'
    workflow.publishedVersionId = 'ver-001'

    render(<WorkflowCanvasPage />)

    fireEvent.click(screen.getByTestId('btn-run-workflow'))

    expect(screen.getByTestId('execution-launch-dialog')).toBeInTheDocument()
    expect(executionLaunchDialogMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        open: true,
        workflowId: 'wf-001',
        workflowName: 'Workflow One',
        workflowStatus: 'published',
        draftInputSchema: workflowInputSchema,
      }),
    )
  })

  it('owner 在存在 publishedVersionId 的已发布工作流上可以看到 Marketplace CTA 并打开弹窗', () => {
    authToken = createJwt({ role: 'owner', jti: crypto.randomUUID() })
    workflow.status = 'published'
    workflow.publishedVersionId = 'ver-001'

    render(<WorkflowCanvasPage />)

    fireEvent.click(screen.getByTestId('btn-publish-to-marketplace'))

    expect(screen.getByTestId('marketplace-publish-dialog')).toBeInTheDocument()
    expect(marketplacePublishDialogMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        open: true,
        workflowId: 'wf-001',
      }),
    )
  })

  it('viewer 即使面对已发布工作流也不应看到 Marketplace CTA', () => {
    authToken = createJwt({ role: 'viewer', jti: crypto.randomUUID() })
    workflow.status = 'published'
    workflow.publishedVersionId = 'ver-001'

    render(<WorkflowCanvasPage />)

    expect(screen.queryByTestId('btn-publish-to-marketplace')).not.toBeInTheDocument()
    expect(screen.queryByTestId('marketplace-publish-dialog')).not.toBeInTheDocument()
  })

  it('缺少 publishedVersionId 时不应提供 Marketplace CTA', () => {
    authToken = createJwt({ role: 'owner', jti: crypto.randomUUID() })
    workflow.status = 'published'
    workflow.publishedVersionId = null

    render(<WorkflowCanvasPage />)

    expect(screen.queryByTestId('btn-publish-to-marketplace')).not.toBeInTheDocument()
    expect(screen.queryByTestId('marketplace-publish-dialog')).not.toBeInTheDocument()
  })
})
