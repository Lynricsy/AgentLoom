import { useState, useCallback } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Plus, Search, Database, Trash2 } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import {
  useKnowledgeBases,
  useCreateKnowledgeBase,
  useDeleteKnowledgeBase,
} from '../hooks/useKnowledgeBases'
import type { KnowledgeBase } from '../types'

/**
 * 知识库列表页面
 * 路由: /settings/knowledge-bases
 * 功能: 展示知识库卡片列表、搜索过滤、创建知识库
 */
export function KnowledgeBasesPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [newKbName, setNewKbName] = useState('')
  const [newKbDescription, setNewKbDescription] = useState('')

  const navigate = useNavigate()
  const { data: knowledgeBases, isLoading, error } = useKnowledgeBases()
  const createMutation = useCreateKnowledgeBase()
  const deleteMutation = useDeleteKnowledgeBase()

  const filteredKbs =
    knowledgeBases?.filter(
      (kb) =>
        kb.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        kb.description?.toLowerCase().includes(searchQuery.toLowerCase()),
    ) ?? []

  const handleCreate = useCallback(() => {
    if (!newKbName.trim()) return
    createMutation.mutate(
      {
        name: newKbName.trim(),
        description: newKbDescription.trim() || undefined,
      },
      {
        onSuccess: () => {
          setShowCreateDialog(false)
          setNewKbName('')
          setNewKbDescription('')
        },
      },
    )
  }, [newKbName, newKbDescription, createMutation])

  const handleDelete = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.stopPropagation()
      deleteMutation.mutate(id)
    },
    [deleteMutation],
  )

  const handleCardClick = useCallback(
    (kb: KnowledgeBase) => {
      void navigate({
        to: '/settings/knowledge-bases/$knowledgeBaseId',
        params: { knowledgeBaseId: kb.id },
      })
    },
    [navigate],
  )

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-destructive">
          加载知识库失败: {error.message}
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full p-6 gap-4">
      {/* 页头 */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">知识库管理</h1>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="w-4 h-4 mr-2" />
          创建知识库
        </Button>
      </div>

      {/* 搜索 */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="搜索知识库..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* 加载状态 */}
      {isLoading && (
        <div className="flex items-center justify-center flex-1">
          <p className="text-muted-foreground">加载中...</p>
        </div>
      )}

      {/* 空状态 */}
      {!isLoading && filteredKbs.length === 0 && (
        <div className="flex flex-col items-center justify-center flex-1 gap-2">
          <Database className="w-12 h-12 text-muted-foreground" />
          <p className="text-muted-foreground">
            {searchQuery
              ? '没有匹配的知识库'
              : '还没有知识库，点击上方按钮创建'}
          </p>
        </div>
      )}

      {/* 卡片网格 */}
      {!isLoading && filteredKbs.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredKbs.map((kb) => (
            <div
              key={kb.id}
              className="relative p-4 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors"
            >
              <button
                type="button"
                onClick={() => handleCardClick(kb)}
                className="w-full text-left cursor-pointer"
              >
                <div className="pr-8">
                  <h3 className="font-medium truncate">{kb.name}</h3>
                  {kb.description && (
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                      {kb.description}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
                  <span>
                    {kb.visibility === 'organization' ? '组织' : '私有'}
                  </span>
                  <span>·</span>
                  <span>
                    {new Date(kb.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </button>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => handleDelete(e, kb.id)}
                className="absolute top-3 right-3 text-muted-foreground hover:text-destructive"
                aria-label={`删除 ${kb.name}`}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* 创建知识库对话框 */}
      {showCreateDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          role="dialog"
          aria-label="创建知识库"
        >
          <div className="bg-background rounded-lg border border-border p-6 w-full max-w-md shadow-lg">
            <h2 className="text-lg font-semibold mb-4">创建知识库</h2>
            <div className="flex flex-col gap-3">
              <div>
                <label htmlFor="kb-name" className="text-sm font-medium">
                  名称
                </label>
                <Input
                  id="kb-name"
                  placeholder="输入知识库名称"
                  value={newKbName}
                  onChange={(e) => setNewKbName(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <label
                  htmlFor="kb-description"
                  className="text-sm font-medium"
                >
                  描述
                </label>
                <Input
                  id="kb-description"
                  placeholder="输入描述（可选）"
                  value={newKbDescription}
                  onChange={(e) => setNewKbDescription(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <Button
                variant="outline"
                onClick={() => setShowCreateDialog(false)}
              >
                取消
              </Button>
              <Button
                onClick={handleCreate}
                disabled={
                  !newKbName.trim() || createMutation.isPending
                }
              >
                {createMutation.isPending ? '创建中...' : '创建'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
