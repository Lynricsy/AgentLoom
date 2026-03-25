import { createRoute } from '@tanstack/react-router';
import { rootRoute } from './__root';

function OnboardingPage() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-foreground">Onboarding</h1>
        <p className="mt-2 text-sm text-muted-foreground">Coming Soon</p>
      </div>
    </div>
  );
}

export const onboardingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/onboarding',
  component: OnboardingPage,
});
