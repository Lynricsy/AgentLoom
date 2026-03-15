import { Clock3, Settings2, ShieldAlert, SlidersHorizontal, X } from 'lucide-react'
import { TriggerTab } from '@/features/trigger'
import { InterventionPolicyTab } from '@/features/intervention-policy'
import { WorkflowInputSchemaTab } from '@/features/workflow-input-schema/components/WorkflowInputSchemaTab'
import type { WorkflowInputSchema } from '@/features/workflow/types'
import { cn } from '@/shared/lib/utils'
import { Tabs, TabsList, TabsTrigger } from '@/shared/ui/tabs'
import type { CanvasNode } from '../../types'

const WORKFLOW_SETTINGS_TABS = ['input-schema', 'triggers', 'intervention-policies'] as const

export type WorkflowSettingsTab = (typeof WORKFLOW_SETTINGS_TABS)[number]

function isWorkflowSettingsTab(value: string): value is WorkflowSettingsTab {
  return WORKFLOW_SETTINGS_TABS.some((tab) => tab === value)
}

interface WorkflowSettingsPanelProps {
  workflowId: string
  workflowName: string
  workflowVersion: number
  nodes: CanvasNode[]
  inputSchema: WorkflowInputSchema | null
  isInputSchemaReadOnly: boolean
  isPublished: boolean
  isInterventionPolicyReadOnly: boolean
  activeTab: WorkflowSettingsTab
  onTabChange: (tab: WorkflowSettingsTab) => void
  onClose: () => void
}

export function WorkflowSettingsPanel({
  workflowId,
  workflowName,
  workflowVersion,
  nodes,
  inputSchema,
  isInputSchemaReadOnly,
  isPublished,
  isInterventionPolicyReadOnly,
  activeTab,
  onTabChange,
  onClose,
}: WorkflowSettingsPanelProps) {
  return (
    <section
      className="flex h-[min(76vh,720px)] flex-col rounded-2xl border border-border/70 bg-background/85 p-3 shadow-xl backdrop-blur-md"
      data-testid="workflow-settings-panel"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            <Settings2 className="h-3.5 w-3.5" />
            Workflow Settings
          </div>
          <h2 className="text-lg font-semibold text-foreground">工作流设置</h2>
          <p className="text-sm text-muted-foreground">
            在同一个面板中集中管理输入参数、触发器与人工介入策略，避免在画布上分散切换。
          </p>
        </div>

        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/85 px-3 py-2 text-xs font-medium text-foreground shadow-lg backdrop-blur-md transition hover:border-primary/40 hover:text-primary"
          onClick={onClose}
          data-testid="close-workflow-settings-panel"
        >
          <X className="h-3.5 w-3.5" />
          收起工作流设置
        </button>
      </div>

      <Tabs
        value={activeTab}
        defaultValue={activeTab}
        onValueChange={(value) => {
          if (isWorkflowSettingsTab(value)) {
            onTabChange(value)
          }
        }}
        className="mt-4 flex min-h-0 flex-1 flex-col"
      >
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="input-schema" data-testid="workflow-settings-tab-input-schema">
            <span className="inline-flex items-center gap-2">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              输入参数
            </span>
          </TabsTrigger>
          <TabsTrigger value="triggers" data-testid="workflow-settings-tab-triggers">
            <span className="inline-flex items-center gap-2">
              <Clock3 className="h-3.5 w-3.5" />
              触发器
            </span>
          </TabsTrigger>
          <TabsTrigger
            value="intervention-policies"
            data-testid="workflow-settings-tab-intervention-policies"
          >
            <span className="inline-flex items-center gap-2">
              <ShieldAlert className="h-3.5 w-3.5" />
              介入策略
            </span>
          </TabsTrigger>
        </TabsList>

        <div className="min-h-0 flex-1">
          <div
            className={cn('h-full', activeTab !== 'input-schema' && 'hidden')}
            data-testid="workflow-settings-content-input-schema"
            data-active={activeTab === 'input-schema'}
          >
            <WorkflowInputSchemaTab
              workflowId={workflowId}
              workflowVersion={workflowVersion}
              inputSchema={inputSchema}
              isReadOnly={isInputSchemaReadOnly}
            />
          </div>

          <div
            className={cn('h-full', activeTab !== 'triggers' && 'hidden')}
            data-testid="workflow-settings-content-triggers"
            data-active={activeTab === 'triggers'}
          >
            <TriggerTab workflowId={workflowId} isPublished={isPublished} />
          </div>

          <div
            className={cn('h-full', activeTab !== 'intervention-policies' && 'hidden')}
            data-testid="workflow-settings-content-intervention-policies"
            data-active={activeTab === 'intervention-policies'}
          >
            <InterventionPolicyTab
              workflowId={workflowId}
              workflowName={workflowName}
              nodes={nodes}
              isReadOnly={isInterventionPolicyReadOnly}
            />
          </div>
        </div>
      </Tabs>
    </section>
  )
}
