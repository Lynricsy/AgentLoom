Object? _readValue(
  Map<String, dynamic> json,
  String camelKey, [
  String? snakeKey,
]) {
  if (json.containsKey(camelKey)) {
    return json[camelKey];
  }
  final fallbackKey =
      snakeKey ??
      camelKey.replaceAllMapped(
        RegExp(r'[A-Z]'),
        (match) => '_${match.group(0)!.toLowerCase()}',
      );
  if (json.containsKey(fallbackKey)) {
    return json[fallbackKey];
  }
  return null;
}

Map<String, dynamic> _asMap(Object? value) {
  if (value is Map<String, dynamic>) {
    return value;
  }
  if (value is Map<Object?, Object?>) {
    return value.map((key, item) => MapEntry('$key', item));
  }
  return <String, dynamic>{};
}

List<Object?> _asList(Object? value) {
  if (value is List<Object?>) {
    return value;
  }
  if (value is List) {
    return value.cast<Object?>();
  }
  return const <Object?>[];
}

List<String> _asStringList(Object? value) {
  return _asList(value)
      .whereType<Object?>()
      .map((item) => item?.toString() ?? '')
      .where((item) => item.isNotEmpty)
      .toList(growable: false);
}

Map<String, String> _asStringMap(Object? value) {
  final raw = _asMap(value);
  if (raw.isEmpty) {
    return const <String, String>{};
  }
  return raw.map((key, item) => MapEntry(key, item?.toString() ?? ''));
}

double _asDouble(Object? value, double fallback) {
  if (value is num) {
    return value.toDouble();
  }
  return fallback;
}

int? _asNullableInt(Object? value) {
  if (value is num) {
    return value.toInt();
  }
  return null;
}

bool _asBool(Object? value, {bool fallback = false}) {
  if (value is bool) {
    return value;
  }
  return fallback;
}

const List<String> llmProviderIds = <String>[
  'openai',
  'anthropic',
  'google',
  'deepseek',
  'custom',
  'private_cloud',
];

const List<String> llmModelTypes = <String>['chat', 'embedding'];

const List<String> llmAuthMethods = <String>['api_key', 'mtls', 'none'];

const List<String> mcpTransportTypes = <String>[
  'stdio',
  'sse',
  'streamable_http',
];

class WorkspaceDto {
  const WorkspaceDto({
    required this.id,
    required this.name,
    required this.description,
    required this.storageKey,
    required this.sizeBytes,
    required this.status,
    required this.config,
    required this.createdAt,
    required this.updatedAt,
  });

  factory WorkspaceDto.fromJson(Map<String, dynamic> json) {
    return WorkspaceDto(
      id: _readValue(json, 'id') as String? ?? '',
      name: _readValue(json, 'name') as String? ?? '',
      description: _readValue(json, 'description') as String?,
      storageKey: _readValue(json, 'storageKey') as String? ?? '',
      sizeBytes: _asNullableInt(_readValue(json, 'sizeBytes')),
      status: _readValue(json, 'status') as String? ?? 'creating',
      config: _readValue(json, 'config') == null
          ? null
          : _asMap(_readValue(json, 'config')),
      createdAt: _readValue(json, 'createdAt') as String? ?? '',
      updatedAt: _readValue(json, 'updatedAt') as String? ?? '',
    );
  }

  final String id;
  final String name;
  final String? description;
  final String storageKey;
  final int? sizeBytes;
  final String status;
  final Map<String, dynamic>? config;
  final String createdAt;
  final String updatedAt;
}

class SandboxConfigDto {
  const SandboxConfigDto({
    required this.cpu,
    required this.memory,
    required this.disk,
    required this.timeout,
    required this.lifecycleMode,
    this.name,
    this.persistenceExpiryHours,
    this.restoreWorkspaceId,
  });

  factory SandboxConfigDto.fromJson(Map<String, dynamic> json) {
    return SandboxConfigDto(
      cpu: _asDouble(_readValue(json, 'cpu'), 1),
      memory: _asNullableInt(_readValue(json, 'memory')) ?? 512,
      disk: _asNullableInt(_readValue(json, 'disk')) ?? 2,
      timeout: _asNullableInt(_readValue(json, 'timeout')) ?? 24,
      lifecycleMode: _readValue(json, 'lifecycleMode') as String? ?? 'session',
      name: _readValue(json, 'name') as String?,
      persistenceExpiryHours: _asNullableInt(
        _readValue(json, 'persistenceExpiryHours'),
      ),
      restoreWorkspaceId: _readValue(json, 'restoreWorkspaceId') as String?,
    );
  }

  final double cpu;
  final int memory;
  final int disk;
  final int timeout;
  final String lifecycleMode;
  final String? name;
  final int? persistenceExpiryHours;
  final String? restoreWorkspaceId;
}

class SandboxSessionDto {
  const SandboxSessionDto({
    required this.id,
    required this.tenantId,
    required this.status,
    required this.config,
    required this.createdAt,
    this.executionId,
    this.agentConversationId,
    this.sandboxNodeId,
    this.containerId,
    this.workspacePath,
    this.startedAt,
    this.stoppedAt,
  });

  factory SandboxSessionDto.fromJson(Map<String, dynamic> json) {
    return SandboxSessionDto(
      id: _readValue(json, 'id') as String? ?? '',
      tenantId: _readValue(json, 'tenantId') as String? ?? '',
      status: _readValue(json, 'status') as String? ?? 'creating',
      config: SandboxConfigDto.fromJson(_asMap(_readValue(json, 'config'))),
      createdAt: _readValue(json, 'createdAt') as String? ?? '',
      executionId: _readValue(json, 'executionId') as String?,
      agentConversationId: _readValue(json, 'agentConversationId') as String?,
      sandboxNodeId: _readValue(json, 'sandboxNodeId') as String?,
      containerId: _readValue(json, 'containerId') as String?,
      workspacePath: _readValue(json, 'workspacePath') as String?,
      startedAt: _readValue(json, 'startedAt') as String?,
      stoppedAt: _readValue(json, 'stoppedAt') as String?,
    );
  }

  final String id;
  final String tenantId;
  final String status;
  final SandboxConfigDto config;
  final String createdAt;
  final String? executionId;
  final String? agentConversationId;
  final String? sandboxNodeId;
  final String? containerId;
  final String? workspacePath;
  final String? startedAt;
  final String? stoppedAt;
}

class SandboxStatsDto {
  const SandboxStatsDto({
    required this.cpuPercent,
    required this.memoryUsageMb,
    required this.memoryLimitMb,
  });

  factory SandboxStatsDto.fromJson(Map<String, dynamic> json) {
    return SandboxStatsDto(
      cpuPercent: _asDouble(_readValue(json, 'cpuPercent'), 0),
      memoryUsageMb: _asDouble(_readValue(json, 'memoryUsageMb'), 0),
      memoryLimitMb: _asDouble(_readValue(json, 'memoryLimitMb'), 0),
    );
  }

  final double cpuPercent;
  final double memoryUsageMb;
  final double memoryLimitMb;
}

class SandboxLogDto {
  const SandboxLogDto({
    required this.id,
    required this.sessionId,
    required this.level,
    required this.message,
    required this.createdAt,
  });

  factory SandboxLogDto.fromJson(Map<String, dynamic> json) {
    return SandboxLogDto(
      id: _readValue(json, 'id') as String? ?? '',
      sessionId: _readValue(json, 'sessionId') as String? ?? '',
      level: _readValue(json, 'level') as String? ?? 'stdout',
      message: _readValue(json, 'message') as String? ?? '',
      createdAt: _readValue(json, 'createdAt') as String? ?? '',
    );
  }

  final String id;
  final String sessionId;
  final String level;
  final String message;
  final String createdAt;
}

class KnowledgeBaseDto {
  const KnowledgeBaseDto({
    required this.id,
    required this.tenantId,
    required this.name,
    required this.description,
    required this.visibility,
    required this.createdBy,
    required this.embeddingModel,
    required this.embeddingModelConfigId,
    required this.documentCount,
    required this.nodeCount,
    required this.chunkCount,
    required this.status,
    required this.createdAt,
    required this.updatedAt,
  });

  factory KnowledgeBaseDto.fromJson(Map<String, dynamic> json) {
    return KnowledgeBaseDto(
      id: _readValue(json, 'id') as String? ?? '',
      tenantId: _readValue(json, 'tenantId') as String? ?? '',
      name: _readValue(json, 'name') as String? ?? '',
      description: _readValue(json, 'description') as String?,
      visibility: _readValue(json, 'visibility') as String? ?? 'private',
      createdBy: _readValue(json, 'createdBy') as String? ?? '',
      embeddingModel: _readValue(json, 'embeddingModel') as String? ?? '',
      embeddingModelConfigId:
          _readValue(json, 'embeddingModelConfigId') as String?,
      documentCount: _asNullableInt(_readValue(json, 'documentCount')) ?? 0,
      nodeCount: _asNullableInt(_readValue(json, 'nodeCount')) ?? 0,
      chunkCount: _asNullableInt(_readValue(json, 'chunkCount')) ?? 0,
      status: _readValue(json, 'status') as String? ?? 'empty',
      createdAt: _readValue(json, 'createdAt') as String? ?? '',
      updatedAt: _readValue(json, 'updatedAt') as String? ?? '',
    );
  }

  final String id;
  final String tenantId;
  final String name;
  final String? description;
  final String visibility;
  final String createdBy;
  final String embeddingModel;
  final String? embeddingModelConfigId;
  final int documentCount;
  final int nodeCount;
  final int chunkCount;
  final String status;
  final String createdAt;
  final String updatedAt;
}

class KnowledgeDocumentDto {
  const KnowledgeDocumentDto({
    required this.id,
    required this.knowledgeBaseId,
    required this.fileName,
    required this.mimeType,
    required this.sizeBytes,
    required this.status,
    required this.errorMessage,
    required this.createdAt,
    required this.updatedAt,
  });

  factory KnowledgeDocumentDto.fromJson(Map<String, dynamic> json) {
    return KnowledgeDocumentDto(
      id: _readValue(json, 'id') as String? ?? '',
      knowledgeBaseId: _readValue(json, 'knowledgeBaseId') as String? ?? '',
      fileName: _readValue(json, 'fileName') as String? ?? '',
      mimeType: _readValue(json, 'mimeType') as String? ?? '',
      sizeBytes: _asNullableInt(_readValue(json, 'sizeBytes')) ?? 0,
      status: _readValue(json, 'status') as String? ?? 'uploaded',
      errorMessage: _readValue(json, 'errorMessage') as String?,
      createdAt: _readValue(json, 'createdAt') as String? ?? '',
      updatedAt: _readValue(json, 'updatedAt') as String? ?? '',
    );
  }

  final String id;
  final String knowledgeBaseId;
  final String fileName;
  final String mimeType;
  final int sizeBytes;
  final String status;
  final String? errorMessage;
  final String createdAt;
  final String updatedAt;
}

class McpConnectionConfigDto {
  const McpConnectionConfigDto({
    required this.transportType,
    this.command,
    this.args = const <String>[],
    this.env,
    this.url,
    this.headers,
  });

  factory McpConnectionConfigDto.fromJson(Map<String, dynamic> json) {
    return McpConnectionConfigDto(
      transportType: _readValue(json, 'transportType') as String? ?? 'stdio',
      command: _readValue(json, 'command') as String?,
      args: _asStringList(_readValue(json, 'args')),
      env: _asStringMap(_readValue(json, 'env')).isEmpty
          ? null
          : _asStringMap(_readValue(json, 'env')),
      url: _readValue(json, 'url') as String?,
      headers: _asStringMap(_readValue(json, 'headers')).isEmpty
          ? null
          : _asStringMap(_readValue(json, 'headers')),
    );
  }

  Map<String, dynamic> toJson() {
    if (transportType == 'stdio') {
      return <String, dynamic>{
        'transportType': transportType,
        'command': command?.trim(),
        if (args.isNotEmpty) 'args': args,
        if (env != null) 'env': env,
      };
    }

    return <String, dynamic>{
      'transportType': transportType,
      'url': url?.trim(),
      if (headers != null) 'headers': headers,
    };
  }

  final String transportType;
  final String? command;
  final List<String> args;
  final Map<String, String>? env;
  final String? url;
  final Map<String, String>? headers;
}

class McpServerInfoDto {
  const McpServerInfoDto({
    required this.name,
    required this.version,
    this.protocolVersion,
  });

  factory McpServerInfoDto.fromJson(Map<String, dynamic> json) {
    return McpServerInfoDto(
      name: _readValue(json, 'name') as String? ?? '',
      version: _readValue(json, 'version') as String? ?? '',
      protocolVersion: _readValue(json, 'protocolVersion') as String?,
    );
  }

  final String name;
  final String version;
  final String? protocolVersion;
}

class TestMcpConnectionResultDto {
  const TestMcpConnectionResultDto({required this.success, this.serverInfo});

  factory TestMcpConnectionResultDto.fromJson(Map<String, dynamic> json) {
    final serverInfoJson = _asMap(_readValue(json, 'serverInfo'));
    return TestMcpConnectionResultDto(
      success: _asBool(_readValue(json, 'success')),
      serverInfo: serverInfoJson.isEmpty
          ? null
          : McpServerInfoDto.fromJson(serverInfoJson),
    );
  }

  final bool success;
  final McpServerInfoDto? serverInfo;
}

class DiscoveredMcpToolDto {
  const DiscoveredMcpToolDto({
    required this.name,
    this.title,
    this.description,
    this.inputSchema,
    this.annotations,
  });

  factory DiscoveredMcpToolDto.fromJson(Map<String, dynamic> json) {
    return DiscoveredMcpToolDto(
      name: _readValue(json, 'name') as String? ?? '',
      title: _readValue(json, 'title') as String?,
      description: _readValue(json, 'description') as String?,
      inputSchema: _asMap(_readValue(json, 'inputSchema')).isEmpty
          ? null
          : _asMap(_readValue(json, 'inputSchema')),
      annotations: _asMap(_readValue(json, 'annotations')).isEmpty
          ? null
          : _asMap(_readValue(json, 'annotations')),
    );
  }

  final String name;
  final String? title;
  final String? description;
  final Map<String, dynamic>? inputSchema;
  final Map<String, dynamic>? annotations;
}

class DiscoverMcpToolsResultDto {
  const DiscoverMcpToolsResultDto({required this.tools, this.serverInfo});

  factory DiscoverMcpToolsResultDto.fromJson(Map<String, dynamic> json) {
    final serverInfoJson = _asMap(_readValue(json, 'serverInfo'));
    return DiscoverMcpToolsResultDto(
      tools: _asList(_readValue(json, 'tools'))
          .map((item) => DiscoveredMcpToolDto.fromJson(_asMap(item)))
          .toList(growable: false),
      serverInfo: serverInfoJson.isEmpty
          ? null
          : McpServerInfoDto.fromJson(serverInfoJson),
    );
  }

  final List<DiscoveredMcpToolDto> tools;
  final McpServerInfoDto? serverInfo;
}

class McpPortMappingDto {
  const McpPortMappingDto({
    required this.name,
    required this.dataType,
    this.description,
    this.required = false,
  });

  factory McpPortMappingDto.fromJson(Map<String, dynamic> json) {
    return McpPortMappingDto(
      name: _readValue(json, 'name') as String? ?? '',
      dataType: _readValue(json, 'dataType') as String? ?? 'json',
      description: _readValue(json, 'description') as String?,
      required: _asBool(_readValue(json, 'required')),
    );
  }

  final String name;
  final String dataType;
  final String? description;
  final bool required;
}

class McpPortMappingMetadataDto {
  const McpPortMappingMetadataDto({
    required this.inputs,
    required this.outputs,
  });

  factory McpPortMappingMetadataDto.fromJson(Map<String, dynamic> json) {
    return McpPortMappingMetadataDto(
      inputs: _asList(_readValue(json, 'inputs'))
          .map((item) => McpPortMappingDto.fromJson(_asMap(item)))
          .toList(growable: false),
      outputs: _asList(_readValue(json, 'outputs'))
          .map((item) => McpPortMappingDto.fromJson(_asMap(item)))
          .toList(growable: false),
    );
  }

  final List<McpPortMappingDto> inputs;
  final List<McpPortMappingDto> outputs;
}

class ImportedToolResultDto {
  const ImportedToolResultDto({
    required this.toolName,
    required this.status,
    this.toolDefinitionId,
    this.title,
    this.description,
    this.portMappingMetadata,
    this.reasonCode,
    this.reasonMessage,
  });

  factory ImportedToolResultDto.fromJson(Map<String, dynamic> json) {
    final metadataJson = _asMap(_readValue(json, 'portMappingMetadata'));
    return ImportedToolResultDto(
      toolDefinitionId: _readValue(json, 'toolDefinitionId') as String?,
      toolName: _readValue(json, 'toolName') as String? ?? '',
      status: _readValue(json, 'status') as String? ?? 'imported',
      title: _readValue(json, 'title') as String?,
      description: _readValue(json, 'description') as String?,
      portMappingMetadata: metadataJson.isEmpty
          ? null
          : McpPortMappingMetadataDto.fromJson(metadataJson),
      reasonCode: _readValue(json, 'reasonCode') as String?,
      reasonMessage: _readValue(json, 'reasonMessage') as String?,
    );
  }

  final String? toolDefinitionId;
  final String toolName;
  final String status;
  final String? title;
  final String? description;
  final McpPortMappingMetadataDto? portMappingMetadata;
  final String? reasonCode;
  final String? reasonMessage;
}

class ImportMcpToolsSummaryDto {
  const ImportMcpToolsSummaryDto({
    required this.total,
    required this.imported,
    required this.overwritten,
    required this.skipped,
    required this.failed,
  });

  factory ImportMcpToolsSummaryDto.fromJson(Map<String, dynamic> json) {
    return ImportMcpToolsSummaryDto(
      total: _asNullableInt(_readValue(json, 'total')) ?? 0,
      imported: _asNullableInt(_readValue(json, 'imported')) ?? 0,
      overwritten: _asNullableInt(_readValue(json, 'overwritten')) ?? 0,
      skipped: _asNullableInt(_readValue(json, 'skipped')) ?? 0,
      failed: _asNullableInt(_readValue(json, 'failed')) ?? 0,
    );
  }

  final int total;
  final int imported;
  final int overwritten;
  final int skipped;
  final int failed;
}

class ImportMcpToolsResultDto {
  const ImportMcpToolsResultDto({
    required this.mcpServerConfigId,
    required this.summary,
    required this.results,
  });

  factory ImportMcpToolsResultDto.fromJson(Map<String, dynamic> json) {
    return ImportMcpToolsResultDto(
      mcpServerConfigId: _readValue(json, 'mcpServerConfigId') as String? ?? '',
      summary: ImportMcpToolsSummaryDto.fromJson(
        _asMap(_readValue(json, 'summary')),
      ),
      results: _asList(_readValue(json, 'results'))
          .map((item) => ImportedToolResultDto.fromJson(_asMap(item)))
          .toList(growable: false),
    );
  }

  final String mcpServerConfigId;
  final ImportMcpToolsSummaryDto summary;
  final List<ImportedToolResultDto> results;
}

class McpToolDefinitionDto {
  const McpToolDefinitionDto({
    required this.id,
    required this.name,
    required this.isActive,
    this.mcpServerConfigId,
    this.source,
    this.title,
    this.description,
    this.inputSchema,
    this.outputSchema,
    this.portMappingMetadata,
    this.annotations,
    this.importedAt,
    this.createdAt,
    this.updatedAt,
  });

  factory McpToolDefinitionDto.fromJson(Map<String, dynamic> json) {
    final metadataJson = _asMap(_readValue(json, 'portMappingMetadata'));
    return McpToolDefinitionDto(
      id: _readValue(json, 'id') as String? ?? '',
      mcpServerConfigId: _readValue(json, 'mcpServerConfigId') as String?,
      source: _readValue(json, 'source') as String?,
      name: _readValue(json, 'name') as String? ?? '',
      title: _readValue(json, 'title') as String?,
      description: _readValue(json, 'description') as String?,
      inputSchema: _asMap(_readValue(json, 'inputSchema')).isEmpty
          ? null
          : _asMap(_readValue(json, 'inputSchema')),
      outputSchema: _asMap(_readValue(json, 'outputSchema')).isEmpty
          ? null
          : _asMap(_readValue(json, 'outputSchema')),
      portMappingMetadata: metadataJson.isEmpty
          ? null
          : McpPortMappingMetadataDto.fromJson(metadataJson),
      annotations: _asMap(_readValue(json, 'annotations')).isEmpty
          ? null
          : _asMap(_readValue(json, 'annotations')),
      isActive: _asBool(_readValue(json, 'isActive'), fallback: true),
      importedAt: _readValue(json, 'importedAt') as String?,
      createdAt: _readValue(json, 'createdAt') as String?,
      updatedAt: _readValue(json, 'updatedAt') as String?,
    );
  }

  final String id;
  final String? mcpServerConfigId;
  final String? source;
  final String name;
  final String? title;
  final String? description;
  final Map<String, dynamic>? inputSchema;
  final Map<String, dynamic>? outputSchema;
  final McpPortMappingMetadataDto? portMappingMetadata;
  final Map<String, dynamic>? annotations;
  final bool isActive;
  final String? importedAt;
  final String? createdAt;
  final String? updatedAt;
}

class McpServerConfigSummaryDto {
  const McpServerConfigSummaryDto({
    required this.id,
    required this.tenantId,
    required this.organizationId,
    required this.name,
    required this.description,
    required this.transportType,
    required this.status,
    required this.lastTestedAt,
    required this.createdAt,
    required this.updatedAt,
    required this.toolCount,
  });

  factory McpServerConfigSummaryDto.fromJson(Map<String, dynamic> json) {
    return McpServerConfigSummaryDto(
      id: _readValue(json, 'id') as String? ?? '',
      tenantId: _readValue(json, 'tenantId') as String? ?? '',
      organizationId: _readValue(json, 'organizationId') as String? ?? '',
      name: _readValue(json, 'name') as String? ?? '',
      description: _readValue(json, 'description') as String?,
      transportType: _readValue(json, 'transportType') as String? ?? 'stdio',
      status: _readValue(json, 'status') as String? ?? 'active',
      lastTestedAt: _readValue(json, 'lastTestedAt') as String?,
      createdAt: _readValue(json, 'createdAt') as String? ?? '',
      updatedAt: _readValue(json, 'updatedAt') as String? ?? '',
      toolCount: _asNullableInt(_readValue(json, 'toolCount')) ?? 0,
    );
  }

  final String id;
  final String tenantId;
  final String organizationId;
  final String name;
  final String? description;
  final String transportType;
  final String status;
  final String? lastTestedAt;
  final String createdAt;
  final String updatedAt;
  final int toolCount;
}

class McpServerConfigDetailDto {
  const McpServerConfigDetailDto({
    required this.id,
    required this.tenantId,
    required this.organizationId,
    required this.name,
    required this.description,
    required this.transportType,
    required this.status,
    required this.lastTestedAt,
    required this.createdAt,
    required this.updatedAt,
    required this.connection,
    required this.credentialKeys,
    required this.tools,
  });

  factory McpServerConfigDetailDto.fromJson(Map<String, dynamic> json) {
    final transportType =
        _readValue(json, 'transportType') as String? ?? 'stdio';
    return McpServerConfigDetailDto(
      id: _readValue(json, 'id') as String? ?? '',
      tenantId: _readValue(json, 'tenantId') as String? ?? '',
      organizationId: _readValue(json, 'organizationId') as String? ?? '',
      name: _readValue(json, 'name') as String? ?? '',
      description: _readValue(json, 'description') as String?,
      transportType: transportType,
      status: _readValue(json, 'status') as String? ?? 'active',
      lastTestedAt: _readValue(json, 'lastTestedAt') as String?,
      createdAt: _readValue(json, 'createdAt') as String? ?? '',
      updatedAt: _readValue(json, 'updatedAt') as String? ?? '',
      connection: McpConnectionConfigDto(
        transportType: transportType,
        command: _readValue(json, 'command') as String?,
        args: _asStringList(_readValue(json, 'args')),
        url: _readValue(json, 'url') as String?,
      ),
      credentialKeys: _asStringList(_readValue(json, 'credentialKeys')),
      tools: _asList(_readValue(json, 'tools'))
          .map((item) => McpToolDefinitionDto.fromJson(_asMap(item)))
          .toList(growable: false),
    );
  }

  final String id;
  final String tenantId;
  final String organizationId;
  final String name;
  final String? description;
  final String transportType;
  final String status;
  final String? lastTestedAt;
  final String createdAt;
  final String updatedAt;
  final McpConnectionConfigDto connection;
  final List<String> credentialKeys;
  final List<McpToolDefinitionDto> tools;
}

class ApiKeyInfoDto {
  const ApiKeyInfoDto({
    required this.id,
    required this.provider,
    required this.label,
    required this.keyPreview,
    required this.isDefault,
    required this.status,
    required this.lastUsedAt,
    required this.rotatedAt,
    required this.expiresAt,
    required this.createdAt,
    required this.updatedAt,
  });

  factory ApiKeyInfoDto.fromJson(Map<String, dynamic> json) {
    return ApiKeyInfoDto(
      id: _readValue(json, 'id') as String? ?? '',
      provider: _readValue(json, 'provider') as String? ?? '',
      label: _readValue(json, 'label') as String? ?? '',
      keyPreview: _readValue(json, 'keyPreview') as String? ?? '',
      isDefault: _asBool(_readValue(json, 'isDefault')),
      status: _readValue(json, 'status') as String? ?? 'active',
      lastUsedAt: _readValue(json, 'lastUsedAt') as String?,
      rotatedAt: _readValue(json, 'rotatedAt') as String?,
      expiresAt: _readValue(json, 'expiresAt') as String?,
      createdAt: _readValue(json, 'createdAt') as String? ?? '',
      updatedAt: _readValue(json, 'updatedAt') as String? ?? '',
    );
  }

  final String id;
  final String provider;
  final String label;
  final String keyPreview;
  final bool isDefault;
  final String status;
  final String? lastUsedAt;
  final String? rotatedAt;
  final String? expiresAt;
  final String createdAt;
  final String updatedAt;
}

class LlmProviderInfoDto {
  const LlmProviderInfoDto({
    required this.id,
    required this.name,
    required this.models,
    required this.defaultModel,
    required this.supportsStreaming,
    required this.supportsStructuredOutput,
  });

  factory LlmProviderInfoDto.fromJson(Map<String, dynamic> json) {
    return LlmProviderInfoDto(
      id: _readValue(json, 'id') as String? ?? '',
      name: _readValue(json, 'name') as String? ?? '',
      models: _asStringList(_readValue(json, 'models')),
      defaultModel: _readValue(json, 'defaultModel') as String? ?? '',
      supportsStreaming: _asBool(_readValue(json, 'supportsStreaming')),
      supportsStructuredOutput: _asBool(
        _readValue(json, 'supportsStructuredOutput'),
      ),
    );
  }

  final String id;
  final String name;
  final List<String> models;
  final String defaultModel;
  final bool supportsStreaming;
  final bool supportsStructuredOutput;
}

class LlmParametersDto {
  const LlmParametersDto({
    required this.temperature,
    required this.maxTokens,
    required this.topP,
    required this.frequencyPenalty,
    required this.presencePenalty,
    required this.stop,
  });

  factory LlmParametersDto.fromJson(Map<String, dynamic> json) {
    return LlmParametersDto(
      temperature: _asDouble(_readValue(json, 'temperature'), 0.7),
      maxTokens: _asNullableInt(_readValue(json, 'maxTokens')),
      topP: _asDouble(_readValue(json, 'topP'), 1),
      frequencyPenalty: _asDouble(_readValue(json, 'frequencyPenalty'), 0),
      presencePenalty: _asDouble(_readValue(json, 'presencePenalty'), 0),
      stop: _asStringList(_readValue(json, 'stop')),
    );
  }

  Map<String, dynamic> toJson() {
    return <String, dynamic>{
      'temperature': temperature,
      if (maxTokens != null) 'maxTokens': maxTokens,
      'topP': topP,
      'frequencyPenalty': frequencyPenalty,
      'presencePenalty': presencePenalty,
      'stop': stop,
    };
  }

  final double temperature;
  final int? maxTokens;
  final double topP;
  final double frequencyPenalty;
  final double presencePenalty;
  final List<String> stop;
}

class LlmModelInfoDto {
  const LlmModelInfoDto({
    required this.id,
    required this.name,
    required this.provider,
    required this.modelType,
    required this.modelName,
    required this.parameters,
    required this.apiKeyId,
    required this.embeddingDimensions,
    required this.isDefault,
    required this.createdAt,
    required this.updatedAt,
    required this.endpointUrl,
    required this.authMethod,
    required this.authConfig,
    required this.timeoutMs,
  });

  factory LlmModelInfoDto.fromJson(Map<String, dynamic> json) {
    return LlmModelInfoDto(
      id: _readValue(json, 'id') as String? ?? '',
      name: _readValue(json, 'name') as String? ?? '',
      provider: _readValue(json, 'provider') as String? ?? 'openai',
      modelType: _readValue(json, 'modelType') as String? ?? 'chat',
      modelName: _readValue(json, 'modelName') as String? ?? '',
      parameters: LlmParametersDto.fromJson(
        _asMap(_readValue(json, 'parameters')),
      ),
      apiKeyId: _readValue(json, 'apiKeyId') as String?,
      embeddingDimensions: _asNullableInt(
        _readValue(json, 'embeddingDimensions'),
      ),
      isDefault: _asBool(_readValue(json, 'isDefault')),
      createdAt: _readValue(json, 'createdAt') as String? ?? '',
      updatedAt: _readValue(json, 'updatedAt') as String? ?? '',
      endpointUrl: _readValue(json, 'endpointUrl') as String?,
      authMethod: _readValue(json, 'authMethod') as String?,
      authConfig: _asMap(_readValue(json, 'authConfig')).isEmpty
          ? null
          : _asMap(_readValue(json, 'authConfig')),
      timeoutMs: _asNullableInt(_readValue(json, 'timeoutMs')),
    );
  }

  final String id;
  final String name;
  final String provider;
  final String modelType;
  final String modelName;
  final LlmParametersDto parameters;
  final String? apiKeyId;
  final int? embeddingDimensions;
  final bool isDefault;
  final String createdAt;
  final String updatedAt;
  final String? endpointUrl;
  final String? authMethod;
  final Map<String, dynamic>? authConfig;
  final int? timeoutMs;
}

class PrivateCloudServerInfoDto {
  const PrivateCloudServerInfoDto({
    this.models = const <String>[],
    this.status,
    this.version,
  });

  factory PrivateCloudServerInfoDto.fromJson(Map<String, dynamic> json) {
    return PrivateCloudServerInfoDto(
      models: _asStringList(_readValue(json, 'models')),
      status: _readValue(json, 'status') as String?,
      version: _readValue(json, 'version') as String?,
    );
  }

  final List<String> models;
  final String? status;
  final String? version;
}

class TestLlmConnectionResultDto {
  const TestLlmConnectionResultDto({
    required this.success,
    required this.latencyMs,
    this.serverInfo,
  });

  factory TestLlmConnectionResultDto.fromJson(Map<String, dynamic> json) {
    final serverInfoJson = _asMap(_readValue(json, 'serverInfo'));
    return TestLlmConnectionResultDto(
      success: _asBool(_readValue(json, 'success')),
      latencyMs: _asNullableInt(_readValue(json, 'latencyMs')) ?? 0,
      serverInfo: serverInfoJson.isEmpty
          ? null
          : PrivateCloudServerInfoDto.fromJson(serverInfoJson),
    );
  }

  final bool success;
  final int latencyMs;
  final PrivateCloudServerInfoDto? serverInfo;
}

class PrivateCloudModelInfoDto {
  const PrivateCloudModelInfoDto({
    required this.id,
    required this.name,
    this.ownedBy,
  });

  factory PrivateCloudModelInfoDto.fromJson(Map<String, dynamic> json) {
    return PrivateCloudModelInfoDto(
      id: _readValue(json, 'id') as String? ?? '',
      name: _readValue(json, 'name') as String? ?? '',
      ownedBy: _readValue(json, 'ownedBy') as String?,
    );
  }

  final String id;
  final String name;
  final String? ownedBy;
}
