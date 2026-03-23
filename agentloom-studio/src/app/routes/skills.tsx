import { createRoute } from '@tanstack/react-router';
import { SkillBrowsePage } from '@/features/skill';
import { rootRoute } from './__root';

export const skillsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/skills',
  component: SkillBrowsePage,
});
