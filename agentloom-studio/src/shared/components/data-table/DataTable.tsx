import type { KeyboardEvent, ReactNode } from 'react'
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
import { Button } from '@/shared/ui/button'

export interface DataTableColumn<T> {
  /** 列唯一键，同时作为 React key */
  key: string
  header: ReactNode
  cell: (row: T, index: number) => ReactNode
  /** 附加到 th/td 的类名，例如宽度 */
  className?: string
  /** 水平对齐，同时作用于 th/td；right 自动加 tabular-nums */
  align?: 'left' | 'center' | 'right'
  /** th/td 不换行（日期、数字、版本、操作列） */
  nowrap?: boolean
  /** 只附加到 td */
  cellClassName?: string
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

/** th/td 共用的列类名：宽度、对齐、换行、响应式隐藏 */
function columnClass<T>(column: DataTableColumn<T>) {
  return cn(
    column.className,
    column.align === 'right' && 'text-right tabular-nums',
    column.align === 'center' && 'text-center',
    column.nowrap && 'whitespace-nowrap',
    column.hideBelow && HIDE_CLASS[column.hideBelow],
  )
}

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
    <div className={cn('overflow-hidden rounded-lg border border-border bg-surface', className)}>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {columns.map((column) => (
              <TableHead key={column.key} className={columnClass(column)}>
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
                    <TableCell key={column.key} className={columnClass(column)}>
                      <Skeleton
                        className={cn('h-5 w-full', column.align === 'right' && 'ml-auto w-16')}
                      />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            : data.map((row, index) => (
                <motion.tr
                  key={rowKey ? rowKey(row, index) : String(index)}
                  {...staggerList(index)}
                  className={cn(
                    ROW_CLASS,
                    onRowClick &&
                      'cursor-pointer focus-visible:bg-muted focus-visible:outline-none',
                  )}
                  {...(onRowClick
                    ? {
                        tabIndex: 0,
                        role: 'button',
                        onClick: () => onRowClick(row, index),
                        onKeyDown: (event: KeyboardEvent<HTMLTableRowElement>) => {
                          // 只响应焦点在行本身时的按键；单元格内按钮冒泡上来的 Enter/空格交给按钮自己
                          if (event.target !== event.currentTarget) return
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            onRowClick(row, index)
                          }
                        },
                      }
                    : {})}
                >
                  {columns.map((column) => (
                    <TableCell
                      key={column.key}
                      className={cn(columnClass(column), column.cellClassName)}
                    >
                      {column.cell(row, index)}
                    </TableCell>
                  ))}
                </motion.tr>
              ))}
        </TableBody>
      </Table>

      {showEmpty ? <div className="px-3 py-2">{empty}</div> : null}

      {pagination ? <DataTablePager {...pagination} /> : null}
    </div>
  )
}

function DataTablePager({ page, pageSize, total, onPageChange }: DataTablePagination) {
  // 空数据不显示「0–0 / 共 0 条」翻页行
  if (total === 0) return null

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2 text-xs text-muted-foreground">
      <span className="tabular-nums">
        {from}–{to} / 共 {total} 条
      </span>

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="xs"
          className="text-muted-foreground hover:text-foreground disabled:opacity-40"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          上一页
        </Button>
        <span className="px-1 tabular-nums text-foreground">
          {page} / {totalPages}
        </span>
        <Button
          variant="ghost"
          size="xs"
          className="text-muted-foreground hover:text-foreground disabled:opacity-40"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          下一页
        </Button>
      </div>
    </div>
  )
}
