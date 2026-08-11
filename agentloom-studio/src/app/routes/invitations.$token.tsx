import { createRoute } from '@tanstack/react-router'

import { AcceptInvitationPage } from '@/features/organization'

import { rootRoute } from './__root'

export const acceptInvitationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/invitations/$token',
  component: AcceptInvitationPage,
})
