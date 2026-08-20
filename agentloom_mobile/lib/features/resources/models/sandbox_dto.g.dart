// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'sandbox_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_SandboxConfigDto _$SandboxConfigDtoFromJson(Map<String, dynamic> json) =>
    _SandboxConfigDto(
      cpu: (json['cpu'] as num?)?.toDouble() ?? 1,
      memory: (json['memory'] as num?)?.toInt() ?? 512,
      disk: (json['disk'] as num?)?.toInt() ?? 2,
      timeout: (json['timeout'] as num?)?.toInt() ?? 24,
      timeoutSeconds: (json['timeoutSeconds'] as num?)?.toInt(),
      lifecycleMode: json['lifecycleMode'] as String? ?? 'session',
      name: json['name'] as String?,
      persistenceExpiryHours: (json['persistenceExpiryHours'] as num?)?.toInt(),
      restoreWorkspaceId: json['restoreWorkspaceId'] as String?,
    );

Map<String, dynamic> _$SandboxConfigDtoToJson(_SandboxConfigDto instance) =>
    <String, dynamic>{
      'cpu': instance.cpu,
      'memory': instance.memory,
      'disk': instance.disk,
      'timeout': instance.timeout,
      'timeoutSeconds': instance.timeoutSeconds,
      'lifecycleMode': instance.lifecycleMode,
      'name': instance.name,
      'persistenceExpiryHours': instance.persistenceExpiryHours,
      'restoreWorkspaceId': instance.restoreWorkspaceId,
    };

_SandboxSessionDto _$SandboxSessionDtoFromJson(Map<String, dynamic> json) =>
    _SandboxSessionDto(
      id: json['id'] as String,
      tenantId: json['tenantId'] as String,
      status: json['status'] as String,
      config: SandboxConfigDto.fromJson(json['config'] as Map<String, dynamic>),
      createdAt: json['createdAt'] as String,
      bindingType: json['bindingType'] as String? ?? 'resource',
      executionId: json['executionId'] as String?,
      agentConversationId: json['agentConversationId'] as String?,
      sandboxNodeId: json['sandboxNodeId'] as String?,
      workspacePath: json['workspacePath'] as String?,
      startedAt: json['startedAt'] as String?,
      stoppedAt: json['stoppedAt'] as String?,
    );

Map<String, dynamic> _$SandboxSessionDtoToJson(_SandboxSessionDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'tenantId': instance.tenantId,
      'status': instance.status,
      'config': instance.config.toJson(),
      'createdAt': instance.createdAt,
      'bindingType': instance.bindingType,
      'executionId': instance.executionId,
      'agentConversationId': instance.agentConversationId,
      'sandboxNodeId': instance.sandboxNodeId,
      'workspacePath': instance.workspacePath,
      'startedAt': instance.startedAt,
      'stoppedAt': instance.stoppedAt,
    };

_SandboxStatsDto _$SandboxStatsDtoFromJson(Map<String, dynamic> json) =>
    _SandboxStatsDto(
      cpuPercent: (json['cpuPercent'] as num).toDouble(),
      memoryUsageMb: (json['memoryUsageMb'] as num).toDouble(),
      memoryLimitMb: (json['memoryLimitMb'] as num).toDouble(),
      diskUsage: (json['diskUsage'] as num?)?.toInt(),
      diskTotal: (json['diskTotal'] as num?)?.toInt(),
    );

Map<String, dynamic> _$SandboxStatsDtoToJson(_SandboxStatsDto instance) =>
    <String, dynamic>{
      'cpuPercent': instance.cpuPercent,
      'memoryUsageMb': instance.memoryUsageMb,
      'memoryLimitMb': instance.memoryLimitMb,
      'diskUsage': instance.diskUsage,
      'diskTotal': instance.diskTotal,
    };

_SandboxLogDto _$SandboxLogDtoFromJson(Map<String, dynamic> json) =>
    _SandboxLogDto(
      id: json['id'] as String,
      sessionId: json['sessionId'] as String,
      level: json['level'] as String? ?? 'stdout',
      message: json['message'] as String,
      createdAt: json['createdAt'] as String,
    );

Map<String, dynamic> _$SandboxLogDtoToJson(_SandboxLogDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'sessionId': instance.sessionId,
      'level': instance.level,
      'message': instance.message,
      'createdAt': instance.createdAt,
    };
