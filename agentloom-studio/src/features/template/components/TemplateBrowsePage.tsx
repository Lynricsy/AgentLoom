import { useState, useCallback } from 'react'
import { motion } from 'motion/react'
import { LayoutTemplate, Search } from 'lucide-react'
import { EmptyState } from '@/shared/components/empty-state/EmptyState'
import { PageHeader } from '@/shared/components/page-header/PageHeader'
import { staggerList } from '@/shared/lib/motion'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Skeleton } from '@/shared/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/shared/ui/tabs'
import { useTemplates, useTemplateBySlug } from '../api/templateQueries'
import { TemplateCard } from './TemplateCard'
import { TemplateWizardDialog } from './TemplateWizardDialog'
import type { TemplateCategory, TemplateListItem } from '../types'

const CATEGORY_TABS: { value: string; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'analysis', label: '分析' },
  { value: 'content', label: '内容' },
  { value: 'development', label: '开发' },
  { value: 'automation', label: '自动化' },
  { value: 'reporting', label: '报告' },
]

export function TemplateBrowsePage() {
  const [category, setCategory] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null)
  const [wizardOpen, setWizardOpen] = useState(false)

  const categoryParam =
    category === 'all' ? undefined : (category as TemplateCategory)
  const { data, isLoading, isError, refetch } = useTemplates({
    category: categoryParam,
  })
  const { data: selectedTemplate } = useTemplateBySlug(selectedSlug ?? '')

  const templates = data?.data ?? []
  const hasActiveFilters = category !== 'all' || search.trim().length > 0
  const filtered = search
    ? templates.filter(
        (t) =>
          t.name.toLowerCase().includes(search.toLowerCase()) ||
          t.description?.toLowerCase().includes(search.toLowerCase()),
      )
    : templates

  const handleCardClick = useCallback((template: TemplateListItem) => {
    setSelectedSlug(template.slug)
    setWizardOpen(true)
  }, [])

  const handleWizardOpenChange = useCallback((open: boolean) => {
    setWizardOpen(open)
    if (!open) setSelectedSlug(null)
  }, [])

  const clearFilters = useCallback(() => {
    setCategory('all')
    setSearch('')
  }, [])

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col gap-5 p-4 sm:p-6">
      <PageHeader
        icon={LayoutTemplate}
        title="模板"
        description="从官方模板起步，几秒钟得到一条可运行的工作流。"
      />

      <div className="flex flex-col gap-3 rounded-panel border border-border bg-surface p-3 shadow-node sm:p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索模板..."
            className="pl-9"
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
        </Tabs>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={`template-skeleton-${String(index)}`}
              className="overflow-hidden rounded-card border border-border bg-card"
              data-testid="template-skeleton"
            >
              <Skeleton className="aspect-[16/9] w-full rounded-none" />
              <div className="space-y-2.5 p-4">
                <Skeleton className="h-4 w-2/3 rounded-md" />
                <Skeleton className="h-3 w-full rounded-md" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ) : isError ? (
        <EmptyState
          icon={LayoutTemplate}
          tone="var(--color-error)"
          title="模板加载失败"
          description="请稍后重试，或刷新页面后再查看模板画廊。"
          action={
            <Button variant="outline" onClick={() => void refetch()}>
              重新加载
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={LayoutTemplate}
          title={hasActiveFilters ? '没有匹配的模板' : '暂无模板'}
          description={
            hasActiveFilters
              ? '尝试其他搜索词或清除筛选条件。'
              : '模板会随平台更新持续补充，也可以直接从空白工作流开始。'
          }
          action={
            hasActiveFilters ? (
              <Button variant="outline" onClick={clearFilters}>
                清除筛选
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((template, index) => (
            <motion.div
              key={template.id}
              className="h-full"
              {...staggerList(index)}
            >
              <TemplateCard template={template} onClick={handleCardClick} />
            </motion.div>
          ))}
        </div>
      )}

      <TemplateWizardDialog
        template={selectedTemplate ?? null}
        open={wizardOpen}
        onOpenChange={handleWizardOpenChange}
      />
    </div>
  )
}
