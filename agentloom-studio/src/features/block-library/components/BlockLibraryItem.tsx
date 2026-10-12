import { memo, type DragEvent, type KeyboardEvent } from 'react';
import { Layers, Package2, Tag } from 'lucide-react';

import { DRAG_TRANSFER_TYPE } from '@/features/canvas';
import { Badge } from '@/shared/ui/badge';
import { Card } from '@/shared/ui/card';

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

  function handleDragStart(event: DragEvent<HTMLDivElement>) {
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
    <Card
      interactive
      className="flex w-full cursor-grab flex-col items-start gap-2 p-3 text-left active:cursor-grabbing"
      data-testid={`block-item-${block.id}`}
      draggable
      onClick={() => onClick?.(block)}
      onDragStart={handleDragStart}
      onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick?.(block);
        }
      }}
      role="button"
      tabIndex={0}
      title={block.description ?? block.name}
    >
      <div className="flex w-full items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex min-w-0 items-center gap-2">
            <Package2 className="size-4 shrink-0 text-primary" />
            <span className="truncate text-sm font-medium text-foreground">
              {block.name}
            </span>
          </div>
          <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">
            {block.description ?? '这个块没有提供额外描述。'}
          </p>
        </div>

        <Badge variant="secondary" size="sm" className="shrink-0">
          {categoryLabel}
        </Badge>
      </div>

      <div className="flex w-full min-w-0 items-center gap-3 text-xs text-muted-foreground">
        <span className="inline-flex shrink-0 items-center gap-1 tabular-nums">
          <Layers className="size-3.5 shrink-0" />
          {nodeCount} 节点
        </span>

        {block.tags.length > 0 ? (
          <span className="flex min-w-0 items-center gap-1">
            <Tag className="size-3.5 shrink-0" />
            <span className="truncate">{block.tags.slice(0, 3).join('、')}</span>
          </span>
        ) : null}
      </div>
    </Card>
  );
});
