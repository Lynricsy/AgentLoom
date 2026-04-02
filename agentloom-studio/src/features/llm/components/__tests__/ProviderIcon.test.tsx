import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ProviderIcon } from '../ProviderIcon'

vi.mock('lucide-react', () => ({
  Bot: ({ className, size }: { className?: string; size?: number }) => (
    <svg data-testid="icon-bot" className={className} width={size} height={size} />
  ),
}))

describe('ProviderIcon', () => {
  it('slug prop builds lobehub CDN URL', () => {
    render(<ProviderIcon slug="openai" />)
    const img = screen.getByRole('img')
    expect(img).toHaveAttribute(
      'src',
      'https://icons.lobehub.com/icons/openai/color.svg',
    )
    expect(img).toHaveAttribute('alt', 'openai')
  })

  it('deprecated provider prop still works', () => {
    render(<ProviderIcon provider="anthropic" />)
    const img = screen.getByRole('img')
    expect(img).toHaveAttribute(
      'src',
      'https://icons.lobehub.com/icons/anthropic/color.svg',
    )
    expect(img).toHaveAttribute('alt', 'anthropic')
  })

  it('slug takes precedence over provider', () => {
    render(<ProviderIcon slug="deepseek" provider="openai" />)
    const img = screen.getByRole('img')
    expect(img).toHaveAttribute(
      'src',
      'https://icons.lobehub.com/icons/deepseek/color.svg',
    )
  })

  it('iconUrl overrides the CDN URL', () => {
    render(<ProviderIcon slug="custom" iconUrl="https://example.com/icon.svg" />)
    const img = screen.getByRole('img')
    expect(img).toHaveAttribute('src', 'https://example.com/icon.svg')
  })

  it('falls back to Bot icon on image load error', () => {
    render(<ProviderIcon slug="nonexistent" />)
    const img = screen.getByRole('img')
    fireEvent.error(img)
    expect(screen.getByTestId('icon-bot')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('default size is 20', () => {
    render(<ProviderIcon slug="openai" />)
    const img = screen.getByRole('img')
    expect(img).toHaveAttribute('width', '20')
    expect(img).toHaveAttribute('height', '20')
  })

  it('custom size is applied', () => {
    render(<ProviderIcon slug="openai" size={32} />)
    const img = screen.getByRole('img')
    expect(img).toHaveAttribute('width', '32')
    expect(img).toHaveAttribute('height', '32')
  })

  it('custom className is applied', () => {
    render(<ProviderIcon slug="openai" className="text-blue-400" />)
    const img = screen.getByRole('img')
    expect(img).toHaveClass('text-blue-400')
  })

  it('fallback Bot icon receives className', () => {
    render(<ProviderIcon slug="bad" className="text-red-500" />)
    fireEvent.error(screen.getByRole('img'))
    const bot = screen.getByTestId('icon-bot')
    expect(bot).toHaveClass('text-red-500')
  })

  it('resolves to "unknown" when neither slug nor provider given', () => {
    render(<ProviderIcon />)
    const img = screen.getByRole('img')
    expect(img).toHaveAttribute(
      'src',
      'https://icons.lobehub.com/icons/unknown/color.svg',
    )
    expect(img).toHaveAttribute('alt', 'unknown')
  })

  it('null iconUrl falls back to CDN URL', () => {
    render(<ProviderIcon slug="google" iconUrl={null} />)
    const img = screen.getByRole('img')
    expect(img).toHaveAttribute(
      'src',
      'https://icons.lobehub.com/icons/google/color.svg',
    )
  })

  it('img has lazy loading attribute', () => {
    render(<ProviderIcon slug="openai" />)
    const img = screen.getByRole('img')
    expect(img).toHaveAttribute('loading', 'lazy')
  })
})
