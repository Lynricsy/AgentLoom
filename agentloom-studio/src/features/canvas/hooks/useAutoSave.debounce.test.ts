import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/features/workflow', () => ({
  useUpdateWorkflow: () => ({ mutate: vi.fn() }),
}))

// AUTOSAVE_DEBOUNCE_MS 在模块求值时读取 import.meta.env，必须先 stubEnv 再重新加载模块
async function loadDebounceMs(raw: string): Promise<number> {
  vi.stubEnv('VITE_AUTOSAVE_DEBOUNCE_MS', raw)
  vi.resetModules()
  const { AUTOSAVE_DEBOUNCE_MS } = await import('./useAutoSave')
  return AUTOSAVE_DEBOUNCE_MS
}

describe('AUTOSAVE_DEBOUNCE_MS', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('读取 VITE_AUTOSAVE_DEBOUNCE_MS（含 Docker 入口脚本替换后的数值）', async () => {
    await expect(loadDebounceMs('750')).resolves.toBe(750)
  })

  it('镜像内未被入口脚本替换的占位符回退默认 2000ms', async () => {
    await expect(loadDebounceMs('__VITE_AUTOSAVE_DEBOUNCE_MS__')).resolves.toBe(
      2000,
    )
  })

  it.each(['', 'abc', '0', '-100'])('非法值 %j 回退默认 2000ms', async (raw) => {
    await expect(loadDebounceMs(raw)).resolves.toBe(2000)
  })
})
