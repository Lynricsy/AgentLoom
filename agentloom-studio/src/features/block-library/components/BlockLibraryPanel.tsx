import { useCallback, useMemo, useState, type DragEvent } from 'react';

import { AlertCircle, Package2 } from 'lucide-react';
import { motion } from 'motion/react';

import { EmptyState } from '@/shared/components/empty-state/EmptyState';
import { staggerList } from '@/shared/lib/motion';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Skeleton } from '@/shared/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';

import { useBlocks } from '../api/blockQueries';
import { BLOCK_CATEGORIES, type BlockCategory, type ReusableBlockListItem } from '../types';
import { BlockImportDialog } from './BlockImportDialog';
import { BlockLibraryItem } from './BlockLibraryItem';

const CATEGORY_LABELS: Record<BlockCategory, string> = {
  analysis: '分析',
  content: '内容',
  development: '开发',
  automation: '自动化',
  reporting: '报告',
};

interface BlockLibraryPanelProps {
  className?: string;
}

export function BlockLibraryPanel({ className }: BlockLibraryPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<BlockCategory | 'all'>('all');
  const [isImportOpen, setIsImportOpen] = useState(false);

  const { data, isLoading, error } = useBlocks({ pageSize: 100 });

  const blocks = data?.data ?? [];
  const filteredBlocks = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return blocks
      .filter((block) => {
        if (categoryFilter !== 'all' && block.category !== categoryFilter) {
          return false;
        }

        if (!normalizedQuery) {
          return true;
        }

        return [block.name, block.description, block.category, ...block.tags]
          .filter(Boolean)
          .some((value) => value?.toLowerCase().includes(normalizedQuery));
      })
      .slice()
      .sort((left, right) => {
        const leftTime = new Date(left.updatedAt).getTime();
        const rightTime = new Date(right.updatedAt).getTime();

        return rightTime - leftTime;
      });
  }, [blocks, categoryFilter, searchQuery]);

  const hasFilters = searchQuery.trim().length > 0 || categoryFilter !== 'all';

  const handleItemDragStart = useCallback(
    (_event: DragEvent, _block: ReusableBlockListItem) => {},
    [],
  );

  return (
    <div
      className={cn('flex h-full min-h-0 flex-col', className)}
      data-testid="block-library-panel"
    >
      <div className="space-y-3 border-b border-border p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-foreground">我的块</h2>
            <p className="line-clamp-2 text-xs text-muted-foreground">
              管理并拖拽可复用块到工作流画布。
            </p>
          </div>

          <Button onClick={() => setIsImportOpen(true)} size="xs" variant="outline" className="shrink-0">
            导入
          </Button>
        </div>

        <Input
          data-testid="block-library-search"
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="搜索块…"
          aria-label="搜索块"
          type="search"
          value={searchQuery}
          className="h-8 text-xs"
        />

        <Select
          value={categoryFilter}
          onValueChange={(value) =>
            setCategoryFilter(value === 'all' ? 'all' : (value as BlockCategory))
          }
        >
          <SelectTrigger data-testid="block-library-category" aria-label="块分类筛选">
            <SelectValue placeholder="全部分类" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部分类</SelectItem>
            {BLOCK_CATEGORIES.map((category) => (
              <SelectItem key={category} value={category}>
                {CATEGORY_LABELS[category]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {isLoading ? (
          <div role="status" className="space-y-3">
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className="h-24 w-full rounded-lg" />
            ))}
            <span className="sr-only">加载块库中…</span>
          </div>
        ) : null}

        {error ? (
          <EmptyState
            icon={AlertCircle}
            tone="var(--color-error)"
            title="块库加载失败"
            description={error instanceof Error ? error.message : '未知错误'}
          />
        ) : null}

        {!isLoading && !error && filteredBlocks.length === 0 ? (
          <EmptyState
            icon={Package2}
            title={hasFilters ? '没有匹配的块' : '还没有保存任何块'}
            description={
              hasFilters
                ? '换个关键词或分类试试。'
                : '在画布上选中一组节点，保存为可复用块后会出现在这里。'
            }
          />
        ) : null}

        {!isLoading && !error && filteredBlocks.length > 0 ? (
          <div className="space-y-3">
            {filteredBlocks.map((block, index) => (
              <motion.div key={block.id} {...staggerList(index)}>
                <BlockLibraryItem block={block} onDragStart={handleItemDragStart} />
              </motion.div>
            ))}
          </div>
        ) : null}
      </div>

      <BlockImportDialog
        onImportSuccess={() => setIsImportOpen(false)}
        onOpenChange={setIsImportOpen}
        open={isImportOpen}
      />
    </div>
  );
}
