import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ProviderIcon } from '../ProviderIcon'

describe('ProviderIcon', () => {
  it('private_cloud 提供者渲染 Server 图标', () => {
    const { container } = render(<ProviderIcon provider="private_cloud" />)
    const svgElement = container.querySelector('svg')
    expect(svgElement).toBeInTheDocument()
    expect(svgElement).toHaveAttribute('width', '16')
    expect(svgElement).toHaveAttribute('height', '16')
  })

  it('openai 提供者渲染对应图标', () => {
    const { container } = render(<ProviderIcon provider="openai" />)
    const svgElement = container.querySelector('svg')
    expect(svgElement).toBeInTheDocument()
  })

  it('自定义 size 属性生效', () => {
    const { container } = render(<ProviderIcon provider="private_cloud" size={24} />)
    const svgElement = container.querySelector('svg')
    expect(svgElement).toHaveAttribute('width', '24')
    expect(svgElement).toHaveAttribute('height', '24')
  })

  it('自定义 className 属性生效', () => {
    const { container } = render(<ProviderIcon provider="private_cloud" className="text-red-500" />)
    const svgElement = container.querySelector('svg')
    expect(svgElement).toHaveClass('text-red-500')
  })
})
