import { createRoute } from '@tanstack/react-router';

import { OnboardingWizard } from '@/features/onboarding/components';

import { rootRoute } from './__root';

export const onboardingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/onboarding',
  component: OnboardingWizard,
});
