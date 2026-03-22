/**
 * 版本对比视图 — 使用 diff 库生成统一差异
 */
import { useMemo } from 'react';
import { diffLines } from 'diff';
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
      <div
        className="py-8 text-center text-gray-500"
        data-testid="version-diff-empty"
      >
        选择一条审计记录以查看版本对比
      </div>
    );
  }

  return (
    <div data-testid="version-diff-view">
      {/* 版本标题 */}
      <div className="mb-3 flex items-center gap-4 text-sm">
        {oldVersion && (
          <div className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-full bg-red-400" />
            <span className="text-gray-600">
              v{oldVersion.versionNumber} — {oldVersion.nodeName}
            </span>
          </div>
        )}
        {newVersion && (
          <div className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-full bg-green-400" />
            <span className="text-gray-600">
              v{newVersion.versionNumber} — {newVersion.nodeName}
            </span>
          </div>
        )}
      </div>

      {/* 差异内容 */}
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-gray-50">
        <pre className="p-4 text-sm leading-relaxed">
          {changes?.map((part, index) => {
            let className = 'text-gray-700';
            let prefix = ' ';

            if (part.added) {
              className = 'bg-green-100 text-green-900';
              prefix = '+';
            } else if (part.removed) {
              className = 'bg-red-100 text-red-900';
              prefix = '-';
            }

            // 按行分割，为每行加前缀
            const lines = part.value.replace(/\n$/, '').split('\n');

            return lines.map((line, lineIdx) => (
              <div
                key={`${index}-${lineIdx}`}
                className={`${className} px-2`}
                data-testid={
                  part.added
                    ? 'diff-added'
                    : part.removed
                      ? 'diff-removed'
                      : 'diff-unchanged'
                }
              >
                <span className="mr-2 select-none text-gray-400">
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
