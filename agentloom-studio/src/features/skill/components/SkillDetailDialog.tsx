import * as Dialog from '@radix-ui/react-dialog';
import { X, Zap, FileText, ShieldCheck, Calendar, Hash } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import type { Skill } from '../types';

interface SkillDetailDialogProps {
  skill: Skill | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatTimestamp(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function MetaItem({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Calendar;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="shrink-0">{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}

export function SkillDetailDialog({
  skill,
  open,
  onOpenChange,
}: SkillDetailDialogProps) {
  if (!skill) return null;

  const isActive = skill.status === 'active';

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-background shadow-2xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]">
          <Dialog.Close className="absolute right-4 top-4 z-10 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
            <X className="h-4 w-4" />
            <span className="sr-only">关闭</span>
          </Dialog.Close>

          <div className="flex flex-col gap-5 p-6">
            <div className="flex items-start gap-4">
              <div
                className={cn(
                  'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl',
                  isActive
                    ? 'bg-primary/15 text-primary'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                <Zap className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <Dialog.Title className="text-lg font-bold leading-tight">
                  {skill.name}
                </Dialog.Title>
                {skill.description && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {skill.description}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-xs font-medium',
                      isActive
                        ? 'bg-green-500/15 text-green-400'
                        : 'bg-yellow-500/15 text-yellow-500',
                    )}
                  >
                    {isActive ? '活跃' : '已归档'}
                  </span>
                  {skill.isBuiltin && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/15 px-2 py-0.5 text-xs font-medium text-blue-400">
                      <ShieldCheck className="h-3 w-3" />
                      内置
                    </span>
                  )}
                  {skill.slug && (
                    <span className="rounded bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                      {skill.slug}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {skill.content && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">技能内容</h3>
                <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-3 font-mono text-xs text-muted-foreground">
                  {skill.content}
                </pre>
              </div>
            )}

            {skill.frontmatter && Object.keys(skill.frontmatter).length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Frontmatter</h3>
                <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-3 font-mono text-xs text-muted-foreground">
                  {JSON.stringify(skill.frontmatter, null, 2)}
                </pre>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted/20 p-4">
              <MetaItem icon={FileText} label="文件数" value={`${skill.fileCount} 个`} />
              <MetaItem icon={Hash} label="大小" value={formatBytes(skill.totalSizeBytes)} />
              <MetaItem icon={Hash} label="版本" value={`v${skill.version}`} />
              <MetaItem icon={Calendar} label="创建于" value={formatTimestamp(skill.createdAt)} />
              <MetaItem icon={Calendar} label="更新于" value={formatTimestamp(skill.updatedAt)} />
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
