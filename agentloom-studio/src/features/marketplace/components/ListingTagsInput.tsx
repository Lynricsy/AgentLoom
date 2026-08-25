import { memo, useCallback, useState, type KeyboardEvent } from 'react'
import { X } from 'lucide-react'

import { Badge } from '@/shared/ui/badge'
import { Input } from '@/shared/ui/input'
import { cn } from '@/shared/lib/utils'
import { MARKETPLACE_REVIEW_LIMITS } from '../types'

const L = MARKETPLACE_REVIEW_LIMITS

interface ListingTagsInputProps {
  id: string
  tags: string[]
  onTagsChange: (tags: string[]) => void
  /** 与提交时的「标签不足」提示共用同一条错误位，由调用方托管 */
  error: string | null
  onErrorChange: (error: string | null) => void
  disabled?: boolean
  testId?: string
}

/**
 * 上架表单的标签编辑器 — 工作流与插件发布共用。
 * 受控：tags 与 error 都由调用方持有，提交时的整表校验才能和输入期错误共用同一条提示。
 */
export const ListingTagsInput = memo(function ListingTagsInput({
  id,
  tags,
  onTagsChange,
  error,
  onErrorChange,
  disabled = false,
  testId,
}: ListingTagsInputProps) {
  const [tagInput, setTagInput] = useState('')

  const addTagsFromInput = useCallback(
    (raw: string) => {
      const incoming = raw
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)

      const tooLong = incoming.find((t) => t.length > L.tagMaxLength)
      if (tooLong) {
        onErrorChange(`标签"${tooLong}"超过 ${L.tagMaxLength} 个字符`)
        return
      }

      const merged = Array.from(new Set([...tags, ...incoming]))
      if (merged.length > L.maxTags) {
        onErrorChange(`最多添加 ${L.maxTags} 个标签`)
        return
      }

      onTagsChange(merged)
      setTagInput('')
      onErrorChange(null)
    },
    [onErrorChange, onTagsChange, tags],
  )

  const handleTagInputKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.nativeEvent.isComposing) return
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault()
        if (tagInput.trim()) {
          addTagsFromInput(tagInput)
        }
      }
      if (e.key === 'Backspace' && tagInput === '' && tags.length > 0) {
        onTagsChange(tags.slice(0, -1))
      }
    },
    [addTagsFromInput, onTagsChange, tagInput, tags],
  )

  const removeTag = useCallback(
    (tagToRemove: string) => {
      onTagsChange(tags.filter((t) => t !== tagToRemove))
      onErrorChange(null)
    },
    [onErrorChange, onTagsChange, tags],
  )

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        标签 <span className="text-error">*</span>
        <span className="ml-1 text-xs font-normal text-muted">
          ({tags.length}/{L.maxTags})
        </span>
      </label>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="pr-1 text-foreground">
              {tag}
              <button
                type="button"
                className="rounded-full p-0.5 text-muted transition-colors hover:bg-background hover:text-foreground"
                onClick={() => removeTag(tag)}
                aria-label={`移除标签 ${tag}`}
                disabled={disabled}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <Input
        id={id}
        type="text"
        className={cn(error && 'border-error')}
        placeholder="输入标签后按 Enter 或逗号分隔"
        value={tagInput}
        onChange={(e) => setTagInput(e.target.value)}
        onKeyDown={handleTagInputKeyDown}
        onBlur={() => {
          if (tagInput.trim()) addTagsFromInput(tagInput)
        }}
        disabled={disabled}
        data-testid={testId}
      />
      {error && <p className="text-xs font-medium text-error">{error}</p>}
    </div>
  )
})
