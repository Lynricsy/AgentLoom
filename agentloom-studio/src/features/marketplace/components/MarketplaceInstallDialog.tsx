import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import * as Dialog from '@radix-ui/react-dialog'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from '@tanstack/react-router'
import {
  AlertTriangle,
  Bot,
  Container,
  FolderOpen,
  Loader2,
  Plus,
  Settings,
  X,
} from 'lucide-react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import {
  GlobalModelSelector,
  useLlmModels,
} from '@/features/llm'
import {
  CreateSandboxDialog,
  usePersistentSandboxes,
} from '@/features/sandbox'
import type { SandboxSession } from '@/features/sandbox'
import {
  CreateWorkspaceDialog,
  useAllWorkspaces,
} from '@/features/workspace'
import type { Workspace } from '@/features/workspace'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Select } from '@/shared/ui/select'
import { useToast } from '@/shared/ui/toast'
import { useInstallListing } from '../api/publicMarketplaceMutations'
import { useInstallListingPreflight } from '../api/publicMarketplaceQueries'
import { useMarketplaceInstallStore } from '../stores/marketplaceInstallStore'
import type {
  MarketplaceListingType,
  MarketplaceWorkflowInstallPreflightResponse,
  WorkflowInstallBindings,
} from '../types'

const workflowInstallFormSchema = z.object({
  name: z.string().min(1, '请输入工作流名称').max(255),
  description: z.string().max(2000).optional(),
})

const pluginInstallFormSchema = z.object({
  name: z.string().min(1, '请输入名称').max(255),
  description: z.string().max(2000).optional(),
})

type InstallFormValues = z.infer<typeof workflowInstallFormSchema>

type BindingSelections = {
  llmModels: Record<string, string>
  workspaces: Record<string, string>
  sandboxes: Record<string, string>
}

const INSTALLABLE_PERSISTENT_SANDBOX_STATUSES = new Set<
  SandboxSession['status']
>(['ready', 'busy', 'stopped'])

const TRANSITIONAL_PERSISTENT_SANDBOX_STATUSES = new Set<
  SandboxSession['status']
>(['creating', 'stopping'])

interface MarketplaceInstallDialogProps {
  listingId: string
  listingTitle: string
  listingSummary?: string
  listingType: MarketplaceListingType
  sourcePage: 'discover' | 'marketplace'
  open: boolean
  onOpenChange: (open: boolean) => void
}

function getDefaultName(listingTitle: string) {
  return listingTitle ? `${listingTitle} 副本` : ''
}

function getDefaultDescription(listingSummary?: string) {
  return listingSummary ?? ''
}

function createEmptySelections(): BindingSelections {
  return {
    llmModels: {},
    workspaces: {},
    sandboxes: {},
  }
}

function compactBindingMap(value: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(value).filter(([, selectedId]) => selectedId.trim().length > 0),
  )
}

function toInstallBindings(
  selections: BindingSelections,
): WorkflowInstallBindings | undefined {
  const llmModels = compactBindingMap(selections.llmModels)
  const workspaces = compactBindingMap(selections.workspaces)
  const sandboxes = compactBindingMap(selections.sandboxes)

  if (
    Object.keys(llmModels).length === 0 &&
    Object.keys(workspaces).length === 0 &&
    Object.keys(sandboxes).length === 0
  ) {
    return undefined
  }

  return {
    ...(Object.keys(llmModels).length > 0 ? { llmModels } : {}),
    ...(Object.keys(workspaces).length > 0 ? { workspaces } : {}),
    ...(Object.keys(sandboxes).length > 0 ? { sandboxes } : {}),
  }
}

function buildInitialSelections(
  preflight: MarketplaceWorkflowInstallPreflightResponse,
  savedSelections?: BindingSelections,
): BindingSelections {
  const next = createEmptySelections()

  for (const dependency of preflight.dependencies.llmModels) {
    const selectedId =
      savedSelections?.llmModels[dependency.dependencyId] ??
      dependency.defaultModelConfigId ??
      ''
    if (selectedId) {
      next.llmModels[dependency.dependencyId] = selectedId
    }
  }

  for (const dependency of preflight.dependencies.workspaces) {
    const selectedId =
      savedSelections?.workspaces[dependency.dependencyId] ?? ''
    if (selectedId) {
      next.workspaces[dependency.dependencyId] = selectedId
    }
  }

  for (const dependency of preflight.dependencies.sandboxes) {
    const selectedId =
      savedSelections?.sandboxes[dependency.dependencyId] ?? ''
    if (selectedId) {
      next.sandboxes[dependency.dependencyId] = selectedId
    }
  }

  return next
}

function formatPersistentSandboxLabel(sandbox: SandboxSession): string {
  const name = sandbox.config.name ?? sandbox.id
  if (sandbox.status === 'creating') {
    return `${name}（创建中）`
  }
  if (sandbox.status === 'stopping') {
    return `${name}（停止中）`
  }
  if (sandbox.status === 'failed') {
    return `${name}（失败）`
  }
  return name
}

function DependencySection({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <section className="space-y-3 rounded-xl border border-border/70 bg-card/40 p-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 text-muted-foreground">{icon}</div>
        <div className="space-y-1">
          <h3 className="text-sm font-medium text-foreground">{title}</h3>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  )
}

export const MarketplaceInstallDialog = memo(function MarketplaceInstallDialog({
  listingId,
  listingTitle,
  listingSummary,
  listingType,
  sourcePage,
  open,
  onOpenChange,
}: MarketplaceInstallDialogProps) {
  const navigate = useNavigate()
  const { notify } = useToast()
  const installListing = useInstallListing()
  const preflightQuery = useInstallListingPreflight(
    open && listingType === 'workflow' ? listingId : null,
  )
  const modelsQuery = useLlmModels()
  const workspacesQuery = useAllWorkspaces()
  const persistentSandboxesQuery = usePersistentSandboxes()
  const savedDraft = useMarketplaceInstallStore((state) => state.draft)
  const saveDraft = useMarketplaceInstallStore((state) => state.saveDraft)
  const clearDraft = useMarketplaceInstallStore((state) => state.clearDraft)
  const isPlugin = listingType === 'plugin'
  const resumeDraft =
    savedDraft &&
    savedDraft.listingId === listingId &&
    savedDraft.sourcePage === sourcePage
      ? savedDraft
      : null

  const {
    register,
    handleSubmit,
    reset,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<InstallFormValues>({
    resolver: zodResolver(
      isPlugin ? pluginInstallFormSchema : workflowInstallFormSchema,
    ),
    defaultValues: {
      name: getDefaultName(listingTitle),
      description: getDefaultDescription(listingSummary),
    },
  })

  const [selectedBindings, setSelectedBindings] = useState<BindingSelections>(
    createEmptySelections,
  )
  const [showValidation, setShowValidation] = useState(false)
  const [workspaceCreationTargetId, setWorkspaceCreationTargetId] = useState<
    string | null
  >(null)
  const [sandboxCreationTargetId, setSandboxCreationTargetId] = useState<
    string | null
  >(null)
  const [createdPersistentSandboxes, setCreatedPersistentSandboxes] = useState<
    SandboxSession[]
  >([])

  const workflowPreflight = useMemo(
    () =>
      !isPlugin && preflightQuery.data?.listingType === 'workflow'
        ? preflightQuery.data
        : null,
    [isPlugin, preflightQuery.data],
  )
  const enabledModels = useMemo(
    () => (modelsQuery.data ?? []).filter((model) => model.isEnabled),
    [modelsQuery.data],
  )
  const readyWorkspaces = useMemo(
    () => (workspacesQuery.data ?? []).filter((workspace) => workspace.status === 'ready'),
    [workspacesQuery.data],
  )
  const persistentSandboxMap = useMemo(
    () => {
      const merged = new Map<string, SandboxSession>()
      for (const sandbox of createdPersistentSandboxes) {
        merged.set(sandbox.id, sandbox)
      }
      for (const sandbox of persistentSandboxesQuery.data ?? []) {
        merged.set(sandbox.id, sandbox)
      }

      return merged
    },
    [createdPersistentSandboxes, persistentSandboxesQuery.data],
  )
  const transitioningCreatedSandboxIds = useMemo(
    () =>
      createdPersistentSandboxes
        .map((sandbox) => persistentSandboxMap.get(sandbox.id) ?? sandbox)
        .filter((sandbox) =>
          TRANSITIONAL_PERSISTENT_SANDBOX_STATUSES.has(sandbox.status),
        )
        .map((sandbox) => sandbox.id),
    [createdPersistentSandboxes, persistentSandboxMap],
  )
  const visiblePersistentSandboxIds = useMemo(() => {
    const ids = new Set<string>()

    for (const sandbox of persistentSandboxMap.values()) {
      if (INSTALLABLE_PERSISTENT_SANDBOX_STATUSES.has(sandbox.status)) {
        ids.add(sandbox.id)
      }
    }

    for (const sandboxId of Object.values(selectedBindings.sandboxes)) {
      if (!sandboxId) {
        continue
      }
      const sandbox = persistentSandboxMap.get(sandboxId)
      if (sandbox) {
        ids.add(sandboxId)
      }
    }

    return ids
  }, [persistentSandboxMap, selectedBindings.sandboxes])
  const availablePersistentSandboxes = useMemo(
    () =>
      Array.from(visiblePersistentSandboxIds)
        .map((sandboxId) => persistentSandboxMap.get(sandboxId))
        .filter((sandbox): sandbox is SandboxSession => sandbox !== undefined),
    [persistentSandboxMap, visiblePersistentSandboxIds],
  )
  const pendingSelectedSandboxDependencyIds = useMemo(() => {
    if (!workflowPreflight) {
      return [] as string[]
    }

    return workflowPreflight.dependencies.sandboxes
      .filter((dependency) => {
        const selectedSandboxId =
          selectedBindings.sandboxes[dependency.dependencyId] ?? ''
        if (!selectedSandboxId) {
          return false
        }
        const selectedSandbox = persistentSandboxMap.get(selectedSandboxId)
        if (!selectedSandbox) {
          return false
        }
        return !INSTALLABLE_PERSISTENT_SANDBOX_STATUSES.has(selectedSandbox.status)
      })
      .map((dependency) => dependency.dependencyId)
    },
    [persistentSandboxMap, selectedBindings.sandboxes, workflowPreflight],
  )
  const missingRequirements = useMemo(() => {
    if (!workflowPreflight) {
      return {
        llmModels: [] as string[],
        workspaces: [] as string[],
        sandboxes: [] as string[],
      }
    }

    return {
      llmModels: workflowPreflight.dependencies.llmModels
        .filter((dependency) => !selectedBindings.llmModels[dependency.dependencyId])
        .map((dependency) => dependency.dependencyId),
      workspaces: workflowPreflight.dependencies.workspaces
        .filter((dependency) => !selectedBindings.workspaces[dependency.dependencyId])
        .map((dependency) => dependency.dependencyId),
      sandboxes: workflowPreflight.dependencies.sandboxes
        .filter(
          (dependency) =>
            dependency.required &&
            !selectedBindings.sandboxes[dependency.dependencyId],
        )
        .map((dependency) => dependency.dependencyId),
    }
  }, [selectedBindings, workflowPreflight])

  useEffect(() => {
    if (!open || transitioningCreatedSandboxIds.length === 0) {
      return
    }

    const intervalId = window.setInterval(() => {
      void persistentSandboxesQuery.refetch()
    }, 2_000)

    return () => window.clearInterval(intervalId)
  }, [open, persistentSandboxesQuery, transitioningCreatedSandboxIds.length])

  useEffect(() => {
    if (!open) {
      return
    }

    reset({
      name: resumeDraft?.form.name ?? getDefaultName(listingTitle),
      description:
        resumeDraft?.form.description ?? getDefaultDescription(listingSummary),
    })
    setShowValidation(false)
  }, [open, listingId, listingSummary, listingTitle, reset, resumeDraft])

  useEffect(() => {
    if (!open || isPlugin || !workflowPreflight) {
      return
    }

    setSelectedBindings(
      buildInitialSelections(workflowPreflight, resumeDraft?.selections),
    )
  }, [open, isPlugin, workflowPreflight, resumeDraft])

  const handleDialogOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        clearDraft()
        setSelectedBindings(createEmptySelections())
        setShowValidation(false)
        setWorkspaceCreationTargetId(null)
        setSandboxCreationTargetId(null)
        setCreatedPersistentSandboxes([])
      }

      onOpenChange(nextOpen)
    },
    [clearDraft, onOpenChange],
  )

  const updateBinding = useCallback(
    (
      kind: keyof BindingSelections,
      dependencyId: string,
      value: string,
    ) => {
      setSelectedBindings((current) => {
        const nextKind = { ...current[kind] }
        if (value) {
          nextKind[dependencyId] = value
        } else {
          delete nextKind[dependencyId]
        }

        return {
          ...current,
          [kind]: nextKind,
        }
      })
    },
    [],
  )

  const handleGoToModelConfig = useCallback(() => {
    saveDraft({
      sourcePage,
      listingId,
      form: {
        name: getValues('name'),
        description: getValues('description') ?? '',
      },
      selections: selectedBindings,
    })
    navigate({ to: '/resources/llm-models' })
  }, [getValues, listingId, navigate, saveDraft, selectedBindings, sourcePage])

  const handleWorkspaceCreated = useCallback(
    (workspace: Workspace) => {
      if (!workspaceCreationTargetId) {
        return
      }

      updateBinding('workspaces', workspaceCreationTargetId, workspace.id)
      setWorkspaceCreationTargetId(null)
    },
    [updateBinding, workspaceCreationTargetId],
  )

  const handleSandboxCreated = useCallback(
    (sandbox: SandboxSession) => {
      if (!sandboxCreationTargetId) {
        return
      }

      setCreatedPersistentSandboxes((current) => [
        sandbox,
        ...current.filter((item) => item.id !== sandbox.id),
      ])
      updateBinding('sandboxes', sandboxCreationTargetId, sandbox.id)
      setSandboxCreationTargetId(null)
      void persistentSandboxesQuery.refetch()
    },
    [persistentSandboxesQuery, sandboxCreationTargetId, updateBinding],
  )

  const onSubmit = useCallback(
    async (values: InstallFormValues) => {
      if (!isPlugin) {
        if (preflightQuery.isLoading || preflightQuery.isError || !workflowPreflight) {
          notify({
            title: '依赖检查尚未完成',
            description: '请等待安装预检完成后再继续。',
            variant: 'error',
          })
          return
        }

        if (
          workflowPreflight.blockers.length > 0 ||
          missingRequirements.llmModels.length > 0 ||
          missingRequirements.workspaces.length > 0 ||
          missingRequirements.sandboxes.length > 0
        ) {
          setShowValidation(true)
          notify({
            title: '安装配置未完成',
            description: '请先完成必需的模型、工作区和持久沙箱绑定后再安装。',
            variant: 'error',
          })
          return
        }
      }

      try {
        if (pendingSelectedSandboxDependencyIds.length > 0) {
          setShowValidation(true)
          notify({
            title: '持久沙箱仍在准备中',
            description: '请等待新建的持久沙箱准备完成后再安装，这样安装后的工作流才能直接运行。',
            variant: 'error',
          })
          return
        }

        const result = await installListing.mutateAsync({
          id: listingId,
          body: {
            name: values.name,
            description: values.description?.trim() || undefined,
            ...(!isPlugin
              ? {
                  bindings: toInstallBindings(selectedBindings),
                }
              : {}),
          },
        })

        clearDraft()
        handleDialogOpenChange(false)
        reset({
          name: getDefaultName(listingTitle),
          description: getDefaultDescription(listingSummary),
        })
        notify({
          title: '安装成功',
          description: `"${result.name}" 已添加到你的工作区。`,
          variant: 'success',
        })

        if ('workflowDefinitionId' in result) {
          navigate({
            to: '/workflows/$workflowId',
            params: { workflowId: result.workflowDefinitionId },
          })
        }
      } catch (error) {
        notify({
          title: '安装失败',
          description: isPlugin
            ? '无法安装这个插件，请稍后重试。'
            : error instanceof Error
              ? error.message
              : '无法安装这个工作流，请稍后重试。',
          variant: 'error',
        })
      }
    },
    [
      clearDraft,
      handleDialogOpenChange,
      installListing,
      isPlugin,
      listingId,
      listingSummary,
      listingTitle,
      missingRequirements.llmModels.length,
      missingRequirements.sandboxes.length,
      missingRequirements.workspaces.length,
      navigate,
      notify,
      pendingSelectedSandboxDependencyIds.length,
      preflightQuery.isError,
      preflightQuery.isLoading,
      reset,
      selectedBindings,
      workflowPreflight,
    ],
  )

  const isPending =
    isSubmitting || installListing.isPending || (!isPlugin && preflightQuery.isLoading)
  const entityLabel = isPlugin ? '插件' : '工作流'

  return (
    <>
      <Dialog.Root open={open} onOpenChange={handleDialogOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
          <Dialog.Content
            className="fixed left-1/2 top-1/2 z-[80] flex max-h-[90vh] w-full max-w-4xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-border bg-surface p-6 shadow-xl data-[state=open]:animate-in data-[state=open]:zoom-in-95 data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:zoom-out-95 data-[state=closed]:fade-out-0"
            data-testid="marketplace-install-dialog"
          >
            <Dialog.Close className="absolute right-3 top-3 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
              <X className="h-4 w-4" />
            </Dialog.Close>

            <Dialog.Title className="text-base font-medium">
              安装 Marketplace {entityLabel}
            </Dialog.Title>
            <Dialog.Description className="mt-1 text-sm text-muted-foreground">
              {isPlugin
                ? `将 "${listingTitle}" 安装到你的工作区后，可以在工作流画布中使用该插件节点。`
                : `复制 "${listingTitle}" 到你的工作区后，你可以直接运行，也可以继续编辑节点绑定。`}
            </Dialog.Description>

            <form
              onSubmit={handleSubmit(onSubmit)}
              className="mt-5 flex min-h-0 flex-1 flex-col"
            >
              <div className="flex-1 space-y-4 overflow-y-auto pr-1">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label htmlFor="install-name" className="mb-1.5 block text-sm font-medium">
                      {entityLabel}名称
                    </label>
                    <Input
                      id="install-name"
                      {...register('name')}
                      placeholder={`输入${entityLabel}名称`}
                    />
                    {errors.name ? (
                      <p className="mt-1 text-xs text-red-500">{errors.name.message}</p>
                    ) : null}
                  </div>

                  <div>
                    <label
                      htmlFor="install-description"
                      className="mb-1.5 block text-sm font-medium"
                    >
                      描述 <span className="font-normal text-muted-foreground">(可选)</span>
                    </label>
                    <textarea
                      id="install-description"
                      {...register('description')}
                      rows={3}
                      className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                      placeholder={`描述这个${entityLabel}的使用场景`}
                    />
                    {errors.description ? (
                      <p className="mt-1 text-xs text-red-500">{errors.description.message}</p>
                    ) : null}
                  </div>
                </div>

                {!isPlugin ? (
                  <>
                    {preflightQuery.isLoading ? (
                      <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-card/40 px-4 py-6 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        正在分析这个工作流需要的模型、工作区和持久沙箱...
                      </div>
                    ) : preflightQuery.isError || !workflowPreflight ? (
                      <div className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4">
                        <div className="flex items-start gap-3">
                          <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
                          <div className="space-y-1">
                            <p className="text-sm font-medium text-foreground">
                              无法完成安装预检
                            </p>
                            <p className="text-xs text-muted-foreground">
                              请稍后重试。如果问题持续存在，说明这个工作流的安装依赖解析仍有问题。
                            </p>
                          </div>
                        </div>
                        <div className="flex justify-end">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => void preflightQuery.refetch()}
                          >
                            重新检测
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {workflowPreflight.blockers.length > 0 ? (
                          <div className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4">
                            <div className="flex items-start gap-3">
                              <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
                              <div className="space-y-1">
                                <p className="text-sm font-medium text-foreground">
                                  这个工作流还有无法自动解决的依赖
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  这些问题不解决前，安装会被阻止。
                                </p>
                              </div>
                            </div>
                            <div className="space-y-2">
                              {workflowPreflight.blockers.map((blocker) => (
                                <div
                                  key={`${blocker.code}-${blocker.location}`}
                                  className="rounded-lg border border-destructive/20 bg-background/80 px-3 py-2"
                                >
                                  <p className="text-xs font-medium text-foreground">
                                    {blocker.location}
                                  </p>
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    {blocker.message}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {workflowPreflight.dependencies.llmModels.length > 0 ? (
                          <DependencySection
                            icon={<Bot className="h-4 w-4" />}
                            title="模型绑定"
                            description="按节点选择当前账号里已有的模型；没有可用模型时，需要先去模型页补建。"
                          >
                            {enabledModels.length === 0 ? (
                              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
                                <p className="text-sm font-medium text-foreground">
                                  当前账号还没有可用模型
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  请先到模型资源页配置至少一个可用模型，返回后会自动恢复当前安装现场。
                                </p>
                                <div className="mt-3 flex justify-end">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="gap-2"
                                    onClick={handleGoToModelConfig}
                                  >
                                    <Settings className="h-3.5 w-3.5" />
                                    去配置模型
                                  </Button>
                                </div>
                              </div>
                            ) : null}

                            {workflowPreflight.dependencies.llmModels.map((dependency) => {
                              const isMissing =
                                showValidation &&
                                missingRequirements.llmModels.includes(
                                  dependency.dependencyId,
                                )
                              return (
                                <div
                                  key={dependency.dependencyId}
                                  className="space-y-3 rounded-lg border border-border/70 bg-background/70 p-3"
                                >
                                  <div className="space-y-1">
                                    <p className="text-sm font-medium text-foreground">
                                      {dependency.location}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      需要模型：{dependency.provider} / {dependency.modelId}
                                      {dependency.baseUrl
                                        ? ` / ${dependency.baseUrl}`
                                        : ''}
                                    </p>
                                  </div>
                                  <GlobalModelSelector
                                    aria-label={`选择模型 ${dependency.location}`}
                                    value={
                                      selectedBindings.llmModels[
                                        dependency.dependencyId
                                      ] ?? ''
                                    }
                                    onValueChange={(value) =>
                                      updateBinding(
                                        'llmModels',
                                        dependency.dependencyId,
                                        value,
                                      )
                                    }
                                    modelType={dependency.modelType}
                                    allowEmpty={false}
                                    placeholder="选择已有模型"
                                  />
                                  {isMissing ? (
                                    <p className="text-xs text-red-500">
                                      这个节点还没有绑定模型。
                                    </p>
                                  ) : null}
                                </div>
                              )
                            })}
                          </DependencySection>
                        ) : null}

                        {workflowPreflight.dependencies.workspaces.length > 0 ? (
                          <DependencySection
                            icon={<FolderOpen className="h-4 w-4" />}
                            title="工作区绑定"
                            description="为工作流中的 workspace 节点选择目标工作区，也可以在这里直接新建。"
                          >
                            {workflowPreflight.dependencies.workspaces.map((dependency) => {
                              const isMissing =
                                showValidation &&
                                missingRequirements.workspaces.includes(
                                  dependency.dependencyId,
                                )
                              return (
                                <div
                                  key={dependency.dependencyId}
                                  className="space-y-3 rounded-lg border border-border/70 bg-background/70 p-3"
                                >
                                  <div className="space-y-1">
                                    <p className="text-sm font-medium text-foreground">
                                      {dependency.location}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      请选择一个就绪工作区绑定到这个节点。
                                    </p>
                                  </div>
                                  <div className="flex gap-2">
                                    <div className="min-w-0 flex-1">
                                      <Select
                                        aria-label={`选择工作区 ${dependency.location}`}
                                        value={
                                          selectedBindings.workspaces[
                                            dependency.dependencyId
                                          ] ?? ''
                                        }
                                        onValueChange={(value) =>
                                          updateBinding(
                                            'workspaces',
                                            dependency.dependencyId,
                                            value,
                                          )
                                        }
                                      >
                                        <option value="">请选择工作区</option>
                                        {readyWorkspaces.map((workspace) => (
                                          <option key={workspace.id} value={workspace.id}>
                                            {workspace.name}
                                          </option>
                                        ))}
                                      </Select>
                                    </div>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="gap-2"
                                      onClick={() =>
                                        setWorkspaceCreationTargetId(
                                          dependency.dependencyId,
                                        )
                                      }
                                    >
                                      <Plus className="h-3.5 w-3.5" />
                                      新建
                                    </Button>
                                  </div>
                                  {isMissing ? (
                                    <p className="text-xs text-red-500">
                                      这个节点还没有绑定工作区。
                                    </p>
                                  ) : null}
                                </div>
                              )
                            })}
                          </DependencySection>
                        ) : null}

                        {workflowPreflight.dependencies.sandboxes.length > 0 ? (
                          <DependencySection
                            icon={<Container className="h-4 w-4" />}
                            title="持久沙箱绑定"
                            description="为持久化 sandbox 节点选择可复用沙箱，也可以直接创建新的持久沙箱。"
                          >
                            {workflowPreflight.dependencies.sandboxes.map((dependency) => {
                              const isMissing =
                                showValidation &&
                                missingRequirements.sandboxes.includes(
                                  dependency.dependencyId,
                                )
                              const linkedWorkspaceId = dependency.linkedWorkspaceDependencyId
                                ? selectedBindings.workspaces[
                                    dependency.linkedWorkspaceDependencyId
                                  ] ?? ''
                                : ''
                              const linkedWorkspaceName = linkedWorkspaceId
                                ? readyWorkspaces.find(
                                    (workspace) => workspace.id === linkedWorkspaceId,
                                  )?.name ?? linkedWorkspaceId
                                : null
                              const selectedSandboxId =
                                selectedBindings.sandboxes[dependency.dependencyId] ?? ''
                              const selectedSandbox = selectedSandboxId
                                ? persistentSandboxMap.get(selectedSandboxId)
                                : null
                              const isSelectedSandboxPending =
                                pendingSelectedSandboxDependencyIds.includes(
                                  dependency.dependencyId,
                                )

                              return (
                                <div
                                  key={dependency.dependencyId}
                                  className="space-y-3 rounded-lg border border-border/70 bg-background/70 p-3"
                                >
                                  <div className="space-y-1">
                                    <p className="text-sm font-medium text-foreground">
                                      {dependency.location}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      {dependency.required
                                        ? '请选择一个持久沙箱绑定到这个节点。'
                                        : '可选：选择后会把这个节点导入为持久沙箱，并复用当前工作区。'}
                                    </p>
                                    {linkedWorkspaceName ? (
                                      <p className="text-xs text-muted-foreground">
                                        恢复工作区：{linkedWorkspaceName}
                                      </p>
                                    ) : null}
                                  </div>
                                  <div className="flex gap-2">
                                    <div className="min-w-0 flex-1">
                                      <Select
                                        aria-label={`选择持久沙箱 ${dependency.location}`}
                                        value={selectedSandboxId}
                                        onValueChange={(value) =>
                                          updateBinding(
                                            'sandboxes',
                                            dependency.dependencyId,
                                            value,
                                          )
                                        }
                                      >
                                        <option value="">请选择持久沙箱</option>
                                        {availablePersistentSandboxes.map((sandbox) => (
                                          <option key={sandbox.id} value={sandbox.id}>
                                            {formatPersistentSandboxLabel(sandbox)}
                                          </option>
                                        ))}
                                      </Select>
                                    </div>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="gap-2"
                                      onClick={() =>
                                        setSandboxCreationTargetId(
                                          dependency.dependencyId,
                                        )
                                      }
                                    >
                                      <Plus className="h-3.5 w-3.5" />
                                      新建
                                    </Button>
                                  </div>
                                  {isMissing ? (
                                    <p className="text-xs text-red-500">
                                      这个节点还没有绑定持久沙箱。
                                    </p>
                                  ) : isSelectedSandboxPending && selectedSandbox ? (
                                    <p className="text-xs text-amber-600">
                                      {formatPersistentSandboxLabel(selectedSandbox)}
                                      ，准备完成后才能继续安装。
                                    </p>
                                  ) : null}
                                </div>
                              )
                            })}
                          </DependencySection>
                        ) : null}

                        {workflowPreflight.blockers.length === 0 &&
                        workflowPreflight.dependencies.llmModels.length === 0 &&
                        workflowPreflight.dependencies.workspaces.length === 0 &&
                        workflowPreflight.dependencies.sandboxes.length === 0 ? (
                          <div className="rounded-xl border border-border/70 bg-card/40 px-4 py-6 text-sm text-muted-foreground">
                            这个工作流没有额外的安装依赖，安装完成后可以直接使用。
                          </div>
                        ) : null}
                      </>
                    )}
                  </>
                ) : null}
              </div>

              <div className="mt-4 flex justify-end gap-2 border-t border-border pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleDialogOpenChange(false)}
                >
                  取消
                </Button>
                <Button
                  type="submit"
                  disabled={
                    isPending ||
                    pendingSelectedSandboxDependencyIds.length > 0 ||
                    (!isPlugin &&
                      (preflightQuery.isLoading ||
                        preflightQuery.isError ||
                        !workflowPreflight ||
                        workflowPreflight.blockers.length > 0))
                  }
                  className="gap-2"
                >
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  确认安装
                </Button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <CreateWorkspaceDialog
        open={workspaceCreationTargetId !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setWorkspaceCreationTargetId(null)
          }
        }}
        onCreated={handleWorkspaceCreated}
      />

      <CreateSandboxDialog
        open={sandboxCreationTargetId !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setSandboxCreationTargetId(null)
          }
        }}
        onCreated={handleSandboxCreated}
      />
    </>
  )
})
