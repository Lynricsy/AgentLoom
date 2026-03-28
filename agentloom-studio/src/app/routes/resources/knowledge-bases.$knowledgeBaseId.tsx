import { createRoute } from '@tanstack/react-router';
import { KnowledgeBaseDetailPage } from '@/features/knowledge/components/KnowledgeBaseDetailPage';
import { rootRoute } from '../__root';

export const resourceKnowledgeBaseDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/resources/knowledge-bases/$knowledgeBaseId',
  component: () => {
    const { knowledgeBaseId } = resourceKnowledgeBaseDetailRoute.useParams();
    return <KnowledgeBaseDetailPage knowledgeBaseId={knowledgeBaseId} />;
  },
});
