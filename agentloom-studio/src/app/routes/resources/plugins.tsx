import { createRoute } from '@tanstack/react-router'
import { PluginManagementPage } from '@/features/plugin'
import { rootRoute } from '../__root'

export const pluginsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/resources/plugins',
  component: PluginManagementPage,
})
