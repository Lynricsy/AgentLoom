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
import type { FileTreeNode } from '../types';

interface WorkspaceFileTreeProps {
  tree: FileTreeNode[];
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
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
      <button
        type="button"
        onClick={handleClick}
        className={cn(
          'w-full flex items-center gap-1.5 py-1 px-2 text-xs text-left transition-colors rounded-sm',
          isSelected
            ? 'bg-info/15 text-info'
            : 'text-foreground/80 hover:bg-surface-elevated/70',
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {isDir ? (
          <>
            {hasChildren ? (
              expanded ? (
                <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
              ) : (
                <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
              )
            ) : (
              <span className="w-3 shrink-0" />
            )}
            {expanded ? (
              <FolderOpen className="h-3.5 w-3.5 text-warning/80 shrink-0" />
            ) : (
              <Folder className="h-3.5 w-3.5 text-warning/80 shrink-0" />
            )}
          </>
        ) : (
          <>
            <span className="w-3 shrink-0" />
            <File className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          </>
        )}
        <span className="truncate font-mono">{node.name}</span>
      </button>

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
}: WorkspaceFileTreeProps) {
  if (tree.length === 0) {
    return (
      <div className="flex flex-col h-full bg-surface rounded-lg border border-border overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-surface-elevated/50">
          <FolderTree className="h-4 w-4 text-warning/80" />
          <span className="text-sm font-medium text-foreground">工作区</span>
        </div>
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          <FolderTree className="h-4 w-4 mr-2 opacity-50" />
          <span>暂无文件</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-surface rounded-lg border border-border overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-surface-elevated/50">
        <FolderTree className="h-4 w-4 text-warning/80" />
        <span className="text-sm font-medium text-foreground">工作区</span>
      </div>
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
    </div>
  );
}
