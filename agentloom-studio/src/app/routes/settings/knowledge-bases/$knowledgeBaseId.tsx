import { createRoute } from '@tanstack/react-router'
import { rootRoute } from '../../__root'
import { KnowledgeBaseDetailPage } from '@/features/knowledge/components/KnowledgeBaseDetailPage'

export const knowledgeBaseDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings/knowledge-bases/$knowledgeBaseId',
  component: () => {
    const { knowledgeBaseId } = knowledgeBaseDetailRoute.useParams()
    return <KnowledgeBaseDetailPage knowledgeBaseId={knowledgeBaseId} />
  },
})
