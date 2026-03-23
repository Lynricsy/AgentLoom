import { useState, useCallback } from 'react';
import { Search, Zap } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/shared/ui/tabs';
import { Button } from '@/shared/ui/button';
import { useSkills } from '../api/skillQueries';
import { SkillCard } from './SkillCard';
import { SkillDetailDialog } from './SkillDetailDialog';
import { type SkillCategory, type SkillListItem } from '../types';

const CATEGORY_TABS: { value: string; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'writing', label: '写作' },
  { value: 'analysis', label: '分析' },
  { value: 'code', label: '代码' },
  { value: 'research', label: '研究' },
  { value: 'automation', label: '自动化' },
  { value: 'communication', label: '沟通' },
  { value: 'data', label: '数据' },
  { value: 'reasoning', label: '推理' },
];

const STATUS_TABS: { value: string; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'active', label: '已启用' },
  { value: 'inactive', label: '未启用' },
];

export function SkillBrowsePage() {
  const [category, setCategory] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const categoryParam =
    category === 'all' ? undefined : (category as SkillCategory);
  const statusParam =
    statusFilter === 'all'
      ? undefined
      : (statusFilter as 'active' | 'inactive');

  const { data, isLoading, isError, refetch } = useSkills({
    category: categoryParam,
    status: statusParam,
  });

  const skills = data?.data ?? [];
  const hasActiveFilters =
    category !== 'all' || statusFilter !== 'all' || search.trim().length > 0;

  const filtered = search
    ? skills.filter(
        (s) =>
          s.name.toLowerCase().includes(search.toLowerCase()) ||
          s.description?.toLowerCase().includes(search.toLowerCase()) ||
          s.tags.some((t) => t.toLowerCase().includes(search.toLowerCase())),
      )
    : skills;

  const handleCardClick = useCallback((skill: SkillListItem) => {
    setSelectedSlug(skill.slug);
    setDialogOpen(true);
  }, []);

  const handleDialogOpenChange = useCallback((open: boolean) => {
    setDialogOpen(open);
    if (!open) setSelectedSlug(null);
  }, []);

  const clearFilters = useCallback(() => {
    setCategory('all');
    setStatusFilter('all');
    setSearch('');
  }, []);

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">技能库</h1>
        <Tabs defaultValue="all" value={statusFilter} onValueChange={setStatusFilter}>
          <TabsList>
            {STATUS_TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索技能名称、描述或标签..."
          className="w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      <Tabs defaultValue="all" value={category} onValueChange={setCategory}>
        <TabsList>
          {CATEGORY_TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {CATEGORY_TABS.map((tab) => (
          <TabsContent key={tab.value} value={tab.value}>
            {isLoading ? (
              <div className="flex flex-1 items-center justify-center py-20">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : isError ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 py-20 text-center">
                <Zap className="h-12 w-12 text-muted-foreground" />
                <div className="space-y-1">
                  <p className="text-sm font-medium">技能库加载失败</p>
                  <p className="text-sm text-muted-foreground">
                    请稍后重试，或刷新页面后再查看技能库。
                  </p>
                </div>
                <Button variant="outline" onClick={() => void refetch()}>
                  重新加载
                </Button>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 py-20">
                <Zap className="h-12 w-12 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {hasActiveFilters ? '没有匹配的技能' : '暂无技能'}
                </p>
                {hasActiveFilters && (
                  <>
                    <p className="text-sm text-muted-foreground">
                      尝试其他搜索词或清除筛选条件。
                    </p>
                    <Button variant="outline" onClick={clearFilters}>
                      清除筛选
                    </Button>
                  </>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filtered.map((skill) => (
                  <SkillCard
                    key={skill.id}
                    skill={skill}
                    onClick={handleCardClick}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>

      <SkillDetailDialog
        skillSlug={selectedSlug}
        open={dialogOpen}
        onOpenChange={handleDialogOpenChange}
      />
    </div>
  );
}
