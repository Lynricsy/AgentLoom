// CRITICAL: These packages are ESM-only. They MUST be imported via dynamic import()
// in the CJS NestJS server context. DO NOT use top-level static imports.
// Following the established pattern from pi-ai-adapter.ts.

export async function importPiAgentCore() {
  return await import('@mariozechner/pi-agent-core');
}

export async function importPiAi() {
  return await import('@mariozechner/pi-ai');
}
