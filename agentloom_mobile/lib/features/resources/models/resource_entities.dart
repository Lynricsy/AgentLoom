Map<String, dynamic> _asMap(Object? value) {
  if (value is Map<String, dynamic>) {
    return value;
  }
  if (value is Map<Object?, Object?>) {
    return value.map((key, item) => MapEntry('$key', item));
  }
  return <String, dynamic>{};
}

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
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? '',
      description: json['description'] as String?,
      storageKey: json['storageKey'] as String? ?? '',
      sizeBytes: (json['sizeBytes'] as num?)?.toInt(),
      status: json['status'] as String? ?? 'creating',
      config: json['config'] == null ? null : _asMap(json['config']),
      createdAt: json['createdAt'] as String? ?? '',
      updatedAt: json['updatedAt'] as String? ?? '',
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
      cpu: (json['cpu'] as num?)?.toDouble() ?? 1,
      memory: (json['memory'] as num?)?.toInt() ?? 512,
      disk: (json['disk'] as num?)?.toInt() ?? 2,
      timeout: (json['timeout'] as num?)?.toInt() ?? 24,
      lifecycleMode: json['lifecycleMode'] as String? ?? 'session',
      name: json['name'] as String?,
      persistenceExpiryHours: (json['persistenceExpiryHours'] as num?)?.toInt(),
      restoreWorkspaceId: json['restoreWorkspaceId'] as String?,
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
      id: json['id'] as String? ?? '',
      tenantId: json['tenantId'] as String? ?? '',
      status: json['status'] as String? ?? 'creating',
      config: SandboxConfigDto.fromJson(_asMap(json['config'])),
      createdAt: json['createdAt'] as String? ?? '',
      executionId: json['executionId'] as String?,
      agentConversationId: json['agentConversationId'] as String?,
      sandboxNodeId: json['sandboxNodeId'] as String?,
      containerId: json['containerId'] as String?,
      workspacePath: json['workspacePath'] as String?,
      startedAt: json['startedAt'] as String?,
      stoppedAt: json['stoppedAt'] as String?,
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
      cpuPercent: (json['cpuPercent'] as num?)?.toDouble() ?? 0,
      memoryUsageMb: (json['memoryUsageMb'] as num?)?.toDouble() ?? 0,
      memoryLimitMb: (json['memoryLimitMb'] as num?)?.toDouble() ?? 0,
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
      id: json['id'] as String? ?? '',
      sessionId: json['sessionId'] as String? ?? '',
      level: json['level'] as String? ?? 'stdout',
      message: json['message'] as String? ?? '',
      createdAt: json['createdAt'] as String? ?? '',
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
      id: json['id'] as String? ?? '',
      tenantId: json['tenantId'] as String? ?? '',
      name: json['name'] as String? ?? '',
      description: json['description'] as String?,
      visibility: json['visibility'] as String? ?? 'private',
      createdBy: json['createdBy'] as String? ?? '',
      embeddingModel: json['embeddingModel'] as String? ?? '',
      embeddingModelConfigId: json['embeddingModelConfigId'] as String?,
      documentCount: (json['documentCount'] as num?)?.toInt() ?? 0,
      nodeCount: (json['nodeCount'] as num?)?.toInt() ?? 0,
      chunkCount: (json['chunkCount'] as num?)?.toInt() ?? 0,
      status: json['status'] as String? ?? 'empty',
      createdAt: json['createdAt'] as String? ?? '',
      updatedAt: json['updatedAt'] as String? ?? '',
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
      id: json['id'] as String? ?? '',
      knowledgeBaseId: json['knowledgeBaseId'] as String? ?? '',
      fileName: json['fileName'] as String? ?? '',
      mimeType: json['mimeType'] as String? ?? '',
      sizeBytes: (json['sizeBytes'] as num?)?.toInt() ?? 0,
      status: json['status'] as String? ?? 'uploaded',
      errorMessage: json['errorMessage'] as String?,
      createdAt: json['createdAt'] as String? ?? '',
      updatedAt: json['updatedAt'] as String? ?? '',
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
