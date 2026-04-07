type GenericRecord = Record<string, unknown>;

export interface McpToolDescriptor {
  mcpServerConfigId: string;
  toolName: string;
  mcpToolDefinitionId?: string;
  inputSchema?: Record<string, unknown>;
  portMapping?: Record<string, unknown>;
}

export interface McpToolBindingValidationIssue {
  mcpServerConfigId?: string;
  enabledToolIds: string[];
  issues: string[];
  missingToolIds?: string[];
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

export function validateMcpToolBinding(
  record: GenericRecord,
): McpToolBindingValidationIssue | null {
  const mcpServerConfigId = resolveMcpServerConfigId(record);
  const enabledToolIds = readStringArray(
    record.enabledToolIds,
    record.enabled_tool_ids,
  );
  const tools = Array.isArray(record.tools)
    ? record.tools.filter((tool): tool is GenericRecord => isRecord(tool))
    : [];
  const explicitFallbackSelection = readFirstString(
    record.toolName,
    record.tool_name,
    record.mcpToolDefinitionId,
    record.mcp_tool_definition_id,
  );
  const hasAnyMcpBindingConfig =
    Boolean(mcpServerConfigId) ||
    enabledToolIds.length > 0 ||
    tools.length > 0 ||
    Boolean(explicitFallbackSelection);

  if (!hasAnyMcpBindingConfig) {
    return null;
  }

  if (enabledToolIds.length > 0 || tools.length > 0) {
    const issues: string[] = [];
    if (!mcpServerConfigId) {
      issues.push('缺少 mcpServerConfigId');
    }
    if (enabledToolIds.length === 0) {
      issues.push('enabledToolIds 为空，未显式选择具体工具');
    }
    if (tools.length === 0) {
      issues.push('tools[] 为空，缺少已选工具元数据');
    }

    const toolsById = new Map<string, GenericRecord>();
    for (const tool of tools) {
      const toolId = readFirstString(
        tool.id,
        tool.mcpToolDefinitionId,
        tool.mcp_tool_definition_id,
      );
      if (toolId) {
        toolsById.set(toolId, tool);
      }
    }

    const missingToolIds = enabledToolIds.filter((toolId) => {
      return !toolsById.has(toolId);
    });
    if (missingToolIds.length > 0) {
      issues.push(
        `enabledToolIds 中的 ${missingToolIds.join(
          '、',
        )} 未在 tools[] 中提供元数据`,
      );
    }

    const incompleteToolIds: string[] = [];
    for (const toolId of enabledToolIds) {
      const tool = toolsById.get(toolId);
      if (!tool) {
        continue;
      }

      const toolName = readFirstString(
        tool.toolName,
        tool.tool_name,
        tool.name,
        tool.title,
      );
      const toolServerConfigId = resolveMcpServerConfigId(tool);
      if (!toolName || !toolServerConfigId) {
        incompleteToolIds.push(toolId);
      }
    }

    if (incompleteToolIds.length > 0) {
      issues.push(
        `tools[] 中已选工具 ${incompleteToolIds.join(
          '、',
        )} 缺少 name/toolName 或 mcpServerConfigId`,
      );
    }

    if (issues.length === 0) {
      return null;
    }

    return {
      ...(mcpServerConfigId ? { mcpServerConfigId } : {}),
      enabledToolIds,
      issues,
      ...(missingToolIds.length > 0 ? { missingToolIds } : {}),
    };
  }

  if (mcpServerConfigId && explicitFallbackSelection) {
    return null;
  }

  const issues = [
    ...(mcpServerConfigId ? [] : ['缺少 mcpServerConfigId']),
    '未选择具体工具',
  ];

  return {
    ...(mcpServerConfigId ? { mcpServerConfigId } : {}),
    enabledToolIds,
    issues,
  };
}
