import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../dialog'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from '../sheet'
import { Popover, PopoverContent, PopoverTrigger } from '../popover'
import { Badge } from '../badge'
import { Card, CardContent, CardHeader, CardTitle } from '../card'
import { Textarea } from '../textarea'
import { Separator } from '../separator'
import { Avatar, AvatarFallback } from '../avatar'
import { Progress } from '../progress'
import { RadioGroup, RadioGroupItem } from '../radio-group'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../table'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '../command'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../select'

describe('Dialog', () => {
  it('打开后渲染内容，关闭后移除', async () => {
    const user = userEvent.setup()
    render(
      <Dialog>
        <DialogTrigger>打开</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>标题</DialogTitle>
            <DialogDescription>说明</DialogDescription>
          </DialogHeader>
          <DialogBody>正文</DialogBody>
        </DialogContent>
      </Dialog>,
    )

    expect(screen.queryByText('正文')).not.toBeInTheDocument()

    await user.click(screen.getByText('打开'))
    expect(await screen.findByText('正文')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '关闭' }))
    await waitFor(() =>
      expect(screen.queryByText('正文')).not.toBeInTheDocument(),
    )
  })
})

describe('Sheet', () => {
  it('按 side 渲染并可打开', async () => {
    const user = userEvent.setup()
    render(
      <Sheet>
        <SheetTrigger>打开面板</SheetTrigger>
        <SheetContent side="left">
          <SheetTitle>侧栏</SheetTitle>
          <SheetDescription>导航面板</SheetDescription>
        </SheetContent>
      </Sheet>,
    )

    await user.click(screen.getByText('打开面板'))
    expect(await screen.findByText('侧栏')).toBeInTheDocument()
  })
})

describe('Popover', () => {
  it('点击触发器后展示内容', async () => {
    const user = userEvent.setup()
    render(
      <Popover>
        <PopoverTrigger>更多</PopoverTrigger>
        <PopoverContent>浮层内容</PopoverContent>
      </Popover>,
    )

    await user.click(screen.getByText('更多'))
    expect(await screen.findByText('浮层内容')).toBeInTheDocument()
  })
})

describe('Badge', () => {
  it('tone 覆盖 variant 配色', () => {
    render(
      <Badge tone="var(--color-node-agent)" data-testid="badge">
        Agent
      </Badge>,
    )

    const badge = screen.getByTestId('badge')
    expect(badge).toHaveTextContent('Agent')
    expect(badge.style.color).toBe('var(--color-node-agent)')
  })
})

describe('Card', () => {
  it('interactive 时附加 hover 类', () => {
    const { rerender } = render(
      <Card data-testid="card">
        <CardHeader>
          <CardTitle>标题</CardTitle>
        </CardHeader>
        <CardContent>内容</CardContent>
      </Card>,
    )

    expect(screen.getByTestId('card').className).not.toContain('cursor-pointer')

    rerender(
      <Card data-testid="card" interactive>
        <CardContent>内容</CardContent>
      </Card>,
    )
    expect(screen.getByTestId('card').className).toContain('cursor-pointer')
  })
})

describe('Textarea', () => {
  it('可输入并回调', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Textarea aria-label="备注" onChange={onChange} />)

    await user.type(screen.getByLabelText('备注'), 'hi')
    expect(onChange).toHaveBeenCalled()
    expect(screen.getByLabelText('备注')).toHaveValue('hi')
  })
})

describe('Separator', () => {
  it('按方向切换尺寸类', () => {
    const { rerender } = render(<Separator data-testid="sep" />)
    expect(screen.getByTestId('sep').className).toContain('h-px')

    rerender(<Separator data-testid="sep" orientation="vertical" />)
    expect(screen.getByTestId('sep').className).toContain('w-px')
  })
})

describe('Avatar', () => {
  it('无图片时渲染 fallback', async () => {
    render(
      <Avatar>
        <AvatarFallback>AL</AvatarFallback>
      </Avatar>,
    )
    expect(await screen.findByText('AL')).toBeInTheDocument()
  })
})

describe('Progress', () => {
  it('按 value/max 比例位移指示条，并夹取越界值', () => {
    const { rerender } = render(<Progress value={40} data-testid="p" />)

    expect(
      (screen.getByTestId('p').firstElementChild as HTMLElement).style.transform,
    ).toBe('translateX(-60%)')

    rerender(<Progress value={90} max={300} data-testid="p" />)
    expect(
      (screen.getByTestId('p').firstElementChild as HTMLElement).style.transform,
    ).toBe('translateX(-70%)')

    rerender(<Progress value={180} data-testid="p" />)
    expect(
      (screen.getByTestId('p').firstElementChild as HTMLElement).style.transform,
    ).toBe('translateX(-0%)')
  })
})

describe('RadioGroup', () => {
  it('选择项后触发 onValueChange', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(
      <RadioGroup onValueChange={onValueChange}>
        <RadioGroupItem value="a" aria-label="选项 A" />
        <RadioGroupItem value="b" aria-label="选项 B" />
      </RadioGroup>,
    )

    await user.click(screen.getByLabelText('选项 B'))
    expect(onValueChange).toHaveBeenCalledWith('b')
  })
})

describe('Table', () => {
  it('渲染表头与单元格', () => {
    render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>名称</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>行一</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    )

    expect(screen.getByRole('columnheader', { name: '名称' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '行一' })).toBeInTheDocument()
  })
})

describe('Command', () => {
  it('按输入过滤条目', async () => {
    const user = userEvent.setup()
    render(
      <Command>
        <CommandInput placeholder="搜索" />
        <CommandList>
          <CommandEmpty>无结果</CommandEmpty>
          <CommandGroup heading="导航">
            <CommandItem value="workflows">工作流</CommandItem>
            <CommandItem value="agents">Agent</CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>,
    )

    expect(screen.getByText('工作流')).toBeInTheDocument()

    await user.type(screen.getByPlaceholderText('搜索'), 'agents')
    await waitFor(() =>
      expect(screen.queryByText('工作流')).not.toBeInTheDocument(),
    )
    expect(screen.getByText('Agent')).toBeInTheDocument()
  })
})

describe('Select', () => {
  it('选中条目后回填 trigger 文案', async () => {
    const user = userEvent.setup()

    function Harness() {
      const [value, setValue] = useState('')
      return (
        <Select value={value} onValueChange={setValue}>
          <SelectTrigger aria-label="模型">
            <SelectValue placeholder="请选择" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="gpt">GPT</SelectItem>
            <SelectItem value="claude">Claude</SelectItem>
          </SelectContent>
        </Select>
      )
    }

    render(<Harness />)
    const trigger = screen.getByLabelText('模型')
    expect(trigger).toHaveTextContent('请选择')

    await user.click(trigger)
    await user.click(await screen.findByText('Claude'))

    await waitFor(() => expect(trigger).toHaveTextContent('Claude'))

    // 关闭后仍须显示已选文案：Radix 依赖 SelectContent 常驻挂载登记选项文案
    await waitFor(() =>
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument(),
    )
    expect(trigger).toHaveTextContent('Claude')
  })

  it('首次渲染即回显预设值，无需展开下拉', () => {
    render(
      <Select value="claude">
        <SelectTrigger aria-label="模型">
          <SelectValue placeholder="请选择" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="gpt">GPT</SelectItem>
          <SelectItem value="claude">Claude</SelectItem>
        </SelectContent>
      </Select>,
    )

    expect(screen.getByLabelText('模型')).toHaveTextContent('Claude')
  })
})
