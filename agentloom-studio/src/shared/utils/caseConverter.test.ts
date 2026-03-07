import { describe, it, expect } from 'vitest'
import { snakeToCamel, camelToSnake } from './caseConverter'

describe('snakeToCamel', () => {
  it('应该转换对象键', () => {
    expect(snakeToCamel({ user_name: 'test', created_at: '2026-01-01' }))
      .toEqual({ userName: 'test', createdAt: '2026-01-01' })
  })

  it('应该递归处理嵌套对象', () => {
    expect(snakeToCamel({ outer_key: { inner_key: 'value' } }))
      .toEqual({ outerKey: { innerKey: 'value' } })
  })

  it('应该处理数组', () => {
    expect(snakeToCamel([{ item_name: 'a' }, { item_name: 'b' }]))
      .toEqual([{ itemName: 'a' }, { itemName: 'b' }])
  })

  it('应该保留原始值', () => {
    expect(snakeToCamel('test')).toBe('test')
    expect(snakeToCamel(42)).toBe(42)
    expect(snakeToCamel(null)).toBeNull()
  })
})

describe('camelToSnake', () => {
  it('应该转换对象键', () => {
    expect(camelToSnake({ userName: 'test', createdAt: '2026-01-01' }))
      .toEqual({ user_name: 'test', created_at: '2026-01-01' })
  })

  it('应该递归处理嵌套对象', () => {
    expect(camelToSnake({ outerKey: { innerKey: 'value' } }))
      .toEqual({ outer_key: { inner_key: 'value' } })
  })
})
