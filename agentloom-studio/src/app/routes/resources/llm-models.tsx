import { createRoute } from '@tanstack/react-router';
import { rootRoute } from '../__root';
import { LlmModelManagementPage } from '@/features/llm';

export const llmModelsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/resources/llm-models',
  component: LlmModelManagementPage,
});
