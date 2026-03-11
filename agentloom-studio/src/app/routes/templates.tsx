import { createRoute } from '@tanstack/react-router'
import { TemplateBrowsePage } from '@/features/template'
import { rootRoute } from './__root'

export const templatesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/templates',
  component: TemplateBrowsePage,
})
