import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useLevelOfDetail } from './useLevelOfDetail'

const mockUseViewport = vi.fn()

vi.mock('@xyflow/react', () => ({
  useViewport: () => mockUseViewport(),
}))

describe('useLevelOfDetail', () => {
  beforeEach(() => {
    mockUseViewport.mockReset()
  })

  it('returns full when zoom is above the full threshold', () => {
    mockUseViewport.mockReturnValue({ zoom: 1 })

    const { result } = renderHook(() => useLevelOfDetail())

    expect(result.current).toBe('full')
  })

  it('returns full exactly at the 0.7 boundary', () => {
    mockUseViewport.mockReturnValue({ zoom: 0.7 })

    const { result } = renderHook(() => useLevelOfDetail())

    expect(result.current).toBe('full')
  })

  it('returns compact between the compact and full thresholds', () => {
    mockUseViewport.mockReturnValue({ zoom: 0.5 })

    const { result } = renderHook(() => useLevelOfDetail())

    expect(result.current).toBe('compact')
  })

  it('returns compact exactly at the 0.4 boundary', () => {
    mockUseViewport.mockReturnValue({ zoom: 0.4 })

    const { result } = renderHook(() => useLevelOfDetail())

    expect(result.current).toBe('compact')
  })

  it('returns minimal below the compact threshold', () => {
    mockUseViewport.mockReturnValue({ zoom: 0.39 })

    const { result } = renderHook(() => useLevelOfDetail())

    expect(result.current).toBe('minimal')
  })
})
