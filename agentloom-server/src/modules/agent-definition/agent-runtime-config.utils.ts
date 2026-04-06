import type {
  AgentKnowledgeBinding,
  AgentRuntimeConfig,
  AgentSubAgentRef,
  AgentToolBinding,
} from './agent-runtime-config.interface';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getToolBindingKey(binding: AgentToolBinding): string {
  if (
    binding.toolType === 'mcp' &&
    typeof binding.mcpServerConfigId === 'string' &&
    typeof binding.toolName === 'string'
  ) {
    return `mcp:${binding.mcpServerConfigId}:${binding.toolName}`;
  }

  return `${binding.toolType ?? 'legacy'}:${binding.toolId}`;
}

function mergeToolBindings(
  current: AgentToolBinding[],
  incoming: AgentToolBinding[],
): AgentToolBinding[] {
  const merged = [...current];
  const seen = new Set(current.map((binding) => getToolBindingKey(binding)));

  for (const binding of incoming) {
    const key = getToolBindingKey(binding);
    if (seen.has(key)) {
      continue;
    }

    merged.push(binding);
    seen.add(key);
  }

  return merged;
}

function mergeKnowledgeBindings(
  current: AgentKnowledgeBinding[],
  incoming: AgentKnowledgeBinding[],
): AgentKnowledgeBinding[] {
  const merged = [...current];
  const seen = new Set(current.map((binding) => binding.knowledgeBaseId));

  for (const binding of incoming) {
    if (seen.has(binding.knowledgeBaseId)) {
      continue;
    }

    merged.push(binding);
    seen.add(binding.knowledgeBaseId);
  }

  return merged;
}

function mergeSubAgentRefs(
  current: AgentSubAgentRef[],
  incoming: AgentSubAgentRef[],
): AgentSubAgentRef[] {
  const merged = [...current];
  const seen = new Set(current.map((binding) => binding.alias));

  for (const ref of incoming) {
    if (seen.has(ref.alias)) {
      continue;
    }

    merged.push(ref);
    seen.add(ref.alias);
  }

  return merged;
}

function mergeStringValues(current: string[], incoming: string[]): string[] {
  return Array.from(new Set([...current, ...incoming]));
}

export function cloneAgentRuntimeConfig(
  runtimeConfig: AgentRuntimeConfig,
): AgentRuntimeConfig {
  return {
    ...runtimeConfig,
    ...(runtimeConfig.modelConfig
      ? { modelConfig: { ...runtimeConfig.modelConfig } }
      : {}),
    ...(runtimeConfig.tools ? { tools: [...runtimeConfig.tools] } : {}),
    ...(runtimeConfig.knowledgeBindings
      ? { knowledgeBindings: [...runtimeConfig.knowledgeBindings] }
      : {}),
    ...(runtimeConfig.subAgents
      ? { subAgents: [...runtimeConfig.subAgents] }
      : {}),
    ...(runtimeConfig.inputPreprocessors
      ? { inputPreprocessors: [...runtimeConfig.inputPreprocessors] }
      : {}),
    ...(runtimeConfig.sandboxConfig
      ? { sandboxConfig: { ...runtimeConfig.sandboxConfig } }
      : {}),
    ...(runtimeConfig.routingConfig
      ? { routingConfig: { ...runtimeConfig.routingConfig } }
      : {}),
    ...(runtimeConfig.memoryInstanceIds
      ? { memoryInstanceIds: [...runtimeConfig.memoryInstanceIds] }
      : {}),
    ...(runtimeConfig.skillIds
      ? { skillIds: [...runtimeConfig.skillIds] }
      : {}),
    ...(runtimeConfig.outputSchema
      ? { outputSchema: { ...runtimeConfig.outputSchema } }
      : {}),
    ...(runtimeConfig.nativeToolPolicy
      ? { nativeToolPolicy: { ...runtimeConfig.nativeToolPolicy } }
      : {}),
    ...(runtimeConfig.selfEvolutionPolicy
      ? { selfEvolutionPolicy: { ...runtimeConfig.selfEvolutionPolicy } }
      : {}),
  };
}

export function mergeRuntimeConfigWithSubAgentRef(
  runtimeConfig: AgentRuntimeConfig,
  subAgentRef?: AgentSubAgentRef,
): AgentRuntimeConfig {
  const merged = cloneAgentRuntimeConfig(runtimeConfig);
  if (!subAgentRef) {
    return merged;
  }

  const overrides = subAgentRef.overrides;
  if (overrides?.modelConfig) {
    merged.modelConfig = { ...overrides.modelConfig };
    merged.routingConfig = undefined;
  }
  if (overrides?.routingConfig) {
    merged.routingConfig = { ...overrides.routingConfig };
  }
  if (overrides?.outputSchema) {
    merged.outputSchema = { ...overrides.outputSchema };
  }

  const extensions = subAgentRef.extensions;
  if (extensions?.tools?.length) {
    merged.tools = mergeToolBindings(merged.tools ?? [], extensions.tools);
  }
  if (extensions?.knowledgeBindings?.length) {
    merged.knowledgeBindings = mergeKnowledgeBindings(
      merged.knowledgeBindings ?? [],
      extensions.knowledgeBindings,
    );
  }
  if (extensions?.subAgents?.length) {
    merged.subAgents = mergeSubAgentRefs(
      merged.subAgents ?? [],
      extensions.subAgents,
    );
  }
  if (extensions?.memoryInstanceIds?.length) {
    merged.memoryInstanceIds = mergeStringValues(
      merged.memoryInstanceIds ?? [],
      extensions.memoryInstanceIds,
    );
  }
  if (extensions?.skillIds?.length) {
    merged.skillIds = mergeStringValues(
      merged.skillIds ?? [],
      extensions.skillIds,
    );
  }

  return merged;
}

export function coerceAgentOutputSchema(
  value: unknown,
): Record<string, unknown> | undefined {
  if (isRecord(value)) {
    return value;
  }

  if (typeof value !== 'string' || value.trim().length === 0) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function appendOutputSchemaToSystemPrompt(
  systemPrompt: string | undefined,
  outputSchema: unknown,
): string | undefined {
  const normalizedSchema = coerceAgentOutputSchema(outputSchema);
  if (!normalizedSchema) {
    return systemPrompt;
  }

  const schemaInstruction = `You MUST return valid JSON matching this schema:\n${JSON.stringify(
    normalizedSchema,
    null,
    2,
  )}`;
  const sections = [systemPrompt?.trim(), schemaInstruction].filter(
    (value): value is string => Boolean(value && value.trim().length > 0),
  );

  return sections.length > 0 ? sections.join('\n\n') : undefined;
}

export function resolveSubAgentSystemPrompt(
  baseSystemPrompt: string | undefined,
  subAgentRef?: AgentSubAgentRef,
): string | undefined {
  const override = subAgentRef?.overrides?.systemPrompt?.trim();
  return override && override.length > 0 ? override : baseSystemPrompt;
}
