import { memo, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { Collapse } from '@/shared/components/collapse/Collapse'
import { Button } from '@/shared/ui/button'

export interface JsonTreeViewProps {
  value: unknown
  name?: string
  defaultExpandedDepth?: number
  renderString?: (value: string) => ReactNode
  className?: string
  dataTestId?: string
}

interface JsonTreeNodeProps {
  value: unknown
  name?: string
  depth: number
  defaultExpandedDepth: number
  renderString?: (value: string) => ReactNode
}

interface JsonBranchProps {
  label: ReactNode
  depth: number
  defaultOpen: boolean
  children: ReactNode
}

/** 数组/对象节点：受控展开 + Collapse 高度动画，单个 ChevronDown 旋转表示开合 */
function JsonBranch({ label, depth, defaultOpen, children }: JsonBranchProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className={cn(depth === 0 ? 'rounded-lg border border-border bg-muted px-3 py-2' : 'py-0.5')}>
      <Button
        variant="ghost"
        size="xs"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="-ml-2 max-w-full justify-start font-medium text-foreground hover:bg-border/40"
      >
        <ChevronDown
          className={cn('shrink-0 transition-transform duration-150', !open && '-rotate-90')}
        />
        <span className="min-w-0 truncate">{label}</span>
      </Button>
      <Collapse open={open}>
        <div className="mt-1 space-y-2 pl-3">{children}</div>
      </Collapse>
    </div>
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function JsonTreeNode({
  value,
  name,
  depth,
  defaultExpandedDepth,
  renderString,
}: JsonTreeNodeProps) {
  if (
    value == null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    const renderedValue =
      typeof value === 'string' && renderString ? renderString(value) : String(value)

    return (
      <div className="flex gap-2 text-xs leading-6 text-foreground/85">
        {name ? (
          <span className="max-w-[40%] shrink-0 truncate text-muted-foreground" title={name}>
            {name}:
          </span>
        ) : null}
        <span className="break-all whitespace-pre-wrap font-mono">{renderedValue}</span>
      </div>
    )
  }

  if (Array.isArray(value)) {
    return (
      <JsonBranch
        label={`${name ?? 'Array'} [${value.length}]`}
        depth={depth}
        defaultOpen={depth < defaultExpandedDepth}
      >
        {value.map((item, index) => (
          <JsonTreeNode
            key={`${name ?? 'array'}-${index}`}
            name={`${index}`}
            value={item}
            depth={depth + 1}
            defaultExpandedDepth={defaultExpandedDepth}
            renderString={renderString}
          />
        ))}
      </JsonBranch>
    )
  }

  if (isRecord(value)) {
    const entries = Object.entries(value)

    return (
      <JsonBranch
        label={`${name ?? 'Object'} {${entries.length}}`}
        depth={depth}
        defaultOpen={depth < defaultExpandedDepth}
      >
        {entries.map(([entryName, entryValue]) => (
          <JsonTreeNode
            key={entryName}
            name={entryName}
            value={entryValue}
            depth={depth + 1}
            defaultExpandedDepth={defaultExpandedDepth}
            renderString={renderString}
          />
        ))}
      </JsonBranch>
    )
  }

  return (
    <div className="text-xs font-mono text-foreground/85">
      {name ? `${name}: ` : ''}
      {String(value)}
    </div>
  )
}

export const JsonTreeView = memo(function JsonTreeView({
  value,
  name,
  defaultExpandedDepth = 1,
  renderString,
  className,
  dataTestId,
}: JsonTreeViewProps) {
  return (
    <div className={cn('space-y-2', className)} data-testid={dataTestId}>
      <JsonTreeNode
        value={value}
        name={name}
        depth={0}
        defaultExpandedDepth={defaultExpandedDepth}
        renderString={renderString}
      />
    </div>
  )
})
