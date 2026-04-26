import { createRoute } from '@tanstack/react-router'

import { GeneratedAppPublicRuntimePage } from '@/features/generated-app'
import { rootRoute } from './__root'

export const generatedAppPublicRuntimeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/generated-apps/public/$token',
  component: () => {
    const { token } = generatedAppPublicRuntimeRoute.useParams()
    return <GeneratedAppPublicRuntimePage token={token} />
  },
})
