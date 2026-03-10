import { describe, expect, it } from 'vitest'

import { hasEvidenceRefs, parseEvidenceRefs } from '../parseEvidenceRefs'

describe('parseEvidenceRefs', () => {
  it('解析单个引用', () => {
    expect(parseEvidenceRefs('text [ref:abc-123] more')).toEqual([
      { type: 'text', content: 'text ' },
      { type: 'ref', evidenceId: 'abc-123', index: 1 },
      { type: 'text', content: ' more' },
    ])
  })

  it('解析多个引用', () => {
    expect(parseEvidenceRefs('[ref:a] and [ref:b]')).toEqual([
      { type: 'ref', evidenceId: 'a', index: 1 },
      { type: 'text', content: ' and ' },
      { type: 'ref', evidenceId: 'b', index: 2 },
    ])
  })

  it('无引用返回原文', () => {
    expect(parseEvidenceRefs('no refs here')).toEqual([
      { type: 'text', content: 'no refs here' },
    ])
  })

  it('空字符串返回空数组', () => {
    expect(parseEvidenceRefs('')).toEqual([])
  })

  it('hasEvidenceRefs 检测', () => {
    expect(hasEvidenceRefs('before [ref:abc-123] after')).toBe(true)
    expect(hasEvidenceRefs('without refs')).toBe(false)
  })

  it('连续引用', () => {
    expect(parseEvidenceRefs('[ref:a][ref:b]')).toEqual([
      { type: 'ref', evidenceId: 'a', index: 1 },
      { type: 'ref', evidenceId: 'b', index: 2 },
    ])
  })

  it('不匹配无效ID格式', () => {
    const input = '[ref:] and [ref:a b]'

    expect(parseEvidenceRefs(input)).toEqual([
      { type: 'text', content: input },
    ])
    expect(hasEvidenceRefs(input)).toBe(false)
  })
})
