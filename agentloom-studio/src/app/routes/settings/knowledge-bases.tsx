import { createRoute } from '@tanstack/react-router'
import { rootRoute } from '../__root'
import { KnowledgeBasesPage } from '@/features/knowledge/components/KnowledgeBasesPage'

export const knowledgeBasesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings/knowledge-bases',
  component: KnowledgeBasesPage,
})
