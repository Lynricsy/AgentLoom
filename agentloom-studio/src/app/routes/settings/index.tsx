import { createRoute } from '@tanstack/react-router';
import { Link } from '@tanstack/react-router';
import { motion } from 'motion/react';
import {
  Shield,
  KeyRound,
  MonitorCog,
  Activity,
  Gauge,
  Server,
  FileText,
  Settings,
  SlidersHorizontal,
} from 'lucide-react';
import { PageHeader } from '@/shared/components/page-header/PageHeader';
import { staggerList } from '@/shared/lib/motion';
import { Card, CardContent, CardDescription, CardTitle } from '@/shared/ui/card';
import { rootRoute } from '../__root';

const SETTINGS_SECTIONS = [
  {
    label: '个人偏好',
    description: '管理个人 AI 行为偏好',
    to: '/settings/preferences',
    icon: SlidersHorizontal,
  },
  {
    label: '安全设置',
    description: '管理认证与访问控制',
    to: '/settings/security',
    icon: Shield,
  },
  {
    label: '加密',
    description: '端到端加密密钥管理',
    to: '/settings/encryption',
    icon: KeyRound,
  },
  {
    label: '自治策略',
    description: 'Agent 自主决策权限配置',
    to: '/settings/security/autonomy-policy',
    icon: MonitorCog,
  },
  {
    label: '监控',
    description: '平台运行状态监控',
    to: '/settings/monitoring',
    icon: Activity,
  },
  {
    label: '资源配额',
    description: '租户资源限额管理',
    to: '/settings/resource-quotas',
    icon: Gauge,
  },
  {
    label: '私有部署',
    description: '私有化部署配置',
    to: '/settings/private-deployment',
    icon: Server,
  },
  {
    label: '审计日志',
    description: '操作审计与合规记录',
    to: '/settings/audit-logs',
    icon: FileText,
  },
];

function SettingsOverviewPage() {
  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        icon={Settings}
        title="设置"
        description="管理平台安全、监控、资源配额与部署相关配置。"
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {SETTINGS_SECTIONS.map((section, index) => {
          const Icon = section.icon;
          return (
            <motion.div key={section.to} {...staggerList(index)}>
              <Link to={section.to} className="group block h-full">
                <Card interactive className="h-full">
                  <CardContent className="flex items-start gap-3 p-4">
                    <span
                      aria-hidden
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-card bg-primary/10 text-primary transition-colors group-hover:bg-primary/15"
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 space-y-1">
                      <CardTitle>{section.label}</CardTitle>
                      <CardDescription>{section.description}</CardDescription>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

export const settingsIndexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings/',
  component: SettingsOverviewPage,
});
