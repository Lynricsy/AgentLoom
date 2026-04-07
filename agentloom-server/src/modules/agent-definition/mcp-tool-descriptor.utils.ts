type GenericRecord = Record<string, unknown>;

export interface McpToolDescriptor {
  mcpServerConfigId: string;
  toolName: string;
  mcpToolDefinitionId?: string;
  inputSchema?: Record<string, unknown>;
  portMapping?: Record<string, unknown>;
}

function isRecord(value: unknown): value is GenericRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readFirstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value !== 'string') {
      continue;
    }

    const normalized = value.trim();
    if (normalized.length > 0) {
      return normalized;
    }
  }

  return undefined;
}

function readStringArray(...values: unknown[]): string[] {
  for (const value of values) {
    if (!Array.isArray(value)) {
      continue;
    }

    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  return [];
}

export function resolveMcpServerConfigId(
  record: GenericRecord,
): string | undefined {
  return readFirstString(
    record.mcpServerConfigId,
    record.mcp_server_config_id,
    record.mcpServerId,
    record.mcp_server_id,
  );
}

export function resolveMcpPortMapping(
  record: GenericRecord,
): Record<string, unknown> | undefined {
  const candidate = [
    record.portMapping,
    record.port_mapping,
    record.portMappingMetadata,
    record.port_mapping_metadata,
  ].find((value) => isRecord(value));

  return isRecord(candidate) ? candidate : undefined;
}

export function extractMcpToolDescriptors(
  record: GenericRecord,
): McpToolDescriptor[] {
  const topLevelPortMapping = resolveMcpPortMapping(record);
  const topLevelInputSchema = [record.inputSchema, record.input_schema].find(
    (value) => isRecord(value),
  );
  const topLevelConfigId = resolveMcpServerConfigId(record);
  const enabledToolIds = readStringArray(
    record.enabledToolIds,
    record.enabled_tool_ids,
  );
  const tools = Array.isArray(record.tools) ? record.tools : [];
  const descriptors: McpToolDescriptor[] = [];

  for (const tool of tools) {
    if (!isRecord(tool)) {
      continue;
    }

    const toolId = readFirstString(
      tool.id,
      tool.mcpToolDefinitionId,
      tool.mcp_tool_definition_id,
    );

    if (
      enabledToolIds.length > 0 &&
      (!toolId || !enabledToolIds.includes(toolId))
    ) {
      continue;
    }

    const mcpServerConfigId =
      resolveMcpServerConfigId(tool) ?? topLevelConfigId;
    const toolName = readFirstString(
      tool.toolName,
      tool.tool_name,
      tool.name,
      tool.title,
    );

    if (!mcpServerConfigId || !toolName) {
      continue;
    }

    const inputSchema = [tool.inputSchema, tool.input_schema].find((value) =>
      isRecord(value),
    );
    const portMapping = resolveMcpPortMapping(tool) ?? topLevelPortMapping;

    descriptors.push({
      mcpServerConfigId,
      toolName,
      ...(toolId ? { mcpToolDefinitionId: toolId } : {}),
      ...(isRecord(inputSchema)
        ? { inputSchema }
        : isRecord(topLevelInputSchema)
          ? { inputSchema: topLevelInputSchema }
          : {}),
      ...(portMapping ? { portMapping } : {}),
    });
  }

  if (descriptors.length > 0) {
    return descriptors;
  }

  const toolName = readFirstString(record.toolName, record.tool_name);
  if (!topLevelConfigId || !toolName) {
    return [];
  }

  return [
    {
      mcpServerConfigId: topLevelConfigId,
      toolName,
      ...(readFirstString(
        record.mcpToolDefinitionId,
        record.mcp_tool_definition_id,
      )
        ? {
            mcpToolDefinitionId: readFirstString(
              record.mcpToolDefinitionId,
              record.mcp_tool_definition_id,
            )!,
          }
        : {}),
      ...(isRecord(topLevelInputSchema)
        ? { inputSchema: topLevelInputSchema }
        : {}),
      ...(topLevelPortMapping ? { portMapping: topLevelPortMapping } : {}),
    },
  ];
}
