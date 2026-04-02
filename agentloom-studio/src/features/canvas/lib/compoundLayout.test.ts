import { describe, expect, it } from 'vitest'
import {
  buildCompoundChildExtent,
  clampPositionToExtent,
  getCompoundFrameInsets,
  getCompoundInitialChildPosition,
  resolveCompoundContainerSize,
} from './compoundLayout'

describe('compoundLayout', () => {
  it('为展开态 compound 提供足够大的最小容器尺寸', () => {
    const size = resolveCompoundContainerSize({
      inputPortCount: 2,
      outputPortCount: 1,
    })

    expect(size.width).toBeGreaterThanOrEqual(800)
    expect(size.height).toBeGreaterThanOrEqual(600)
  })

  it('把子节点 extent 收紧到可见循环体内框内部', () => {
    const frameInsets = getCompoundFrameInsets(2, 1)
    const extent = buildCompoundChildExtent({
      inputPortCount: 2,
      outputPortCount: 1,
      width: 800,
      height: 600,
    })

    expect(extent[0][0]).toBeGreaterThan(frameInsets.left)
    expect(extent[0][1]).toBeGreaterThan(frameInsets.top)
    expect(extent[1][0]).toBeLessThan(800 - frameInsets.right)
    expect(extent[1][1]).toBeLessThan(600 - frameInsets.bottom)
    expect(getCompoundInitialChildPosition({
      inputPortCount: 2,
      outputPortCount: 1,
      width: 800,
      height: 600,
    })).toEqual({
      x: extent[0][0],
      y: extent[0][1],
    })
  })

  it('会把越界坐标夹回 compound 内框 extent', () => {
    const extent = buildCompoundChildExtent({
      inputPortCount: 2,
      outputPortCount: 1,
      width: 800,
      height: 600,
    })

    expect(clampPositionToExtent({ x: -40, y: 12 }, extent)).toEqual({
      x: extent[0][0],
      y: extent[0][1],
    })
    expect(clampPositionToExtent({ x: 9999, y: 9999 }, extent)).toEqual({
      x: extent[1][0],
      y: extent[1][1],
    })
  })
})
