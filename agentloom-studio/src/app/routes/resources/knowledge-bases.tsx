import { createRoute } from '@tanstack/react-router';
import { KnowledgeBasesPage } from '@/features/knowledge';
import { rootRoute } from '../__root';

export const resourceKnowledgeBasesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/resources/knowledge-bases',
  component: KnowledgeBasesPage,
});
