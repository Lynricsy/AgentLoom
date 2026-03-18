import type { AutonomyMode } from './dto/autonomy.dto';

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

export function syncAutonomyModeMirrors(
  nodeData: unknown,
  autonomyMode: AutonomyMode,
): Record<string, unknown> {
  const normalizedNodeData = asRecord(nodeData);
  const autonomyConfig = asRecord(normalizedNodeData.autonomyConfig);
  const config = asRecord(normalizedNodeData.config);
  const settings = asRecord(normalizedNodeData.settings);

  return {
    ...normalizedNodeData,
    autonomyMode,
    autonomyConfig: {
      ...autonomyConfig,
      mode: autonomyMode,
    },
    config: {
      ...config,
      autonomyMode,
    },
    settings: {
      ...settings,
      autonomyMode,
    },
  };
}
