import { createRoute } from '@tanstack/react-router';

import { OnboardingWizard } from '@/features/onboarding';

import { rootRoute } from './__root';

export const onboardingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/onboarding',
  component: OnboardingWizard,
});
