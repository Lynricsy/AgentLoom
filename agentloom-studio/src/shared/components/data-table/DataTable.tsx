import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { cn } from '@/shared/lib/utils'
import { staggerList } from '@/shared/lib/motion'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  tableRowClass as ROW_CLASS,
} from '@/shared/ui/table'
import { Skeleton } from '@/shared/ui/skeleton'

export interface DataTableColumn<T> {
  /** 列唯一键，同时作为 React key */
  key: string
  header: ReactNode
  cell: (row: T, index: number) => ReactNode
  /** 附加到 th/td 的类名，例如宽度或对齐 */
  className?: string
  /** 小屏隐藏该列（次要信息） */
  hideBelow?: 'sm' | 'md' | 'lg'
}

export interface DataTablePagination {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[]
  data: T[]
  /** 行 key 提取器，默认取 index */
  rowKey?: (row: T, index: number) => string
  loading?: boolean
  /** loading 时渲染的骨架行数 */
  skeletonRows?: number
  /** data 为空且非 loading 时渲染 */
  empty?: ReactNode
  onRowClick?: (row: T, index: number) => void
  pagination?: DataTablePagination
  className?: string
}

const HIDE_CLASS = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
} as const

export function DataTable<T>({
  columns,
  data,
  rowKey,
  loading = false,
  skeletonRows = 5,
  empty,
  onRowClick,
  pagination,
  className,
}: DataTableProps<T>) {
  const showEmpty = !loading && data.length === 0

  return (
    <div
      className={cn(
        'overflow-hidden rounded-card border border-border bg-surface',
        className,
      )}
    >
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {columns.map((column) => (
              <TableHead
                key={column.key}
                className={cn(
                  column.className,
                  column.hideBelow && HIDE_CLASS[column.hideBelow],
                )}
              >
                {column.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>

        <TableBody>
          {loading
            ? Array.from({ length: skeletonRows }, (_, rowIndex) => (
                <TableRow key={`skeleton-${rowIndex}`} className="hover:bg-transparent">
                  {columns.map((column) => (
                    <TableCell
                      key={column.key}
                      className={cn(
                        column.className,
                        column.hideBelow && HIDE_CLASS[column.hideBelow],
                      )}
                    >
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            : data.map((row, index) => (
                <motion.tr
                  key={rowKey ? rowKey(row, index) : String(index)}
                  {...staggerList(index)}
                  className={cn(ROW_CLASS, onRowClick && 'cursor-pointer')}
                  onClick={onRowClick ? () => onRowClick(row, index) : undefined}
                >
                  {columns.map((column) => (
                    <TableCell
                      key={column.key}
                      className={cn(
                        column.className,
                        column.hideBelow && HIDE_CLASS[column.hideBelow],
                      )}
                    >
                      {column.cell(row, index)}
                    </TableCell>
                  ))}
                </motion.tr>
              ))}
        </TableBody>
      </Table>

      {showEmpty ? <div className="px-3 py-10">{empty}</div> : null}

      {pagination ? <DataTablePager {...pagination} /> : null}
    </div>
  )
}

function DataTablePager({
  page,
  pageSize,
  total,
  onPageChange,
}: DataTablePagination) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2 text-xs text-muted">
      <span>
        {from}–{to} / 共 {total} 条
      </span>

      <div className="flex items-center gap-1">
        <button
          type="button"
          className="rounded-md px-2 py-1 transition-colors hover:bg-surface-elevated hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          上一页
        </button>
        <span className="px-1 text-foreground">
          {page} / {totalPages}
        </span>
        <button
          type="button"
          className="rounded-md px-2 py-1 transition-colors hover:bg-surface-elevated hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          下一页
        </button>
      </div>
    </div>
  )
}
