import { createRoute } from '@tanstack/react-router'
import { RuntimePluginManagementPage } from '@/features/runtime-plugin'
import { rootRoute } from '../__root'

export const runtimePluginsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/resources/runtime-plugins',
  component: RuntimePluginManagementPage,
})
