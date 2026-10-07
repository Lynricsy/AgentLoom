import { useState, type KeyboardEvent } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'

export interface TagInputProps {
  tags: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
  id?: string
}

/** 回车追加、退格删末尾的标签输入框，创建/编辑记忆实例共用 */
export function TagInput({ tags, onChange, placeholder, id }: TagInputProps) {
  const [inputValue, setInputValue] = useState('')

  function addTag(value: string) {
    const trimmed = value.trim()
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed])
    }
    setInputValue('')
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      addTag(inputValue)
    } else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
      onChange(tags.slice(0, -1))
    }
  }

  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2 transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30">
      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs text-foreground"
          >
            {tag}
            <Button
              variant="ghost"
              aria-label={`移除 ${tag}`}
              onClick={() => onChange(tags.filter((t) => t !== tag))}
              className="h-auto p-0 text-muted-foreground hover:bg-transparent hover:text-foreground [&_svg]:size-3"
            >
              <X className="h-3 w-3" />
            </Button>
          </span>
        ))}
        <Input
          id={id}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            if (inputValue.trim()) addTag(inputValue)
          }}
          placeholder={tags.length === 0 ? placeholder : ''}
          className="h-auto min-w-[120px] flex-1 rounded-none border-0 bg-transparent p-0 shadow-none hover:border-0 focus-visible:border-0 focus-visible:ring-0"
        />
      </div>
    </div>
  )
}
