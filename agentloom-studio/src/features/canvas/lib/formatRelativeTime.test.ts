import { describe, expect, it } from 'vitest'
import { formatRelativeTime } from './formatRelativeTime'

describe('formatRelativeTime', () => {
  const now = new Date('2025-03-08T12:00:00Z')

  it('returns 刚刚 for less than 60 seconds ago', () => {
    const date = new Date(now.getTime() - 30 * 1000)
    expect(formatRelativeTime(date, now)).toBe('刚刚')
  })

  it('returns 刚刚 for exactly now', () => {
    expect(formatRelativeTime(now, now)).toBe('刚刚')
  })

  it('returns 刚刚 for future dates', () => {
    const future = new Date(now.getTime() + 60 * 1000)
    expect(formatRelativeTime(future, now)).toBe('刚刚')
  })

  it('returns X分钟前 for minutes', () => {
    const date = new Date(now.getTime() - 5 * 60 * 1000)
    expect(formatRelativeTime(date, now)).toBe('5分钟前')
  })

  it('returns 1分钟前 for exactly 60 seconds', () => {
    const date = new Date(now.getTime() - 60 * 1000)
    expect(formatRelativeTime(date, now)).toBe('1分钟前')
  })

  it('returns 59分钟前 for 59 minutes', () => {
    const date = new Date(now.getTime() - 59 * 60 * 1000)
    expect(formatRelativeTime(date, now)).toBe('59分钟前')
  })

  it('returns X小时前 for hours', () => {
    const date = new Date(now.getTime() - 3 * 60 * 60 * 1000)
    expect(formatRelativeTime(date, now)).toBe('3小时前')
  })

  it('returns 1小时前 for exactly 60 minutes', () => {
    const date = new Date(now.getTime() - 60 * 60 * 1000)
    expect(formatRelativeTime(date, now)).toBe('1小时前')
  })

  it('returns 23小时前 for 23 hours', () => {
    const date = new Date(now.getTime() - 23 * 60 * 60 * 1000)
    expect(formatRelativeTime(date, now)).toBe('23小时前')
  })

  it('returns X天前 for days', () => {
    const date = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
    expect(formatRelativeTime(date, now)).toBe('3天前')
  })

  it('returns 1天前 for exactly 24 hours', () => {
    const date = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    expect(formatRelativeTime(date, now)).toBe('1天前')
  })

  it('returns large day count for very old dates', () => {
    const date = new Date(now.getTime() - 100 * 24 * 60 * 60 * 1000)
    expect(formatRelativeTime(date, now)).toBe('100天前')
  })

  it('uses current time as default when now is not provided', () => {
    const recent = new Date(Date.now() - 10 * 1000)
    expect(formatRelativeTime(recent)).toBe('刚刚')
  })
})
