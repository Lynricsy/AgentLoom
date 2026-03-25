import { useState } from 'react';

import { cn } from '@/shared/lib/utils';

import { OrgSetupStep } from './OrgSetupStep';
import { PreferencesStep } from './PreferencesStep';
import { WelcomeStep } from './WelcomeStep';

type Step = 1 | 2 | 3;

const TOTAL_STEPS = 3;

function StepIndicator({ current }: { current: Step }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: TOTAL_STEPS }, (_, i) => {
        const step = (i + 1) as Step;
        return (
          <div
            key={step}
            className={cn(
              'h-2 w-2 rounded-full transition-colors',
              step === current
                ? 'bg-primary'
                : step < current
                  ? 'bg-primary/40'
                  : 'bg-muted',
            )}
          />
        );
      })}
    </div>
  );
}

export function OnboardingWizard() {
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleGetStarted() {
    setCurrentStep(2);
  }

  function handleOrgSubmit(_orgName: string) {
    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      setCurrentStep(3);
    }, 600);
  }

  function handleBackToWelcome() {
    setCurrentStep(1);
  }

  function handlePreferencesComplete(prefs: {
    language: string;
    notifications: boolean;
  }) {
    console.log('[OnboardingWizard] complete', prefs);
  }

  function handlePreferencesSkip() {
    console.log('[OnboardingWizard] skipped preferences');
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-lg space-y-8">
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-lg">
              AL
            </div>
            <span className="text-2xl font-bold text-foreground">
              AgentLoom
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-8 shadow-lg">
          {currentStep === 1 && (
            <WelcomeStep onGetStarted={handleGetStarted} />
          )}
          {currentStep === 2 && (
            <OrgSetupStep
              onSubmit={handleOrgSubmit}
              onBack={handleBackToWelcome}
              isSubmitting={isSubmitting}
            />
          )}
          {currentStep === 3 && (
            <PreferencesStep
              onComplete={handlePreferencesComplete}
              onSkip={handlePreferencesSkip}
            />
          )}
        </div>

        <div className="flex justify-center">
          <StepIndicator current={currentStep} />
        </div>
      </div>
    </div>
  );
}
