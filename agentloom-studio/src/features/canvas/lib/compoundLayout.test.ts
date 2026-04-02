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

  it('把子节点 extent 收紧到可见循环体内框内部并保留足够的二维移动空间', () => {
    const frameInsets = getCompoundFrameInsets(2, 1)
    const extent = buildCompoundChildExtent({
      inputPortCount: 2,
      outputPortCount: 1,
      width: 800,
      height: 600,
      childWidth: 260,
      childHeight: 160,
    })

    expect(extent[0][0]).toBeGreaterThan(frameInsets.left)
    expect(extent[0][1]).toBeGreaterThan(frameInsets.top)
    expect(extent[1][0]).toBeLessThan(800 - frameInsets.right)
    expect(extent[1][1]).toBeLessThan(600 - frameInsets.bottom)
    expect(extent[1][0] - extent[0][0]).toBeGreaterThanOrEqual(200)
    expect(extent[1][1] - extent[0][1]).toBeGreaterThanOrEqual(80)
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
      childWidth: 260,
      childHeight: 160,
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
