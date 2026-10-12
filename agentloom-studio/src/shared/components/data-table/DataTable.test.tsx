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
        empty={<EmptyState variant="plain" icon={Inbox} title="暂无数据" />}
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

  it('total 为 0 时不渲染分页行', () => {
    render(
      <DataTable
        columns={columns}
        data={[]}
        empty={<EmptyState variant="plain" icon={Inbox} title="暂无数据" />}
        pagination={{ page: 1, pageSize: 20, total: 0, onPageChange: vi.fn() }}
      />,
    )

    expect(screen.queryByText(/共 0 条/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '下一页' })).not.toBeInTheDocument()
  })

  it('align=right 同时作用于表头与单元格', () => {
    render(
      <DataTable
        columns={[{ key: 'n', header: '数量', cell: () => '42', align: 'right' }]}
        data={[{ id: 'a', name: 'x' }]}
      />,
    )

    expect(screen.getByRole('columnheader', { name: '数量' })).toHaveClass('text-right')
    expect(screen.getByRole('cell', { name: '42' })).toHaveClass('text-right')
  })

  it('可点击行支持键盘 Enter 触发', async () => {
    const user = userEvent.setup()
    const onRowClick = vi.fn()

    render(<DataTable columns={columns} data={rows} onRowClick={onRowClick} />)

    const firstRow = screen.getByText('工作流 A').closest('tr')!
    firstRow.focus()
    await user.keyboard('{Enter}')
    expect(onRowClick).toHaveBeenCalledWith(rows[0], 0)
  })

  it('单元格内按钮的 Enter/空格执行按钮本身，不触发整行点击', async () => {
    const user = userEvent.setup()
    const onRowClick = vi.fn()
    const onTest = vi.fn()

    render(
      <DataTable
        columns={[
          ...columns,
          {
            key: 'actions',
            header: '操作',
            cell: () => (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  onTest()
                }}
              >
                测试连接
              </button>
            ),
          },
        ]}
        data={rows.slice(0, 1)}
        onRowClick={onRowClick}
      />,
    )

    screen.getByRole('button', { name: '测试连接' }).focus()
    await user.keyboard('{Enter}')
    await user.keyboard(' ')

    expect(onTest).toHaveBeenCalledTimes(2)
    expect(onRowClick).not.toHaveBeenCalled()
  })
})
