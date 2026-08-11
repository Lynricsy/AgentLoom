import { memo, useCallback, useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'

interface TerminalInstanceProps {
  sessionId: string
  initialOutput?: string[]
  liveOutput: string[]
  onInput: (data: string) => void
}

/** xterm 主题（暗色终端区维持现状）；导出供外层容器底色复用，避免颜色两处各写一份。 */
export const TERMINAL_THEME = {
  background: '#1a1a2e',
  foreground: '#e0e0e0',
  cursor: '#e0e0e0',
  cursorAccent: '#1a1a2e',
  selectionBackground: '#3a3a5e',
  selectionForeground: '#ffffff',
  black: '#1a1a2e',
  red: '#f87171',
  green: '#4ade80',
  yellow: '#facc15',
  blue: '#60a5fa',
  magenta: '#c084fc',
  cyan: '#22d3ee',
  white: '#e0e0e0',
  brightBlack: '#4a4a6e',
  brightRed: '#fca5a5',
  brightGreen: '#86efac',
  brightYellow: '#fde68a',
  brightBlue: '#93c5fd',
  brightMagenta: '#d8b4fe',
  brightCyan: '#67e8f9',
  brightWhite: '#ffffff',
} as const

export const TerminalInstance = memo(function TerminalInstance({
  sessionId,
  initialOutput,
  liveOutput,
  onInput,
}: TerminalInstanceProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const writtenLinesRef = useRef(0)
  const onInputRef = useRef(onInput)
  onInputRef.current = onInput

  const handleInput = useCallback((data: string) => {
    onInputRef.current(data)
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const fitAddon = new FitAddon()
    const webLinksAddon = new WebLinksAddon()

    const term = new Terminal({
      theme: TERMINAL_THEME,
      cols: 120,
      rows: 40,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
      fontSize: 13,
      lineHeight: 1.25,
      cursorBlink: true,
      cursorStyle: 'bar',
      scrollback: 10_000,
      convertEol: true,
      allowProposedApi: true,
    })

    term.loadAddon(fitAddon)
    term.loadAddon(webLinksAddon)
    term.open(container)

    try {
      fitAddon.fit()
    } catch {
      // FitAddon throws when container has zero dimensions
    }

    terminalRef.current = term
    fitAddonRef.current = fitAddon
    writtenLinesRef.current = 0

    const inputDisposable = term.onData(handleInput)

    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit()
      } catch {
        // FitAddon throws when container has zero dimensions
      }
    })
    resizeObserver.observe(container)

    return () => {
      inputDisposable.dispose()
      resizeObserver.disconnect()
      term.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
      writtenLinesRef.current = 0
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sessionId forces terminal recreation on session switch
  }, [sessionId, handleInput])

  useEffect(() => {
    const term = terminalRef.current
    if (!term || !initialOutput || initialOutput.length === 0) return

    for (const line of initialOutput) {
      if (line !== undefined) {
        term.write(line)
      }
    }
    writtenLinesRef.current = 0
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sessionId forces re-write of history on session switch
  }, [initialOutput, sessionId])

  useEffect(() => {
    const term = terminalRef.current
    if (!term) return

    const startIdx = writtenLinesRef.current
    if (startIdx >= liveOutput.length) return

    for (let i = startIdx; i < liveOutput.length; i++) {
      const chunk = liveOutput[i]
      if (chunk !== undefined) {
        term.write(chunk)
      }
    }
    writtenLinesRef.current = liveOutput.length
  }, [liveOutput])

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      data-testid={`terminal-instance-${sessionId}`}
    />
  )
})
