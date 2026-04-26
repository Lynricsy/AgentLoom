import { createRoute } from '@tanstack/react-router'

import { GeneratedAppDetailPage } from '@/features/generated-app'
import { rootRoute } from './__root'

export const generatedAppDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/generated-apps/$appId',
  component: () => {
    const { appId } = generatedAppDetailRoute.useParams()
    return <GeneratedAppDetailPage appId={appId} />
  },
})
