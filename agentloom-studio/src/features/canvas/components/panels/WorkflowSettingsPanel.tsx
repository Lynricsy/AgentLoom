import { Clock3, Settings2, ShieldAlert, SlidersHorizontal } from 'lucide-react'
import { motion } from 'motion/react'
import { TriggerTab } from '@/features/trigger'
import { InterventionPolicyTab } from '@/features/intervention-policy'
import { WorkflowInputSchemaTab } from '@/features/workflow-input-schema'
import type { WorkflowInputSchema } from '@/features/workflow'
import { cn } from '@/shared/lib/utils'
import { fadeIn, fadeInUp } from '@/shared/lib/motion'
import { Tabs, TabsList, TabsTrigger } from '@/shared/ui/tabs'
import { CANVAS_FLOATING_CLASS } from '../canvasChrome'
import { CanvasPanelHeader } from '../CanvasPanelHeader'
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
      exit={fadeInUp.exit}
      transition={fadeInUp.transition}
      className={cn(
        CANVAS_FLOATING_CLASS,
        'flex h-[min(76vh,720px)] w-full flex-col overflow-hidden',
      )}
      data-testid="workflow-settings-panel"
    >
      <CanvasPanelHeader
        icon={Settings2}
        title="工作流设置"
        description="集中管理输入参数、触发器与人工介入策略，避免在画布上分散切换。"
        onClose={onClose}
        closeLabel="收起工作流设置"
        closeTestId="close-workflow-settings-panel"
      />

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
              <span className="inline-flex items-center gap-1.5">
                <SlidersHorizontal className="size-3.5" />
                输入参数
              </span>
            </TabsTrigger>
            <TabsTrigger value="triggers" data-testid="workflow-settings-tab-triggers">
              <span className="inline-flex items-center gap-1.5">
                <Clock3 className="size-3.5" />
                触发器
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="intervention-policies"
              data-testid="workflow-settings-tab-intervention-policies"
            >
              <span className="inline-flex items-center gap-1.5">
                <ShieldAlert className="size-3.5" />
                介入策略
              </span>
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-3">
          <motion.div
            initial={false}
            animate={{ opacity: activeTab === 'input-schema' ? 1 : 0 }}
            transition={fadeIn.transition}
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
          </motion.div>

          <motion.div
            initial={false}
            animate={{ opacity: activeTab === 'triggers' ? 1 : 0 }}
            transition={fadeIn.transition}
            className={cn('h-full', activeTab !== 'triggers' && 'hidden')}
            data-testid="workflow-settings-content-triggers"
            data-active={activeTab === 'triggers'}
          >
            <TriggerTab workflowId={workflowId} isPublished={isPublished} />
          </motion.div>

          <motion.div
            initial={false}
            animate={{ opacity: activeTab === 'intervention-policies' ? 1 : 0 }}
            transition={fadeIn.transition}
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
          </motion.div>
        </div>
      </Tabs>
    </motion.section>
  )
}
