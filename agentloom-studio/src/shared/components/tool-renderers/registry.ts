import type { ToolRendererDefinition } from './types'

/**
 * Registry of tool renderers, keyed by exact tool name.
 * Supports both exact match and pattern-based fallback.
 */
const exactRegistry = new Map<string, ToolRendererDefinition>()

/**
 * Pattern-based matchers evaluated in order when exact match fails.
 * Each entry is a [predicate, definition] tuple.
 */
const patternMatchers: Array<{
  test: (toolName: string) => boolean
  definition: ToolRendererDefinition
}> = []

/**
 * Register a tool renderer for an exact tool name.
 */
export function registerToolRenderer(
  name: string,
  definition: ToolRendererDefinition,
): void {
  exactRegistry.set(name, definition)
}

/**
 * Register a tool renderer for a set of exact names at once.
 */
export function registerToolRendererBatch(
  names: string[],
  definition: ToolRendererDefinition,
): void {
  for (const name of names) {
    exactRegistry.set(name, definition)
  }
}

/**
 * Register a pattern-based tool renderer. The predicate is tested
 * against the tool name when no exact match is found.
 */
export function registerToolRendererPattern(
  test: (toolName: string) => boolean,
  definition: ToolRendererDefinition,
): void {
  patternMatchers.push({ test, definition })
}

/**
 * Look up a tool renderer by name.
 * Resolution order: exact match -> pattern matchers -> undefined.
 */
export function getToolRenderer(
  toolName: string,
): ToolRendererDefinition | undefined {
  // 1. Exact match
  const exact = exactRegistry.get(toolName)
  if (exact) return exact

  // 2. Pattern matchers (in registration order)
  for (const matcher of patternMatchers) {
    if (matcher.test(toolName)) {
      return matcher.definition
    }
  }

  return undefined
}

/**
 * Clear all registrations. Only used in tests.
 */
export function clearToolRendererRegistry(): void {
  exactRegistry.clear()
  patternMatchers.length = 0
}
