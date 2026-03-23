import { useCallback } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Zap, Loader2 } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { useSkillBySlug, useEnableSkill, useDisableSkill } from '../api/skillQueries';

const CATEGORY_LABELS: Record<string, string> = {
  writing: '写作',
  analysis: '分析',
  code: '代码',
  research: '研究',
  automation: '自动化',
  communication: '沟通',
  data: '数据',
  reasoning: '推理',
};

const COMPLEXITY_LABELS: Record<string, string> = {
  beginner: '入门',
  intermediate: '进阶',
  advanced: '高级',
};

interface SkillDetailDialogProps {
  skillSlug: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function SchemaFieldRow({ name, schema }: { name: string; schema: { type: string; description?: string; required?: boolean } }) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-border/60 bg-muted/30 p-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-medium text-foreground">{name}</span>
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {schema.type}
          </span>
          {schema.required && (
            <span className="text-[10px] font-medium text-red-400">必填</span>
          )}
        </div>
        {schema.description && (
          <p className="mt-1 text-xs text-muted-foreground">{schema.description}</p>
        )}
      </div>
    </div>
  );
}

export function SkillDetailDialog({ skillSlug, open, onOpenChange }: SkillDetailDialogProps) {
  const { data: skill, isLoading, isError } = useSkillBySlug(skillSlug ?? '');
  const enableMutation = useEnableSkill();
  const disableMutation = useDisableSkill();

  const isActionPending = enableMutation.isPending || disableMutation.isPending;
  const isActive = skill?.status === 'active';

  const handleToggleStatus = useCallback(() => {
    if (!skill) return;
    if (isActive) {
      disableMutation.mutate(skill.id);
    } else {
      enableMutation.mutate(skill.id);
    }
  }, [skill, isActive, enableMutation, disableMutation]);

  const inputEntries = Object.entries(skill?.inputSchema ?? {});
  const outputEntries = Object.entries(skill?.outputSchema ?? {});

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-background shadow-2xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]">
          <Dialog.Close className="absolute right-4 top-4 z-10 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
            <X className="h-4 w-4" />
            <span className="sr-only">关闭</span>
          </Dialog.Close>

          {isLoading ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : isError || !skill ? (
            <div className="flex h-64 flex-col items-center justify-center gap-2 text-center">
              <Zap className="h-10 w-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">技能详情加载失败</p>
            </div>
          ) : (
            <div className="flex flex-col gap-6 p-6">
              <div className="flex items-start gap-4">
                <div
                  className={cn(
                    'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl',
                    isActive ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground',
                  )}
                >
                  <Zap className="h-6 w-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <Dialog.Title className="text-lg font-bold leading-tight">
                    {skill.name}
                  </Dialog.Title>
                  {skill.description && (
                    <p className="mt-1 text-sm text-muted-foreground">{skill.description}</p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      {CATEGORY_LABELS[skill.category] ?? skill.category}
                    </span>
                    {skill.metadata.complexity && (
                      <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        {COMPLEXITY_LABELS[skill.metadata.complexity] ?? skill.metadata.complexity}
                      </span>
                    )}
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-xs font-medium',
                        isActive && 'bg-green-500/15 text-green-400',
                        skill.status === 'inactive' && 'bg-muted text-muted-foreground',
                        skill.status === 'deprecated' && 'bg-yellow-500/15 text-yellow-500',
                      )}
                    >
                      {isActive ? '已启用' : skill.status === 'deprecated' ? '已弃用' : '未启用'}
                    </span>
                  </div>
                </div>
              </div>

              {skill.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {skill.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded bg-muted/60 px-2 py-1 text-xs text-muted-foreground"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {skill.systemPrompt && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">系统提示词</h3>
                  <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-3 font-mono text-xs text-muted-foreground">
                    {skill.systemPrompt}
                  </pre>
                </div>
              )}

              {inputEntries.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">输入参数</h3>
                  <div className="space-y-2">
                    {inputEntries.map(([name, schema]) => (
                      <SchemaFieldRow key={name} name={name} schema={schema} />
                    ))}
                  </div>
                </div>
              )}

              {outputEntries.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">输出参数</h3>
                  <div className="space-y-2">
                    {outputEntries.map(([name, schema]) => (
                      <SchemaFieldRow key={name} name={name} schema={schema} />
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between border-t border-border pt-4">
                <div className="text-xs text-muted-foreground">
                  {skill.usageCount.toLocaleString()} 次使用
                  {skill.metadata.version && (
                    <span className="ml-2">v{skill.metadata.version}</span>
                  )}
                </div>
                {skill.status !== 'deprecated' && (
                  <Button
                    variant={isActive ? 'outline' : 'default'}
                    size="sm"
                    disabled={isActionPending}
                    onClick={handleToggleStatus}
                  >
                    {isActionPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                    {isActive ? '禁用技能' : '启用技能'}
                  </Button>
                )}
              </div>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
