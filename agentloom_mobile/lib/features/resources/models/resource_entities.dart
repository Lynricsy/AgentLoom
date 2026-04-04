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

const List<String> llmApiProtocols = <String>[
  'openai_chat',
  'openai_responses',
  'anthropic',
  'google',
  'cohere',
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
    required this.sourceKind,
    required this.isAutoArchived,
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
      sourceKind: _readValue(json, 'sourceKind') as String? ?? 'manual',
      isAutoArchived: _asBool(_readValue(json, 'isAutoArchived')),
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
  final String sourceKind;
  final bool isAutoArchived;
  final String createdAt;
  final String updatedAt;

  String get sourceLabel {
    switch (sourceKind) {
      case 'sandbox_snapshot':
        return '沙箱快照';
      case 'execution_archive':
        return '执行归档';
      default:
        return '常规';
    }
  }
}

class SandboxConfigDto {
  const SandboxConfigDto({
    required this.cpu,
    required this.memory,
    required this.disk,
    required this.timeout,
    required this.timeoutSeconds,
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
      timeoutSeconds: _asNullableInt(_readValue(json, 'timeoutSeconds')),
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
  final int? timeoutSeconds;
  final String lifecycleMode;
  final String? name;
  final int? persistenceExpiryHours;
  final String? restoreWorkspaceId;

  String get timeoutLabel =>
      timeoutSeconds == null ? '${timeout}h' : '${timeoutSeconds}s';
}

class SandboxSessionDto {
  const SandboxSessionDto({
    required this.id,
    required this.tenantId,
    required this.status,
    required this.config,
    required this.createdAt,
    required this.bindingType,
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
      bindingType: _readValue(json, 'bindingType') as String? ?? 'resource',
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
  final String bindingType;
  final String? executionId;
  final String? agentConversationId;
  final String? sandboxNodeId;
  final String? containerId;
  final String? workspacePath;
  final String? startedAt;
  final String? stoppedAt;

  String get bindingLabel {
    switch (bindingType) {
      case 'conversation':
        return '对话';
      case 'execution':
        return '执行';
      default:
        return '资源';
    }
  }
}

class SandboxStatsDto {
  const SandboxStatsDto({
    required this.cpuPercent,
    required this.memoryUsageMb,
    required this.memoryLimitMb,
    this.diskUsage,
    this.diskTotal,
  });

  factory SandboxStatsDto.fromJson(Map<String, dynamic> json) {
    return SandboxStatsDto(
      cpuPercent: _asDouble(_readValue(json, 'cpuPercent'), 0),
      memoryUsageMb: _asDouble(_readValue(json, 'memoryUsageMb'), 0),
      memoryLimitMb: _asDouble(_readValue(json, 'memoryLimitMb'), 0),
      diskUsage: _asNullableInt(_readValue(json, 'diskUsage')),
      diskTotal: _asNullableInt(_readValue(json, 'diskTotal')),
    );
  }

  final double cpuPercent;
  final double memoryUsageMb;
  final double memoryLimitMb;
  final int? diskUsage;
  final int? diskTotal;

  bool get hasDiskStats => diskUsage != null && diskTotal != null;
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
    required this.sourceKind,
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
      sourceKind: _readValue(json, 'sourceKind') as String? ?? 'manual',
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
  final String sourceKind;
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
    required this.sourceKind,
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
      sourceKind: _readValue(json, 'sourceKind') as String? ?? 'manual',
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
  final String sourceKind;
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
    required this.sourceKind,
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
      sourceKind: _readValue(json, 'sourceKind') as String? ?? 'manual',
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
  final String sourceKind;
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

// ---------------------------------------------------------------------------
// Provider → Model 两级架构 DTO
// ---------------------------------------------------------------------------

/// LLM 提供商实体 DTO
class LlmProviderEntityDto {
  const LlmProviderEntityDto({
    required this.id,
    required this.orgId,
    required this.tenantId,
    required this.slug,
    required this.name,
    required this.isBuiltin,
    required this.isEnabled,
    required this.apiProtocol,
    required this.sortOrder,
    required this.createdAt,
    required this.updatedAt,
    this.iconUrl,
    this.baseUrl,
    this.defaultBaseUrl,
    this.apiKeyId,
  });

  factory LlmProviderEntityDto.fromJson(Map<String, dynamic> json) {
    return LlmProviderEntityDto(
      id: _readValue(json, 'id') as String? ?? '',
      orgId: _readValue(json, 'orgId') as String? ?? '',
      tenantId: _readValue(json, 'tenantId') as String? ?? '',
      slug: _readValue(json, 'slug') as String? ?? '',
      name: _readValue(json, 'name') as String? ?? '',
      iconUrl: _readValue(json, 'iconUrl') as String?,
      baseUrl: _readValue(json, 'baseUrl') as String?,
      defaultBaseUrl: _readValue(json, 'defaultBaseUrl') as String?,
      isBuiltin: _asBool(_readValue(json, 'isBuiltin')),
      isEnabled: _asBool(_readValue(json, 'isEnabled'), fallback: true),
      apiProtocol: _readValue(json, 'apiProtocol') as String? ?? 'openai_chat',
      apiKeyId: _readValue(json, 'apiKeyId') as String?,
      sortOrder: _asNullableInt(_readValue(json, 'sortOrder')) ?? 0,
      createdAt: _readValue(json, 'createdAt') as String? ?? '',
      updatedAt: _readValue(json, 'updatedAt') as String? ?? '',
    );
  }

  final String id;
  final String orgId;
  final String tenantId;
  final String slug;
  final String name;
  final String? iconUrl;
  final String? baseUrl;
  final String? defaultBaseUrl;
  final bool isBuiltin;
  final bool isEnabled;
  final String apiProtocol;
  final String? apiKeyId;
  final int sortOrder;
  final String createdAt;
  final String updatedAt;
}

/// 模型能力 DTO
class ModelCapabilitiesDto {
  const ModelCapabilitiesDto({
    this.vision = false,
    this.functionCalling = false,
    this.reasoning = false,
    this.structuredOutput = false,
  });

  factory ModelCapabilitiesDto.fromJson(Map<String, dynamic> json) {
    return ModelCapabilitiesDto(
      vision: _asBool(_readValue(json, 'vision')),
      functionCalling: _asBool(_readValue(json, 'functionCalling')),
      reasoning: _asBool(_readValue(json, 'reasoning')),
      structuredOutput: _asBool(_readValue(json, 'structuredOutput')),
    );
  }

  Map<String, dynamic> toJson() {
    return <String, dynamic>{
      'vision': vision,
      'functionCalling': functionCalling,
      'reasoning': reasoning,
      'structuredOutput': structuredOutput,
    };
  }

  final bool vision;
  final bool functionCalling;
  final bool reasoning;
  final bool structuredOutput;
}

/// 阶梯定价 DTO
class PricingTierDto {
  const PricingTierDto({
    required this.aboveTokens,
    required this.inputPer1MTokens,
    required this.outputPer1MTokens,
    this.cachedReadPer1MTokens,
    this.cachedWritePer1MTokens,
  });

  factory PricingTierDto.fromJson(Map<String, dynamic> json) {
    return PricingTierDto(
      aboveTokens: _asNullableInt(_readValue(json, 'aboveTokens')) ?? 0,
      inputPer1MTokens: _asDouble(_readValue(json, 'inputPer1MTokens'), 0),
      outputPer1MTokens: _asDouble(_readValue(json, 'outputPer1MTokens'), 0),
      cachedReadPer1MTokens: _readValue(json, 'cachedReadPer1MTokens') == null
          ? null
          : _asDouble(_readValue(json, 'cachedReadPer1MTokens'), 0),
      cachedWritePer1MTokens: _readValue(json, 'cachedWritePer1MTokens') == null
          ? null
          : _asDouble(_readValue(json, 'cachedWritePer1MTokens'), 0),
    );
  }

  Map<String, dynamic> toJson() {
    return <String, dynamic>{
      'aboveTokens': aboveTokens,
      'inputPer1MTokens': inputPer1MTokens,
      'outputPer1MTokens': outputPer1MTokens,
      if (cachedReadPer1MTokens != null)
        'cachedReadPer1MTokens': cachedReadPer1MTokens,
      if (cachedWritePer1MTokens != null)
        'cachedWritePer1MTokens': cachedWritePer1MTokens,
    };
  }

  final int aboveTokens;
  final double inputPer1MTokens;
  final double outputPer1MTokens;
  final double? cachedReadPer1MTokens;
  final double? cachedWritePer1MTokens;
}

/// 模型定价 DTO
class ModelPricingDto {
  const ModelPricingDto({
    required this.inputPer1MTokens,
    required this.outputPer1MTokens,
    this.cachedReadPer1MTokens,
    this.cachedWritePer1MTokens,
    this.tiers = const <PricingTierDto>[],
  });

  factory ModelPricingDto.fromJson(Map<String, dynamic> json) {
    final tiers = _asList(_readValue(json, 'tiers'))
        .map(_asMap)
        .where((item) => item.isNotEmpty)
        .map(PricingTierDto.fromJson)
        .toList(growable: false);

    return ModelPricingDto(
      inputPer1MTokens: _asDouble(_readValue(json, 'inputPer1MTokens'), 0),
      outputPer1MTokens: _asDouble(_readValue(json, 'outputPer1MTokens'), 0),
      cachedReadPer1MTokens: _readValue(json, 'cachedReadPer1MTokens') == null
          ? null
          : _asDouble(_readValue(json, 'cachedReadPer1MTokens'), 0),
      cachedWritePer1MTokens: _readValue(json, 'cachedWritePer1MTokens') == null
          ? null
          : _asDouble(_readValue(json, 'cachedWritePer1MTokens'), 0),
      tiers: tiers,
    );
  }

  Map<String, dynamic> toJson() {
    return <String, dynamic>{
      'inputPer1MTokens': inputPer1MTokens,
      'outputPer1MTokens': outputPer1MTokens,
      if (cachedReadPer1MTokens != null)
        'cachedReadPer1MTokens': cachedReadPer1MTokens,
      if (cachedWritePer1MTokens != null)
        'cachedWritePer1MTokens': cachedWritePer1MTokens,
      if (tiers.isNotEmpty)
        'tiers': tiers.map((tier) => tier.toJson()).toList(growable: false),
    };
  }

  final double inputPer1MTokens;
  final double outputPer1MTokens;
  final double? cachedReadPer1MTokens;
  final double? cachedWritePer1MTokens;
  final List<PricingTierDto> tiers;
}

/// LiteLLM 模型元数据 DTO
class LiteLLMModelInfoDto {
  const LiteLLMModelInfoDto({
    required this.modelId,
    required this.capabilities,
    this.contextWindow,
    this.maxOutputTokens,
    this.pricing,
  });

  factory LiteLLMModelInfoDto.fromJson(Map<String, dynamic> json) {
    final pricingJson = _asMap(_readValue(json, 'pricing'));
    final capsJson = _asMap(_readValue(json, 'capabilities'));
    return LiteLLMModelInfoDto(
      modelId: _readValue(json, 'modelId') as String? ?? '',
      contextWindow: _asNullableInt(_readValue(json, 'contextWindow')),
      maxOutputTokens: _asNullableInt(_readValue(json, 'maxOutputTokens')),
      pricing: pricingJson.isEmpty
          ? null
          : ModelPricingDto.fromJson(pricingJson),
      capabilities: capsJson.isEmpty
          ? const ModelCapabilitiesDto()
          : ModelCapabilitiesDto.fromJson(capsJson),
    );
  }

  final String modelId;
  final int? contextWindow;
  final int? maxOutputTokens;
  final ModelPricingDto? pricing;
  final ModelCapabilitiesDto capabilities;
}

/// 新版 LLM 模型配置 DTO (包含嵌套 provider 对象)
class LlmModelConfigDto {
  const LlmModelConfigDto({
    required this.id,
    required this.orgId,
    required this.tenantId,
    required this.providerId,
    required this.name,
    required this.modelId,
    required this.modelType,
    required this.isEnabled,
    required this.isDefault,
    required this.capabilities,
    required this.parameters,
    required this.createdAt,
    required this.updatedAt,
    this.contextWindow,
    this.maxOutputTokens,
    this.pricing,
    this.metadataSource,
    this.embeddingDimensions,
    this.timeoutMs,
    this.provider,
  });

  factory LlmModelConfigDto.fromJson(Map<String, dynamic> json) {
    final capsJson = _asMap(_readValue(json, 'capabilities'));
    final pricingJson = _asMap(_readValue(json, 'pricing'));
    final providerJson = _asMap(_readValue(json, 'provider'));
    return LlmModelConfigDto(
      id: _readValue(json, 'id') as String? ?? '',
      orgId: _readValue(json, 'orgId') as String? ?? '',
      tenantId: _readValue(json, 'tenantId') as String? ?? '',
      providerId: _readValue(json, 'providerId') as String? ?? '',
      name: _readValue(json, 'name') as String? ?? '',
      modelId:
          _readValue(json, 'modelId') as String? ??
          _readValue(json, 'modelName') as String? ??
          '',
      modelType: _readValue(json, 'modelType') as String? ?? 'chat',
      isEnabled: _asBool(_readValue(json, 'isEnabled'), fallback: true),
      isDefault: _asBool(_readValue(json, 'isDefault')),
      capabilities: capsJson.isEmpty
          ? const ModelCapabilitiesDto()
          : ModelCapabilitiesDto.fromJson(capsJson),
      contextWindow: _asNullableInt(_readValue(json, 'contextWindow')),
      maxOutputTokens: _asNullableInt(_readValue(json, 'maxOutputTokens')),
      pricing: pricingJson.isEmpty
          ? null
          : ModelPricingDto.fromJson(pricingJson),
      parameters: _asMap(_readValue(json, 'parameters')),
      metadataSource: _readValue(json, 'metadataSource') as String?,
      embeddingDimensions: _asNullableInt(
        _readValue(json, 'embeddingDimensions'),
      ),
      timeoutMs: _asNullableInt(_readValue(json, 'timeoutMs')),
      createdAt: _readValue(json, 'createdAt') as String? ?? '',
      updatedAt: _readValue(json, 'updatedAt') as String? ?? '',
      provider: providerJson.isEmpty
          ? null
          : LlmProviderEntityDto.fromJson(providerJson),
    );
  }

  final String id;
  final String orgId;
  final String tenantId;
  final String providerId;
  final String name;
  final String modelId;
  final String modelType;
  final bool isEnabled;
  final bool isDefault;
  final ModelCapabilitiesDto capabilities;
  final int? contextWindow;
  final int? maxOutputTokens;
  final ModelPricingDto? pricing;
  final Map<String, dynamic> parameters;
  final String? metadataSource;
  final int? embeddingDimensions;
  final int? timeoutMs;
  final String createdAt;
  final String updatedAt;
  final LlmProviderEntityDto? provider;
}
