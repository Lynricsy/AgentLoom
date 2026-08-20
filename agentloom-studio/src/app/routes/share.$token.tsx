import { createRoute } from '@tanstack/react-router'
import { PublicSharePage } from '@/features/share'
import { rootRoute } from './__root'

export const shareTokenRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/s/$token',
  component: PublicSharePage,
})
