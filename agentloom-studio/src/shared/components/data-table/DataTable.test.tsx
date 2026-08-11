import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Inbox } from 'lucide-react'
import { DataTable, type DataTableColumn } from './DataTable'
import { EmptyState } from '../empty-state/EmptyState'

interface Row {
  id: string
  name: string
}

const columns: DataTableColumn<Row>[] = [
  { key: 'name', header: '名称', cell: (row) => row.name },
  {
    key: 'id',
    header: 'ID',
    cell: (row) => row.id,
    hideBelow: 'md',
  },
]

const rows: Row[] = [
  { id: 'a', name: '工作流 A' },
  { id: 'b', name: '工作流 B' },
]

describe('DataTable', () => {
  it('渲染数据行并支持行点击', async () => {
    const user = userEvent.setup()
    const onRowClick = vi.fn()

    render(
      <DataTable
        columns={columns}
        data={rows}
        rowKey={(row) => row.id}
        onRowClick={onRowClick}
      />,
    )

    expect(screen.getByText('工作流 A')).toBeInTheDocument()
    await user.click(screen.getByText('工作流 B'))
    expect(onRowClick).toHaveBeenCalledWith(rows[1], 1)
  })

  it('loading 时渲染骨架行而非数据', () => {
    render(
      <DataTable columns={columns} data={rows} loading skeletonRows={3} />,
    )

    expect(screen.queryByText('工作流 A')).not.toBeInTheDocument()
    // 表头行 + 3 骨架行
    expect(screen.getAllByRole('row')).toHaveLength(4)
  })

  it('空数据时渲染 empty 内容', () => {
    render(
      <DataTable
        columns={columns}
        data={[]}
        empty={<EmptyState icon={Inbox} title="暂无数据" />}
      />,
    )

    expect(screen.getByText('暂无数据')).toBeInTheDocument()
  })

  it('分页器展示区间并在边界禁用按钮', async () => {
    const user = userEvent.setup()
    const onPageChange = vi.fn()

    render(
      <DataTable
        columns={columns}
        data={rows}
        pagination={{ page: 1, pageSize: 2, total: 5, onPageChange }}
      />,
    )

    expect(screen.getByText('1–2 / 共 5 条')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '上一页' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: '下一页' }))
    expect(onPageChange).toHaveBeenCalledWith(2)
  })
})
