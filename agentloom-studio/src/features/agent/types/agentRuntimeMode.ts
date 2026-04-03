export const AGENT_RUNTIME_MODES = ['sandbox', 'no_sandbox'] as const

export type AgentRuntimeMode = (typeof AGENT_RUNTIME_MODES)[number]

export function isNoSandboxRuntimeMode(
  runtimeMode: AgentRuntimeMode | null | undefined,
): boolean {
  return runtimeMode === 'no_sandbox'
}
