import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { AnimatePresence, motion } from 'motion/react';
import { AlertCircle } from 'lucide-react';

import { AuthLayout } from '@/features/auth/components/AuthLayout';
import { useAuthStore } from '@/features/auth/stores/auth.store';
import { fadeInUp } from '@/shared/lib/motion';
import { Progress } from '@/shared/ui/progress';

import { createOrganization } from '../api';

import { OrgSetupStep } from './OrgSetupStep';
import { PreferencesStep } from './PreferencesStep';
import { WelcomeStep } from './WelcomeStep';

type Step = 1 | 2 | 3;

const TOTAL_STEPS = 3;

/** 每一步的卡片标题与说明，由 AuthLayout 头部统一渲染 */
const STEP_META: Record<Step, { title: string; subtitle: string }> = {
  1: {
    title: '欢迎使用 AgentLoom',
    subtitle: '几步之内完成初始化，随后即可开始编排你的第一个工作流。',
  },
  2: {
    title: '创建组织',
    subtitle: '这是您的团队构建和运行 AI 工作流的工作空间。',
  },
  3: {
    title: '偏好设置',
    subtitle: '自定义使用体验，之后可在设置中修改。',
  },
};

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
    <AuthLayout
      title={STEP_META[currentStep].title}
      subtitle={STEP_META[currentStep].subtitle}
    >
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Progress
            className="h-1.5"
            value={(currentStep / TOTAL_STEPS) * 100}
            aria-label={`初始化进度：第 ${currentStep} 步，共 ${TOTAL_STEPS} 步`}
          />
          <span className="shrink-0 text-[11px] font-medium tabular-nums text-muted">
            {currentStep} / {TOTAL_STEPS}
          </span>
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={currentStep} {...fadeInUp}>
            {currentStep === 1 && <WelcomeStep onGetStarted={handleGetStarted} />}
            {currentStep === 2 && (
              <div className="space-y-4">
                {orgError && (
                  <div
                    role="alert"
                    className="flex items-start gap-2 rounded-card border border-error/30 bg-error/10 px-3 py-2.5 text-sm text-error"
                  >
                    <AlertCircle
                      className="mt-0.5 h-4 w-4 shrink-0"
                      aria-hidden
                    />
                    <span>{orgError}</span>
                  </div>
                )}
                <OrgSetupStep
                  onSubmit={handleOrgSubmit}
                  onBack={handleBackToWelcome}
                  isSubmitting={isSubmitting}
                />
              </div>
            )}
            {currentStep === 3 && (
              <PreferencesStep
                onComplete={handlePreferencesComplete}
                onSkip={handlePreferencesSkip}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </AuthLayout>
  );
}
