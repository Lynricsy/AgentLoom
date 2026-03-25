import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';

import { cn } from '@/shared/lib/utils';
import { useAuthStore } from '@/features/auth/stores/auth.store';

import { createOrganization } from '../api';

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
  const [orgError, setOrgError] = useState<string | null>(null);
  const navigate = useNavigate();

  function handleGetStarted() {
    setCurrentStep(2);
  }

  async function handleOrgSubmit(orgName: string) {
    setIsSubmitting(true);
    setOrgError(null);

    try {
      await createOrganization(orgName);

      const { success, tenantId } =
        await useAuthStore.getState().refreshAndCheckTenant();

      if (!success) {
        setOrgError('会话刷新失败，请重新登录后重试');
        return;
      }

      if (!tenantId) {
        setOrgError('组织创建成功但租户信息尚未生效，请稍后重试');
        return;
      }

      setCurrentStep(3);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : '组织创建失败，请稍后重试';
      setOrgError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleBackToWelcome() {
    setCurrentStep(1);
    setOrgError(null);
  }

  function handlePreferencesComplete(_prefs: {
    language: string;
    notifications: boolean;
  }) {
    navigate({ to: '/' });
  }

  function handlePreferencesSkip() {
    navigate({ to: '/' });
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
            <>
              <OrgSetupStep
                onSubmit={handleOrgSubmit}
                onBack={handleBackToWelcome}
                isSubmitting={isSubmitting}
              />
              {orgError && (
                <p className="mt-3 text-xs text-red-400">{orgError}</p>
              )}
            </>
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
