import { memo, useState, useCallback } from 'react';
import {
  FolderOpen,
  Folder,
  File,
  ChevronDown,
  ChevronRight,
  FolderTree,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { EmptyState } from '@/shared/components/empty-state/EmptyState';
import { Skeleton } from '@/shared/ui/skeleton';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import type { FileTreeNode } from '../types';

interface WorkspaceFileTreeProps {
  tree: FileTreeNode[];
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
  isLoading?: boolean;
}

/**
 * 文件树骨架屏 — 模拟树形结构的加载占位。
 * 可复用于任何需要展示树形加载态的场景。
 */
function FileTreeSkeleton() {
  const rows = [
    { depth: 0, width: 'w-24' },
    { depth: 1, width: 'w-20' },
    { depth: 1, width: 'w-28' },
    { depth: 2, width: 'w-16' },
    { depth: 2, width: 'w-24' },
    { depth: 1, width: 'w-20' },
    { depth: 0, width: 'w-32' },
    { depth: 1, width: 'w-20' },
  ];

  return (
    <div className="flex-1 space-y-1 py-2">
      {rows.map((row, i) => (
        <div
          key={i}
          className="flex items-center gap-1.5 px-2 py-1"
          style={{ paddingLeft: `${row.depth * 16 + 8}px` }}
        >
          <Skeleton className="h-3 w-3 shrink-0 rounded-sm" />
          <Skeleton className="h-3.5 w-3.5 shrink-0 rounded-sm" />
          <Skeleton className={cn('h-3 rounded-sm', row.width)} />
        </div>
      ))}
    </div>
  );
}

interface TreeNodeProps {
  node: FileTreeNode;
  depth: number;
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
}

const TreeNodeItem = memo(function TreeNodeItem({
  node,
  depth,
  selectedPath,
  onSelectFile,
}: TreeNodeProps) {
  const [expanded, setExpanded] = useState(depth < 2);
  const isDir = node.type === 'directory';
  const isSelected = node.path === selectedPath;
  const hasChildren = isDir && node.children && node.children.length > 0;

  const handleClick = useCallback(() => {
    if (isDir) {
      setExpanded((prev) => !prev);
    } else {
      onSelectFile(node.path);
    }
  }, [isDir, node.path, onSelectFile]);

  return (
    <div>
      <Button
        variant="ghost"
        size="xs"
        onClick={handleClick}
        className={cn(
          'h-auto w-full justify-start gap-1.5 rounded-sm px-2 py-1 text-left text-xs font-normal',
          isSelected
            ? 'bg-primary/12 text-primary hover:bg-primary/12'
            : 'text-foreground',
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {isDir ? (
          <>
            {hasChildren ? (
              expanded ? (
                <ChevronDown className="text-muted-foreground" />
              ) : (
                <ChevronRight className="text-muted-foreground" />
              )
            ) : (
              <span className="w-3 shrink-0" />
            )}
            {expanded ? (
              <FolderOpen style={{ color: 'var(--color-node-tool)' }} />
            ) : (
              <Folder style={{ color: 'var(--color-node-tool)' }} />
            )}
          </>
        ) : (
          <>
            <span className="w-3 shrink-0" />
            <File className="text-muted-foreground" />
          </>
        )}
        <span className="truncate font-mono">{node.name}</span>
      </Button>

      {isDir && expanded && node.children && (
        <div>
          {node.children.map((child) => (
            <TreeNodeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              onSelectFile={onSelectFile}
            />
          ))}
        </div>
      )}
    </div>
  );
});

export function WorkspaceFileTree({
  tree,
  selectedPath,
  onSelectFile,
  isLoading,
}: WorkspaceFileTreeProps) {
  if (isLoading && tree.length === 0) {
    return (
      <Card className="flex h-full flex-col overflow-hidden">
        <WorkspaceHeader />
        <FileTreeSkeleton />
      </Card>
    );
  }

  if (tree.length === 0) {
    return (
      <Card className="flex h-full flex-col overflow-hidden">
        <WorkspaceHeader />
        <div className="flex flex-1 items-center justify-center p-4">
          <EmptyState
            className="border-0 px-2 py-6"
            icon={FolderTree}
            tone="var(--color-node-tool)"
            title="暂无文件"
            description="Agent 在沙箱中创建文件后，这里会实时列出目录结构。"
          />
        </div>
      </Card>
    );
  }

  return (
    <Card className="flex h-full flex-col overflow-hidden">
      <WorkspaceHeader />
      <div className="flex-1 overflow-y-auto py-1">
        {tree.map((node) => (
          <TreeNodeItem
            key={node.path}
            node={node}
            depth={0}
            selectedPath={selectedPath}
            onSelectFile={onSelectFile}
          />
        ))}
      </div>
    </Card>
  );
}

function WorkspaceHeader() {
  return (
    <div className="flex items-center gap-2 border-b border-border bg-muted px-3 py-2">
      <FolderTree
        className="h-4 w-4"
        style={{ color: 'var(--color-node-tool)' }}
      />
      <span className="text-sm font-medium text-foreground">工作区</span>
    </div>
  );
}
