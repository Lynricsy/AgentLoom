import { describe, expect, it } from 'vitest'
import { buildCompoundChildExtent, clampPositionToExtent, getCompoundFrameInsets, getCompoundInitialChildPosition, resolveCompoundContainerSize } from './compoundLayout'

describe('compoundLayout', () => {
  it('为展开态 compound 提供适中的默认容器尺寸', () => {
    const size = resolveCompoundContainerSize({
      inputPortCount: 2,
      outputPortCount: 1,
    })

    expect(size).toEqual({
      width: 600,
      height: 540,
    })
  })

  it('把子节点 extent 对齐到可见循环体内框本身，并在 clamp 时再扣除节点尺寸', () => {
    const frameInsets = getCompoundFrameInsets(2, 1)
    const extent = buildCompoundChildExtent({
      inputPortCount: 2,
      outputPortCount: 1,
      width: 800,
      height: 600,
    })

    expect(extent).toEqual([
      [frameInsets.left + 16, frameInsets.top + 16],
      [800 - frameInsets.right - 16, 600 - frameInsets.bottom - 16],
    ])

    const clamped = clampPositionToExtent({ x: 9999, y: 9999 }, extent, {
      childWidth: 260,
      childHeight: 160,
    })

    expect(clamped).toEqual({
      x: extent[1][0] - 260,
      y: extent[1][1] - 160,
    })
    expect(clamped.x - extent[0][0]).toBeGreaterThanOrEqual(400)
    expect(clamped.y - extent[0][1]).toBeGreaterThanOrEqual(150)
    expect(
      getCompoundInitialChildPosition({
        inputPortCount: 2,
        outputPortCount: 1,
        width: 800,
        height: 600,
      }),
    ).toEqual({
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

    expect(
      clampPositionToExtent({ x: -40, y: 12 }, extent, {
        childWidth: 260,
        childHeight: 160,
      }),
    ).toEqual({
      x: extent[0][0],
      y: extent[0][1],
    })
    expect(
      clampPositionToExtent({ x: 9999, y: 9999 }, extent, {
        childWidth: 260,
        childHeight: 160,
      }),
    ).toEqual({
      x: extent[1][0] - 260,
      y: extent[1][1] - 160,
    })
  })
})
