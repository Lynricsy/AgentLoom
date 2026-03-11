import { useState, useCallback } from 'react'
import { Search, LayoutTemplate } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/shared/ui/tabs'
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
  const { data, isLoading } = useTemplates({ category: categoryParam })
  const { data: selectedTemplate } = useTemplateBySlug(selectedSlug ?? '')

  const templates = data?.data ?? []
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

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">模板</h1>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索模板..."
          className="w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      <Tabs value={category} onValueChange={setCategory}>
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
            ) : filtered.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 py-20">
                <LayoutTemplate className="h-12 w-12 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {search ? '没有匹配的模板' : '暂无模板'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filtered.map((template) => (
                  <TemplateCard
                    key={template.id}
                    template={template}
                    onClick={handleCardClick}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>

      <TemplateWizardDialog
        template={selectedTemplate ?? null}
        open={wizardOpen}
        onOpenChange={handleWizardOpenChange}
      />
    </div>
  )
}
