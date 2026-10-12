import { describe, expect, it } from 'vitest'
import { EMPTY_VALUE, formatBytes, formatDate, formatDateTime, formatPercent } from '../format'

const NBSP = '\u00A0'

describe('formatBytes', () => {
  it('按 1024 进制进位并在单位边界切换', () => {
    expect(formatBytes(0)).toBe(`0${NBSP}B`)
    expect(formatBytes(1023)).toBe(`1,023${NBSP}B`)
    expect(formatBytes(1024)).toBe(`1${NBSP}KB`)
    expect(formatBytes(1536)).toBe(`1.5${NBSP}KB`)
    expect(formatBytes(1024 * 1024 * 3)).toBe(`3${NBSP}MB`)
  })

  it('空值、负数与非有限数返回占位符', () => {
    expect(formatBytes(null)).toBe(EMPTY_VALUE)
    expect(formatBytes(undefined)).toBe(EMPTY_VALUE)
    expect(formatBytes(-1)).toBe(EMPTY_VALUE)
    expect(formatBytes(Number.NaN)).toBe(EMPTY_VALUE)
  })
})

describe('formatDateTime / formatDate', () => {
  it('空值与无效日期返回占位符而非 Invalid Date', () => {
    expect(formatDateTime(null)).toBe(EMPTY_VALUE)
    expect(formatDateTime('')).toBe(EMPTY_VALUE)
    expect(formatDate('not-a-date')).toBe(EMPTY_VALUE)
  })

  it('有效日期包含年份', () => {
    expect(formatDate('2026-10-07T13:55:00Z')).toContain('2026')
  })
})

describe('formatPercent', () => {
  it('比例转百分比并控制小数位', () => {
    expect(formatPercent(0.8734)).toBe('87.3%')
    expect(formatPercent(0.5, 0)).toBe('50%')
  })
})
