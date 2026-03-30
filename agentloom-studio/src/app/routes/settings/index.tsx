import { createRoute } from '@tanstack/react-router';
import { Link } from '@tanstack/react-router';
import {
  Shield,
  KeyRound,
  MonitorCog,
  Activity,
  Gauge,
  Server,
  FileText,
} from 'lucide-react';
import { rootRoute } from '../__root';

const SETTINGS_SECTIONS = [
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
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-foreground">设置</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          管理平台安全、监控、资源配额与部署相关配置。
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {SETTINGS_SECTIONS.map((section) => {
          const Icon = section.icon;
          return (
            <Link
              key={section.to}
              to={section.to}
              className="group rounded-2xl border border-border bg-surface-elevated p-5 shadow-sm transition-colors hover:border-primary/40"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 space-y-1">
                  <h2 className="text-sm font-semibold text-foreground">
                    {section.label}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {section.description}
                  </p>
                </div>
              </div>
            </Link>
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
