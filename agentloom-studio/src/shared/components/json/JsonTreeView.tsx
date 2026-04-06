import { memo, type ReactNode } from 'react'
import { cn } from '@/shared/lib/utils'

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
        {name ? <span className="shrink-0 text-muted-foreground">{name}:</span> : null}
        <span className="break-all whitespace-pre-wrap font-mono">{renderedValue}</span>
      </div>
    )
  }

  if (Array.isArray(value)) {
    return (
      <details
        open={depth < defaultExpandedDepth}
        className="rounded-xl border border-border/60 bg-background/60 px-3 py-2"
      >
        <summary className="cursor-pointer text-xs font-medium text-foreground">
          {name ?? 'Array'} [{value.length}]
        </summary>
        <div className="mt-2 space-y-2 pl-3">
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
        </div>
      </details>
    )
  }

  if (isRecord(value)) {
    const entries = Object.entries(value)

    return (
      <details
        open={depth < defaultExpandedDepth}
        className="rounded-xl border border-border/60 bg-background/60 px-3 py-2"
      >
        <summary className="cursor-pointer text-xs font-medium text-foreground">
          {name ?? 'Object'} {'{'}
          {entries.length}
          {'}'}
        </summary>
        <div className="mt-2 space-y-2 pl-3">
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
        </div>
      </details>
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
