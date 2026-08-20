import { Clock3, Settings2, ShieldAlert, SlidersHorizontal, X } from 'lucide-react'
import { motion } from 'motion/react'
import { TriggerTab } from '@/features/trigger'
import { InterventionPolicyTab } from '@/features/intervention-policy'
import { WorkflowInputSchemaTab } from '@/features/workflow-input-schema'
import type { WorkflowInputSchema } from '@/features/workflow'
import { cn } from '@/shared/lib/utils'
import { fadeInUp } from '@/shared/lib/motion'
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
    <motion.section
      initial={fadeInUp.initial}
      animate={fadeInUp.animate}
      transition={fadeInUp.transition}
      className="flex h-[min(76vh,720px)] flex-col overflow-hidden rounded-panel border border-border bg-surface shadow-panel"
      data-testid="workflow-settings-panel"
    >
      <div className="flex items-start gap-3 border-b border-border px-4 py-3">
        <span
          aria-hidden
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-card bg-primary/12 text-primary"
        >
          <Settings2 className="h-4 w-4" />
        </span>

        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-foreground">工作流设置</h2>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
            集中管理输入参数、触发器与人工介入策略，避免在画布上分散切换。
          </p>
        </div>

        <button
          type="button"
          className="-mr-1 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          onClick={onClose}
          aria-label="收起工作流设置"
          data-testid="close-workflow-settings-panel"
        >
          <X className="h-4 w-4" />
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
        className="flex min-h-0 flex-1 flex-col space-y-0"
      >
        <div className="px-4 pt-3">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger
              value="input-schema"
              data-testid="workflow-settings-tab-input-schema"
            >
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
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-3">
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
    </motion.section>
  )
}
