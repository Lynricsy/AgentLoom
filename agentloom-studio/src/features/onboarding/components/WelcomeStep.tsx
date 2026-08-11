import { Layers, Share2, Users } from 'lucide-react';

import { Button } from '@/shared/ui/button';

interface WelcomeStepProps {
  onGetStarted: () => void;
}

/** 平台核心能力速览 — 图标着色取节点类别色，与画布视觉体系一致 */
const HIGHLIGHTS = [
  {
    icon: Share2,
    tone: 'var(--color-node-agent)',
    title: '可视化编排',
    description: '在画布上连接 Agent、工具与知识库，即刻组装工作流。',
  },
  {
    icon: Layers,
    tone: 'var(--color-node-knowledge)',
    title: '统一资源池',
    description: '模型、技能、记忆与沙箱集中管理，跨工作流复用。',
  },
  {
    icon: Users,
    tone: 'var(--color-node-trigger)',
    title: '团队协作',
    description: '以组织为单位共享资源、审计执行、发布版本。',
  },
] as const;

export function WelcomeStep({ onGetStarted }: WelcomeStepProps) {
  return (
    <div className="flex flex-col">
      <ul className="space-y-4">
        {HIGHLIGHTS.map(({ icon: Icon, tone, title, description }) => (
          <li key={title} className="flex gap-3">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-card"
              style={{
                backgroundColor: `color-mix(in srgb, ${tone} 14%, transparent)`,
                color: tone,
              }}
            >
              <Icon className="h-4 w-4" aria-hidden />
            </span>
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-foreground">{title}</p>
              <p className="text-xs leading-relaxed text-muted">
                {description}
              </p>
            </div>
          </li>
        ))}
      </ul>

      <Button className="mt-8 w-full" size="lg" onClick={onGetStarted}>
        开始设置
      </Button>
    </div>
  );
}
