import { memo, type DragEvent } from 'react';
import { Layers, Package2, Tag } from 'lucide-react';

import { DRAG_TRANSFER_TYPE } from '@/features/canvas';

import type { BlockCategory, ReusableBlockListItem } from '../types';

const CATEGORY_LABELS: Record<BlockCategory, string> = {
  analysis: '分析',
  content: '内容',
  development: '开发',
  automation: '自动化',
  reporting: '报告',
};

interface BlockLibraryItemProps {
  block: ReusableBlockListItem;
  onDragStart: (event: DragEvent, block: ReusableBlockListItem) => void;
  onClick?: (block: ReusableBlockListItem) => void;
}

export const BlockLibraryItem = memo(function BlockLibraryItem({
  block,
  onDragStart,
  onClick,
}: BlockLibraryItemProps) {
  const nodeCount = block.metadata?.nodeCount ?? 0;
  const categoryLabel = block.category
    ? CATEGORY_LABELS[block.category]
    : '未分类';

  function handleDragStart(event: DragEvent<HTMLButtonElement>) {
    event.dataTransfer.setData(
      DRAG_TRANSFER_TYPE,
      JSON.stringify({
        type: 'reusable-block',
        blockId: block.id,
        label: block.name,
        category: 'control',
      }),
    );
    event.dataTransfer.effectAllowed = 'move';
    onDragStart(event, block);
  }

  return (
    <button
      className="flex w-full cursor-grab flex-col items-start gap-3 rounded-xl border border-border bg-surface-elevated p-4 text-left transition-colors hover:border-primary/40 hover:bg-surface active:cursor-grabbing"
      data-testid={`block-item-${block.id}`}
      draggable
      onClick={() => onClick?.(block)}
      onDragStart={handleDragStart}
      title={block.description ?? block.name}
      type="button"
    >
      <div className="flex w-full items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <Package2 className="h-4 w-4 shrink-0 text-primary" />
            <span className="truncate text-sm font-medium text-foreground">
              {block.name}
            </span>
          </div>
          <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">
            {block.description ?? '这个块没有提供额外描述。'}
          </p>
        </div>

        <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          {categoryLabel}
        </span>
      </div>

      <div className="flex w-full flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Layers className="h-3.5 w-3.5" />
          {nodeCount} 节点
        </span>

        {block.tags.length > 0 ? (
          <span className="inline-flex items-center gap-1">
            <Tag className="h-3.5 w-3.5" />
            {block.tags.slice(0, 3).join('、')}
          </span>
        ) : null}
      </div>
    </button>
  );
});
