// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'agent_definition_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_AgentDefinitionDto _$AgentDefinitionDtoFromJson(Map<String, dynamic> json) =>
    _AgentDefinitionDto(
      id: json['id'] as String,
      name: json['name'] as String,
      slug: json['slug'] as String,
      description: json['description'] as String?,
      icon: json['icon'] as String?,
      status: json['status'] as String,
      runtimeMode: json['runtimeMode'] as String? ?? 'sandbox',
      version: (json['version'] as num?)?.toInt(),
      publishedVersionId: json['publishedVersionId'] as String?,
      tenantId: json['tenantId'] as String?,
      createdBy: json['createdBy'] as String?,
      updatedBy: json['updatedBy'] as String?,
      createdAt: json['createdAt'] as String,
      updatedAt: json['updatedAt'] as String,
      systemPrompt: json['systemPrompt'] as String?,
      nodes: json['nodes'] == null
          ? const <Map<String, dynamic>>[]
          : _mapListFromJson(json['nodes']),
      edges: json['edges'] == null
          ? const <Map<String, dynamic>>[]
          : _mapListFromJson(json['edges']),
      viewport: _nullableMapFromJson(json['viewport']),
      sandboxConfig: _nullableMapFromJson(json['sandboxConfig']),
      workspaceSnapshotId: json['workspaceSnapshotId'] as String?,
      inputSchema: _nullableMapFromJson(json['inputSchema']),
      memoryInstanceIds: _nullableStringListFromJson(json['memoryInstanceIds']),
      sandboxLifecycle: json['sandboxLifecycle'] as String?,
      resourceSourceKind: json['resourceSourceKind'] as String? ?? 'manual',
    );

Map<String, dynamic> _$AgentDefinitionDtoToJson(_AgentDefinitionDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'name': instance.name,
      'slug': instance.slug,
      'description': instance.description,
      'icon': instance.icon,
      'status': instance.status,
      'runtimeMode': instance.runtimeMode,
      'version': instance.version,
      'publishedVersionId': instance.publishedVersionId,
      'tenantId': instance.tenantId,
      'createdBy': instance.createdBy,
      'updatedBy': instance.updatedBy,
      'createdAt': instance.createdAt,
      'updatedAt': instance.updatedAt,
      'systemPrompt': instance.systemPrompt,
      'nodes': instance.nodes,
      'edges': instance.edges,
      'viewport': instance.viewport,
      'sandboxConfig': instance.sandboxConfig,
      'workspaceSnapshotId': instance.workspaceSnapshotId,
      'inputSchema': instance.inputSchema,
      'memoryInstanceIds': instance.memoryInstanceIds,
      'sandboxLifecycle': instance.sandboxLifecycle,
      'resourceSourceKind': instance.resourceSourceKind,
    };
