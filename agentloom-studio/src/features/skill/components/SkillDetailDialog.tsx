import { Zap, FileText, ShieldCheck, Calendar, Hash } from 'lucide-react';
import { Badge } from '@/shared/ui/badge';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { formatSkillBytes, formatSkillTimestamp } from '../lib/format';
import type { Skill } from '../types';

interface SkillDetailDialogProps {
  skill: Skill | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SKILL_TONE = 'var(--color-type-skill)';

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
    <div className="flex items-center gap-2 text-xs text-muted">
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="max-h-[85vh]">
        <DialogHeader className="flex-row items-start gap-4">
          <span
            aria-hidden
            className="grid h-12 w-12 shrink-0 place-items-center rounded-panel"
            style={{
              backgroundColor: isActive
                ? `color-mix(in srgb, ${SKILL_TONE} 14%, transparent)`
                : 'var(--color-surface-elevated)',
              color: isActive ? SKILL_TONE : 'var(--color-muted)',
            }}
          >
            <Zap className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-lg font-bold leading-tight">
              {skill.name}
            </DialogTitle>
            <DialogDescription>
              {skill.description || '查看技能的内容、文件元数据与当前状态。'}
            </DialogDescription>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge size="sm" variant={isActive ? 'success' : 'warning'}>
                {isActive ? '活跃' : '已归档'}
              </Badge>
              {skill.isBuiltin && (
                <Badge size="sm" variant="info">
                  <ShieldCheck className="h-3 w-3" />
                  内置
                </Badge>
              )}
              {skill.slug && (
                <span className="rounded-md bg-surface-elevated px-2 py-0.5 font-mono text-[11px] text-muted">
                  {skill.slug}
                </span>
              )}
            </div>
          </div>
        </DialogHeader>

        <DialogBody className="space-y-5">
          {skill.content && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">技能内容</h3>
              <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-card border border-border bg-surface-elevated p-3 font-mono text-xs text-muted">
                {skill.content}
              </pre>
            </div>
          )}

          {skill.frontmatter && Object.keys(skill.frontmatter).length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">前言元数据</h3>
              <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-card border border-border bg-surface-elevated p-3 font-mono text-xs text-muted">
                {JSON.stringify(skill.frontmatter, null, 2)}
              </pre>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 rounded-card border border-border bg-surface-elevated p-4 sm:grid-cols-2">
            <MetaItem icon={FileText} label="文件数" value={`${skill.fileCount} 个`} />
            <MetaItem icon={Hash} label="大小" value={formatSkillBytes(skill.totalSizeBytes)} />
            <MetaItem icon={Hash} label="版本" value={`v${skill.version}`} />
            <MetaItem
              icon={Calendar}
              label="创建于"
              value={formatSkillTimestamp(skill.createdAt)}
            />
            <MetaItem
              icon={Calendar}
              label="更新于"
              value={formatSkillTimestamp(skill.updatedAt)}
            />
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
