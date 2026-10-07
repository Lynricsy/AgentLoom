import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { RuntimePluginConfigPanel } from './RuntimePluginConfigPanel'

vi.mock('@/features/runtime-plugin', () => ({
  useActiveRuntimePlugins: () => ({ data: { data: [] }, isLoading: false }),
}))

describe('RuntimePluginConfigPanel', () => {
  // 面板对缺省 source 按 package 展示；服务端编译要求显式 source，任何写回都必须带上它
  it('缺省 source 的节点在任意修改后写回 source=package', async () => {
    const user = userEvent.setup()
    const onApply = vi.fn()

    render(
      <RuntimePluginConfigPanel
        nodeId="node-1"
        config={{}}
        onApply={onApply}
        onValidationChange={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('checkbox', { name: '启用' }))

    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'package', enabled: false }),
    )
  })
})
