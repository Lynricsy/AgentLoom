import { createRoute } from '@tanstack/react-router';
import { SkillBrowsePage } from '@/features/skill';
import { rootRoute } from '../__root';

export const resourceSkillsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/resources/skills',
  component: SkillBrowsePage,
});
