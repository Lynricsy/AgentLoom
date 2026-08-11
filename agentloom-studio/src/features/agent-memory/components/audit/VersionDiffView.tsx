import { useMemo } from 'react';
import { diffLines } from 'diff';
import { GitCompare } from 'lucide-react';
import { EmptyState } from '@/shared/components/empty-state/EmptyState';
import { cn } from '@/shared/lib/utils';
import type { MemoryVersion } from './types';

interface VersionDiffViewProps {
  oldVersion: MemoryVersion | null;
  newVersion: MemoryVersion | null;
}

export function VersionDiffView({
  oldVersion,
  newVersion,
}: VersionDiffViewProps) {
  const changes = useMemo(() => {
    if (!oldVersion && !newVersion) return null;
    const oldText = oldVersion?.content ?? '';
    const newText = newVersion?.content ?? '';
    return diffLines(oldText, newText);
  }, [oldVersion, newVersion]);

  if (!oldVersion && !newVersion) {
    return (
      <div data-testid="version-diff-empty">
        <EmptyState
          icon={GitCompare}
          tone="var(--color-info)"
          title="选择一条审计记录以查看版本对比"
          description="选中版本后会逐行高亮新增与删除的内容。"
        />
      </div>
    );
  }

  return (
    <div data-testid="version-diff-view">
      {/* 版本标题 */}
      <div className="mb-3 flex flex-wrap items-center gap-4 text-sm">
        {oldVersion && (
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="inline-block h-2.5 w-2.5 rounded-full bg-error"
            />
            <span className="text-muted">
              v{oldVersion.versionNumber} — {oldVersion.nodeName}
            </span>
          </div>
        )}
        {newVersion && (
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="inline-block h-2.5 w-2.5 rounded-full bg-success"
            />
            <span className="text-muted">
              v{newVersion.versionNumber} — {newVersion.nodeName}
            </span>
          </div>
        )}
      </div>

      {/* 差异内容 */}
      <div className="overflow-x-auto rounded-card border border-border bg-surface-elevated">
        <pre className="p-3 font-mono text-xs leading-relaxed">
          {changes?.map((part, index) => {
            const lineClass = part.added
              ? 'bg-success/12 text-success'
              : part.removed
                ? 'bg-error/12 text-error'
                : 'text-foreground';
            const prefix = part.added ? '+' : part.removed ? '-' : ' ';

            // 按行分割，为每行加前缀
            const lines = part.value.replace(/\n$/, '').split('\n');

            return lines.map((line, lineIdx) => (
              <div
                key={`${index}-${lineIdx}`}
                className={cn('px-2', lineClass)}
                data-testid={
                  part.added
                    ? 'diff-added'
                    : part.removed
                      ? 'diff-removed'
                      : 'diff-unchanged'
                }
              >
                <span aria-hidden className="mr-2 select-none text-muted">
                  {prefix}
                </span>
                {line || '\u00A0'}
              </div>
            ));
          })}
        </pre>
      </div>
    </div>
  );
}
