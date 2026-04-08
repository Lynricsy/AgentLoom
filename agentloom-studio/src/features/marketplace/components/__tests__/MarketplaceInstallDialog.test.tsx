import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  MARKETPLACE_INSTALL_DRAFT_STORAGE_KEY,
  useMarketplaceInstallStore,
} from '../../stores/marketplaceInstallStore'

vi.mock('@radix-ui/react-dialog', async () => {
  const React = await import('react')
  const { Fragment, createContext, useContext, cloneElement, isValidElement } = React

  const DialogContext = createContext<{
    onOpenChange?: (open: boolean) => void
  } | null>(null)

  function Root({
    open,
    onOpenChange,
    children,
  }: {
    open?: boolean
    onOpenChange?: (open: boolean) => void
    children?: React.ReactNode
  }) {
    if (!open) {
      return null
    }

    return React.createElement(
      DialogContext.Provider,
      { value: { onOpenChange } },
      children,
    )
  }

  function Portal({ children }: { children?: React.ReactNode }) {
    return React.createElement(Fragment, null, children)
  }

  function Overlay(props: Record<string, unknown>) {
    return React.createElement('div', props)
  }

  function Content(props: Record<string, unknown>) {
    return React.createElement('div', { role: 'dialog', ...props })
  }

  function Title(props: Record<string, unknown>) {
    return React.createElement('h2', props)
  }

  function Description(props: Record<string, unknown>) {
    return React.createElement('p', props)
  }

  type CloseChildProps = {
    onClick?: React.MouseEventHandler
  }

  function Close({
    asChild,
    children,
  }: {
    asChild?: boolean
    children?: React.ReactNode
  }) {
    const ctx = useContext(DialogContext)
    const onOpenChange = ctx?.onOpenChange

    if (asChild && isValidElement<CloseChildProps>(children)) {
      const child = children
      return cloneElement(child, {
        onClick: (event: React.MouseEvent) => {
          child.props.onClick?.(event)
          onOpenChange?.(false)
        },
      })
    }

    return React.createElement(
      'button',
      { type: 'button', onClick: () => onOpenChange?.(false) },
      children,
    )
  }

  return { Root, Portal, Overlay, Content, Title, Description, Close }
})

const {
  installListingMock,
  preflightQueryMock,
  llmModelsQueryMock,
  workspaceQueryMock,
  persistentSandboxesQueryMock,
  navigateMock,
  notifyMock,
} = vi.hoisted(() => ({
  installListingMock: {
    mutateAsync: vi.fn(),
    isPending: false,
  },
  preflightQueryMock: {
    data: null as unknown,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  },
  llmModelsQueryMock: {
    data: [] as unknown[],
  },
  workspaceQueryMock: {
    data: [] as unknown[],
  },
  persistentSandboxesQueryMock: {
    data: [] as unknown[],
    refetch: vi.fn(),
  },
  navigateMock: vi.fn(),
  notifyMock: vi.fn(),
}))

vi.mock('../../api/publicMarketplaceMutations', () => ({
  useInstallListing: () => installListingMock,
}))

vi.mock('../../api/publicMarketplaceQueries', () => ({
  useInstallListingPreflight: () => preflightQueryMock,
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
}))

vi.mock('@/shared/ui/toast', () => ({
  useToast: () => ({ notify: notifyMock }),
}))

vi.mock('@/features/llm', () => ({
  useLlmModels: () => llmModelsQueryMock,
  GlobalModelSelector: ({
    value,
    onValueChange,
    'aria-label': ariaLabel,
  }: {
    value: string
    onValueChange: (value: string) => void
    'aria-label'?: string
  }) => (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
    >
      <option value="">请选择模型</option>
      <option value="model-target-1">Claude Sonnet 4.6</option>
      <option value="model-target-2">GPT-5.4</option>
    </select>
  ),
}))

vi.mock('@/features/workspace', () => ({
  useAllWorkspaces: () => workspaceQueryMock,
  CreateWorkspaceDialog: () => null,
}))

vi.mock('@/features/sandbox', () => ({
  usePersistentSandboxes: () => persistentSandboxesQueryMock,
  CreateSandboxDialog: ({
    open,
    onCreated,
    onOpenChange,
  }: {
    open: boolean
    onCreated?: (sandbox: {
      id: string
      executionId: null
      agentConversationId: null
      sandboxNodeId: null
      containerId: null
      status: 'creating'
      config: {
        name: string
        cpu: number
        memory: number
        disk: number
        timeout: number
        lifecycleMode: 'persistent'
      }
      workspacePath: null
      startedAt: null
      stoppedAt: null
      createdAt: string
    }) => void
    onOpenChange: (open: boolean) => void
  }) =>
    open ? (
      <button
        type="button"
        onClick={() => {
          onCreated?.({
            id: 'sandbox-target-2',
            executionId: null,
            agentConversationId: null,
            sandboxNodeId: null,
            containerId: null,
            status: 'creating',
            config: {
              name: 'QA Sandbox New',
              cpu: 1,
              memory: 512,
              disk: 2,
              timeout: 2,
              lifecycleMode: 'persistent',
            },
            workspacePath: null,
            startedAt: null,
            stoppedAt: null,
            createdAt: '2026-04-09T00:00:00.000Z',
          })
          onOpenChange(false)
        }}
      >
        完成沙箱创建
      </button>
    ) : null,
}))

const { MarketplaceInstallDialog } = await import('../MarketplaceInstallDialog')

const workflowPreflight = {
  listingType: 'workflow' as const,
  installDefaults: {
    name: 'Agent Workflow',
    description: 'Install this workflow into your workspace.',
  },
  dependencies: {
    llmModels: [
      {
        dependencyId: 'agent:model:1',
        nodeId: 'node-model-1',
        nodeType: 'llm-model' as const,
        nodeLabel: 'News Model',
        location: '工作流 / News Agent / News Model',
        provider: 'anthropic',
        modelId: 'claude-sonnet-4-6',
        modelName: 'claude-sonnet-4-6',
        modelType: 'chat' as const,
        baseUrl: 'https://models.example.test/',
        defaultModelConfigId: 'model-target-1',
      },
    ],
    workspaces: [
      {
        dependencyId: 'workflow:workspace:1',
        nodeId: 'workspace-node-1',
        nodeType: 'workspace' as const,
        nodeLabel: 'Workspace',
        location: '工作流 / Workspace',
      },
    ],
    sandboxes: [
      {
        dependencyId: 'workflow:sandbox:1',
        nodeId: 'sandbox-node-1',
        nodeType: 'sandbox' as const,
        nodeLabel: 'Sandbox',
        location: '工作流 / Sandbox',
        linkedWorkspaceDependencyId: 'workflow:workspace:1',
        required: true,
      },
    ],
  },
  blockers: [],
}

describe('MarketplaceInstallDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.sessionStorage.clear()
    useMarketplaceInstallStore.getState().clearDraft()

    installListingMock.mutateAsync = vi.fn()
    installListingMock.isPending = false
    preflightQueryMock.data = workflowPreflight
    preflightQueryMock.isLoading = false
    preflightQueryMock.isError = false
    preflightQueryMock.refetch = vi.fn()
    llmModelsQueryMock.data = [
      {
        id: 'model-target-1',
        name: 'Claude Sonnet 4.6',
        modelId: 'claude-sonnet-4-6',
        modelName: 'claude-sonnet-4-6',
        modelType: 'chat',
        isEnabled: true,
      },
    ]
    workspaceQueryMock.data = [
      {
        id: 'workspace-target-1',
        name: 'QA Workspace',
        description: null,
        storageKey: 'workspace.tar.gz',
        sizeBytes: 128,
        status: 'ready',
        config: null,
        createdAt: '2026-04-09T00:00:00.000Z',
        updatedAt: '2026-04-09T00:00:00.000Z',
      },
    ]
    persistentSandboxesQueryMock.data = [
      {
        id: 'sandbox-target-1',
        executionId: null,
        agentConversationId: null,
        sandboxNodeId: null,
        containerId: null,
        status: 'ready',
        config: {
          name: 'QA Sandbox',
          cpu: 1,
          memory: 512,
          disk: 2,
          timeout: 2,
          lifecycleMode: 'persistent',
        },
        workspacePath: null,
        startedAt: null,
        stoppedAt: null,
        createdAt: '2026-04-09T00:00:00.000Z',
      },
    ]
    persistentSandboxesQueryMock.refetch = vi.fn()
  })

  it('pre-fills the form and renders workflow dependency sections', async () => {
    render(
      <MarketplaceInstallDialog
        listingId="listing-1"
        listingTitle="Agent Workflow"
        listingSummary="Install this workflow into your workspace."
        listingType="workflow"
        sourcePage="discover"
        open={true}
        onOpenChange={vi.fn()}
      />,
    )

    expect(screen.getByLabelText('工作流名称')).toHaveValue('Agent Workflow 副本')
    expect(screen.getByLabelText(/描述/)).toHaveValue(
      'Install this workflow into your workspace.',
    )
    expect(screen.getByText('模型绑定')).toBeInTheDocument()
    expect(screen.getByText('工作区绑定')).toBeInTheDocument()
    expect(screen.getByText('持久沙箱绑定')).toBeInTheDocument()

    await waitFor(() => {
      expect(
        screen.getByLabelText('选择模型 工作流 / News Agent / News Model'),
      ).toHaveValue('model-target-1')
    })
  })

  it('submits workflow install request with bindings and navigates on success', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    installListingMock.mutateAsync.mockResolvedValue({
      workflowDefinitionId: 'workflow-1',
      name: 'Agent Workflow 副本',
      message: 'Workflow installed successfully',
    })

    render(
      <MarketplaceInstallDialog
        listingId="listing-1"
        listingTitle="Agent Workflow"
        listingSummary="Install this workflow into your workspace."
        listingType="workflow"
        sourcePage="discover"
        open={true}
        onOpenChange={onOpenChange}
      />,
    )

    await waitFor(() => {
      expect(
        screen.getByLabelText('选择模型 工作流 / News Agent / News Model'),
      ).toHaveValue('model-target-1')
    })

    await user.selectOptions(
      screen.getByLabelText('选择工作区 工作流 / Workspace'),
      'workspace-target-1',
    )
    await user.selectOptions(
      screen.getByLabelText('选择持久沙箱 工作流 / Sandbox'),
      'sandbox-target-1',
    )
    await user.click(screen.getByRole('button', { name: '确认安装' }))

    await waitFor(() => {
      expect(installListingMock.mutateAsync).toHaveBeenCalledWith({
        id: 'listing-1',
        body: {
          name: 'Agent Workflow 副本',
          description: 'Install this workflow into your workspace.',
          bindings: {
            llmModels: {
              'agent:model:1': 'model-target-1',
            },
            workspaces: {
              'workflow:workspace:1': 'workspace-target-1',
            },
            sandboxes: {
              'workflow:sandbox:1': 'sandbox-target-1',
            },
          },
        },
      })
    })

    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(navigateMock).toHaveBeenCalledWith({
      to: '/workflows/$workflowId',
      params: { workflowId: 'workflow-1' },
    })
    expect(useMarketplaceInstallStore.getState().draft).toBeNull()
    expect(
      window.sessionStorage.getItem(MARKETPLACE_INSTALL_DRAFT_STORAGE_KEY),
    ).toBeNull()
  })

  it('saves draft and navigates to model page when no model is available', async () => {
    const user = userEvent.setup()
    llmModelsQueryMock.data = []

    render(
      <MarketplaceInstallDialog
        listingId="listing-1"
        listingTitle="Agent Workflow"
        listingSummary="Install this workflow into your workspace."
        listingType="workflow"
        sourcePage="discover"
        open={true}
        onOpenChange={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(
        screen.getByLabelText('选择模型 工作流 / News Agent / News Model'),
      ).toHaveValue('model-target-1')
    })

    await user.click(screen.getByRole('button', { name: '去配置模型' }))

    expect(navigateMock).toHaveBeenCalledWith({ to: '/resources/llm-models' })
    expect(useMarketplaceInstallStore.getState().draft).toEqual({
      sourcePage: 'discover',
      listingId: 'listing-1',
      form: {
        name: 'Agent Workflow 副本',
        description: 'Install this workflow into your workspace.',
      },
      selections: {
        llmModels: {
          'agent:model:1': 'model-target-1',
        },
        workspaces: {},
        sandboxes: {},
      },
    })
  })

  it('submits install request for plugin without workflow bindings', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    installListingMock.mutateAsync.mockResolvedValue({
      pluginDbId: 'plugin-db-1',
      pluginId: 'text-uppercase',
      name: 'Text Uppercase 副本',
      message: 'Plugin installed successfully',
    })

    render(
      <MarketplaceInstallDialog
        listingId="listing-plugin-1"
        listingTitle="Text Uppercase"
        listingSummary="Converts text to uppercase."
        listingType="plugin"
        sourcePage="discover"
        open={true}
        onOpenChange={onOpenChange}
      />,
    )

    await user.click(screen.getByRole('button', { name: '确认安装' }))

    await waitFor(() => {
      expect(installListingMock.mutateAsync).toHaveBeenCalledWith({
        id: 'listing-plugin-1',
        body: {
          name: 'Text Uppercase 副本',
          description: 'Converts text to uppercase.',
        },
      })
    })

    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it('allows optional sandbox bindings to be left empty', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    installListingMock.mutateAsync.mockResolvedValue({
      workflowDefinitionId: 'workflow-2',
      name: 'Agent Workflow 副本',
      message: 'Workflow installed successfully',
    })
    preflightQueryMock.data = {
      ...workflowPreflight,
      dependencies: {
        ...workflowPreflight.dependencies,
        sandboxes: workflowPreflight.dependencies.sandboxes.map((dependency) => ({
          ...dependency,
          required: false,
        })),
      },
    }

    render(
      <MarketplaceInstallDialog
        listingId="listing-1"
        listingTitle="Agent Workflow"
        listingSummary="Install this workflow into your workspace."
        listingType="workflow"
        sourcePage="discover"
        open={true}
        onOpenChange={onOpenChange}
      />,
    )

    await waitFor(() => {
      expect(
        screen.getByLabelText('选择模型 工作流 / News Agent / News Model'),
      ).toHaveValue('model-target-1')
    })

    await user.selectOptions(
      screen.getByLabelText('选择工作区 工作流 / Workspace'),
      'workspace-target-1',
    )
    await user.click(screen.getByRole('button', { name: '确认安装' }))

    await waitFor(() => {
      expect(installListingMock.mutateAsync).toHaveBeenCalledWith({
        id: 'listing-1',
        body: {
          name: 'Agent Workflow 副本',
          description: 'Install this workflow into your workspace.',
          bindings: {
            llmModels: {
              'agent:model:1': 'model-target-1',
            },
            workspaces: {
              'workflow:workspace:1': 'workspace-target-1',
            },
          },
        },
      })
    })

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('tracks newly created persistent sandbox until it becomes installable', async () => {
    const user = userEvent.setup()

    const { rerender } = render(
      <MarketplaceInstallDialog
        listingId="listing-1"
        listingTitle="Agent Workflow"
        listingSummary="Install this workflow into your workspace."
        listingType="workflow"
        sourcePage="discover"
        open={true}
        onOpenChange={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(
        screen.getByLabelText('选择模型 工作流 / News Agent / News Model'),
      ).toHaveValue('model-target-1')
    })

    await user.selectOptions(
      screen.getByLabelText('选择工作区 工作流 / Workspace'),
      'workspace-target-1',
    )
    await user.click(screen.getAllByRole('button', { name: '新建' })[1]!)
    await user.click(screen.getByRole('button', { name: '完成沙箱创建' }))

    expect(persistentSandboxesQueryMock.refetch).toHaveBeenCalled()
    expect(
      screen.getByLabelText('选择持久沙箱 工作流 / Sandbox'),
    ).toHaveValue('sandbox-target-2')
    expect(screen.getByText('QA Sandbox New（创建中），准备完成后才能继续安装。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确认安装' })).toBeDisabled()

    persistentSandboxesQueryMock.data = [
      ...persistentSandboxesQueryMock.data,
      {
        id: 'sandbox-target-2',
        executionId: null,
        agentConversationId: null,
        sandboxNodeId: null,
        containerId: 'container-2',
        status: 'ready',
        config: {
          name: 'QA Sandbox New',
          cpu: 1,
          memory: 512,
          disk: 2,
          timeout: 2,
          lifecycleMode: 'persistent',
        },
        workspacePath: null,
        startedAt: '2026-04-09T00:00:03.000Z',
        stoppedAt: null,
        createdAt: '2026-04-09T00:00:00.000Z',
      },
    ]

    rerender(
      <MarketplaceInstallDialog
        listingId="listing-1"
        listingTitle="Agent Workflow"
        listingSummary="Install this workflow into your workspace."
        listingType="workflow"
        sourcePage="discover"
        open={true}
        onOpenChange={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(
        screen.queryByText('QA Sandbox New（创建中），准备完成后才能继续安装。'),
      ).not.toBeInTheDocument()
    })
    expect(
      screen.getByRole('option', { name: 'QA Sandbox New' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确认安装' })).not.toBeDisabled()
  })
})
