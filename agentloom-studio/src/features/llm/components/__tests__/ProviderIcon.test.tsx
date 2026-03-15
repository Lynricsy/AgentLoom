import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ProviderIcon } from '../ProviderIcon'

vi.mock('lucide-react', () => ({
  Sparkles: ({ className, size }: { className?: string; size?: number }) => (
    <svg data-testid="icon-sparkles" className={className} width={size} height={size} />
  ),
  Bot: ({ className, size }: { className?: string; size?: number }) => (
    <svg data-testid="icon-bot" className={className} width={size} height={size} />
  ),
  Globe: ({ className, size }: { className?: string; size?: number }) => (
    <svg data-testid="icon-globe" className={className} width={size} height={size} />
  ),
  Search: ({ className, size }: { className?: string; size?: number }) => (
    <svg data-testid="icon-search" className={className} width={size} height={size} />
  ),
  Settings: ({ className, size }: { className?: string; size?: number }) => (
    <svg data-testid="icon-settings" className={className} width={size} height={size} />
  ),
  Server: ({ className, size }: { className?: string; size?: number }) => (
    <svg data-testid="icon-server" className={className} width={size} height={size} />
  ),
}))

describe('ProviderIcon', () => {
  it('openai 渲染 Sparkles 图标', () => {
    render(<ProviderIcon provider="openai" />)
    expect(screen.getByTestId('icon-sparkles')).toBeInTheDocument()
  })

  it('anthropic 渲染 Bot 图标', () => {
    render(<ProviderIcon provider="anthropic" />)
    expect(screen.getByTestId('icon-bot')).toBeInTheDocument()
  })

  it('google 渲染 Globe 图标', () => {
    render(<ProviderIcon provider="google" />)
    expect(screen.getByTestId('icon-globe')).toBeInTheDocument()
  })

  it('deepseek 渲染 Search 图标', () => {
    render(<ProviderIcon provider="deepseek" />)
    expect(screen.getByTestId('icon-search')).toBeInTheDocument()
  })

  it('custom 渲染 Settings 图标', () => {
    render(<ProviderIcon provider="custom" />)
    expect(screen.getByTestId('icon-settings')).toBeInTheDocument()
  })

  it('private_cloud 渲染 Server 图标', () => {
    render(<ProviderIcon provider="private_cloud" />)
    expect(screen.getByTestId('icon-server')).toBeInTheDocument()
  })

  it('未知 provider 回退到 Settings 图标', () => {
    render(<ProviderIcon provider={'unknown_provider' as never} />)
    expect(screen.getByTestId('icon-settings')).toBeInTheDocument()
  })

  it('自定义 size 属性生效', () => {
    render(<ProviderIcon provider="openai" size={24} />)
    const icon = screen.getByTestId('icon-sparkles')
    expect(icon).toHaveAttribute('width', '24')
    expect(icon).toHaveAttribute('height', '24')
  })

  it('自定义 className 属性生效', () => {
    render(<ProviderIcon provider="private_cloud" className="text-blue-400" />)
    const icon = screen.getByTestId('icon-server')
    expect(icon).toHaveClass('text-blue-400')
  })

  it('默认 size 为 16', () => {
    render(<ProviderIcon provider="google" />)
    const icon = screen.getByTestId('icon-globe')
    expect(icon).toHaveAttribute('width', '16')
    expect(icon).toHaveAttribute('height', '16')
  })
})
