import { createRoute } from '@tanstack/react-router'
import { ReactFlowProvider } from '@xyflow/react'
import { WorkflowCanvasPage } from '@/features/canvas/components/WorkflowCanvasPage'
import { rootRoute } from '../__root'

export const workflowCanvasRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/workflows/$workflowId',
  component: () => (
    <ReactFlowProvider>
      <WorkflowCanvasPage />
    </ReactFlowProvider>
  ),
})
