export type OutputContentFormat = 'markdown' | 'json' | 'plain'

interface OutputPreviewOptions {
  format: OutputContentFormat
  output?: string | null
  isStreaming?: boolean
  maxChars: number
}

export type ParsedJsonOutput =
  | { ok: true; value: unknown }
  | { ok: false }

function normalizePreviewText(value: string): string {
  return value
    .replace(/```[\w-]*\n?/g, '')
    .replace(/```/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function parseJsonOutput(output: string): ParsedJsonOutput {
  try {
    return {
      ok: true,
      value: JSON.parse(output) as unknown,
    }
  } catch {
    return { ok: false }
  }
}

export function getOutputContentFormat(nodeType: string): OutputContentFormat {
  switch (nodeType) {
    case 'text-output':
      return 'markdown'
    case 'json-output':
      return 'json'
    default:
      return 'plain'
  }
}

export function buildOutputPreviewText({
  format,
  output,
  isStreaming = false,
  maxChars,
}: OutputPreviewOptions): string | null {
  if (!output) {
    return null
  }

  const rawPreview =
    format === 'json' && !isStreaming
      ? (() => {
          const parsed = parseJsonOutput(output)
          return parsed.ok ? JSON.stringify(parsed.value, null, 2) : output
        })()
      : output

  const normalized = normalizePreviewText(rawPreview)
  if (!normalized) {
    return null
  }

  return normalized.length > maxChars
    ? `${normalized.slice(0, maxChars)}…`
    : normalized
}
