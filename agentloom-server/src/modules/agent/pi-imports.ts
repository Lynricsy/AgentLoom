// CRITICAL: These packages are ESM-only. They MUST be imported via dynamic import()
// in the CJS NestJS server context. DO NOT use top-level static imports.
// Following the established pattern from pi-ai-adapter.ts.

export async function importPiAgentCore() {
  return await import('@earendil-works/pi-agent-core');
}

export async function importPiAi() {
  return await import('@earendil-works/pi-ai');
}

// pi-ai 0.84 把 getModel/complete/stream 等顶层便利函数移到 /compat 子路径。
// pi-agent-core 的 Agent 需要显式注入 streamFn，这里提供 compat 的 streamSimple。
export async function importPiAiCompat() {
  return await import('@earendil-works/pi-ai/compat');
}
