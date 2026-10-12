import { useRef } from 'react';
import { Zap, FileText, ShieldCheck, Calendar, Hash } from 'lucide-react';
import { formatBytes, formatDateTime } from '@/shared/lib/format';
import { Badge } from '@/shared/ui/badge';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
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
    <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
      <Icon className="size-3.5 shrink-0" />
      <span className="shrink-0">{label}</span>
      <span className="min-w-0 truncate text-foreground" title={value}>
        {value}
      </span>
    </div>
  );
}

export function SkillDetailDialog({
  skill,
  open,
  onOpenChange,
}: SkillDetailDialogProps) {
  // 父级关闭时会先把 skill 置空；缓存最近一次的 skill，让 Dialog 退场动画期间仍有内容可渲染
  const lastSkillRef = useRef(skill);
  if (skill) lastSkillRef.current = skill;
  const current = lastSkillRef.current;

  // 从未打开过：没有可退场的内容
  if (!current) return null;

  const isActive = current.status === 'active';

  return (
    <Dialog open={open && skill !== null} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="max-h-[85vh]">
        <DialogHeader className="flex-row items-start gap-4">
          <span
            aria-hidden
            className="grid size-12 shrink-0 place-items-center rounded-xl"
            style={{
              backgroundColor: isActive
                ? `color-mix(in srgb, ${SKILL_TONE} 14%, transparent)`
                : 'var(--color-muted)',
              color: isActive ? SKILL_TONE : 'var(--color-muted-foreground)',
            }}
          >
            <Zap className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-lg font-bold leading-tight">
              {current.name}
            </DialogTitle>
            <DialogDescription>
              {current.description || '查看技能的内容、文件元数据与当前状态。'}
            </DialogDescription>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge size="sm" variant={isActive ? 'success' : 'warning'}>
                {isActive ? '活跃' : '已归档'}
              </Badge>
              {current.isBuiltin && (
                <Badge size="sm" variant="info">
                  <ShieldCheck className="size-3" />
                  内置
                </Badge>
              )}
              {current.slug && (
                <span
                  className="max-w-full truncate rounded-md bg-muted px-2 py-0.5 font-mono text-2xs text-muted-foreground"
                  title={current.slug}
                >
                  {current.slug}
                </span>
              )}
            </div>
          </div>
        </DialogHeader>

        <DialogBody className="space-y-5">
          {current.content && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">技能内容</h3>
              <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-muted p-3 font-mono text-xs text-muted-foreground">
                {current.content}
              </pre>
            </div>
          )}

          {current.frontmatter && Object.keys(current.frontmatter).length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">前言元数据</h3>
              <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-muted p-3 font-mono text-xs text-muted-foreground">
                {JSON.stringify(current.frontmatter, null, 2)}
              </pre>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-muted p-4 sm:grid-cols-2">
            <MetaItem icon={FileText} label="文件数" value={`${current.fileCount} 个`} />
            <MetaItem icon={Hash} label="大小" value={formatBytes(current.totalSizeBytes)} />
            <MetaItem icon={Hash} label="版本" value={`v${current.version}`} />
            <MetaItem
              icon={Calendar}
              label="创建于"
              value={formatDateTime(current.createdAt)}
            />
            <MetaItem
              icon={Calendar}
              label="更新于"
              value={formatDateTime(current.updatedAt)}
            />
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
