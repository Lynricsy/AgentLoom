// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'mcp_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_McpConnectionConfigDto _$McpConnectionConfigDtoFromJson(
  Map<String, dynamic> json,
) => _McpConnectionConfigDto(
  transportType: json['transportType'] as String? ?? 'stdio',
  command: json['command'] as String?,
  args:
      (json['args'] as List<dynamic>?)?.map((e) => e as String).toList() ??
      const <String>[],
  env: (json['env'] as Map<String, dynamic>?)?.map(
    (k, e) => MapEntry(k, e as String),
  ),
  url: json['url'] as String?,
  headers: (json['headers'] as Map<String, dynamic>?)?.map(
    (k, e) => MapEntry(k, e as String),
  ),
);

Map<String, dynamic> _$McpConnectionConfigDtoToJson(
  _McpConnectionConfigDto instance,
) => <String, dynamic>{
  'transportType': instance.transportType,
  'command': instance.command,
  'args': instance.args,
  'env': instance.env,
  'url': instance.url,
  'headers': instance.headers,
};

_McpServerInfoDto _$McpServerInfoDtoFromJson(Map<String, dynamic> json) =>
    _McpServerInfoDto(
      name: json['name'] as String,
      version: json['version'] as String,
      protocolVersion: json['protocolVersion'] as String?,
    );

Map<String, dynamic> _$McpServerInfoDtoToJson(_McpServerInfoDto instance) =>
    <String, dynamic>{
      'name': instance.name,
      'version': instance.version,
      'protocolVersion': instance.protocolVersion,
    };

_TestMcpConnectionResultDto _$TestMcpConnectionResultDtoFromJson(
  Map<String, dynamic> json,
) => _TestMcpConnectionResultDto(
  success: json['success'] as bool,
  serverInfo: json['serverInfo'] == null
      ? null
      : McpServerInfoDto.fromJson(json['serverInfo'] as Map<String, dynamic>),
);

Map<String, dynamic> _$TestMcpConnectionResultDtoToJson(
  _TestMcpConnectionResultDto instance,
) => <String, dynamic>{
  'success': instance.success,
  'serverInfo': instance.serverInfo?.toJson(),
};

_DiscoveredMcpToolDto _$DiscoveredMcpToolDtoFromJson(
  Map<String, dynamic> json,
) => _DiscoveredMcpToolDto(
  name: json['name'] as String,
  title: json['title'] as String?,
  description: json['description'] as String?,
  inputSchema: json['inputSchema'] as Map<String, dynamic>?,
  annotations: json['annotations'] as Map<String, dynamic>?,
);

Map<String, dynamic> _$DiscoveredMcpToolDtoToJson(
  _DiscoveredMcpToolDto instance,
) => <String, dynamic>{
  'name': instance.name,
  'title': instance.title,
  'description': instance.description,
  'inputSchema': instance.inputSchema,
  'annotations': instance.annotations,
};

_DiscoverMcpToolsResultDto _$DiscoverMcpToolsResultDtoFromJson(
  Map<String, dynamic> json,
) => _DiscoverMcpToolsResultDto(
  tools:
      (json['tools'] as List<dynamic>?)
          ?.map((e) => DiscoveredMcpToolDto.fromJson(e as Map<String, dynamic>))
          .toList() ??
      const <DiscoveredMcpToolDto>[],
  serverInfo: json['serverInfo'] == null
      ? null
      : McpServerInfoDto.fromJson(json['serverInfo'] as Map<String, dynamic>),
);

Map<String, dynamic> _$DiscoverMcpToolsResultDtoToJson(
  _DiscoverMcpToolsResultDto instance,
) => <String, dynamic>{
  'tools': instance.tools.map((e) => e.toJson()).toList(),
  'serverInfo': instance.serverInfo?.toJson(),
};

_McpPortMappingDto _$McpPortMappingDtoFromJson(Map<String, dynamic> json) =>
    _McpPortMappingDto(
      name: json['name'] as String,
      dataType: json['dataType'] as String? ?? 'json',
      description: json['description'] as String?,
      required: json['required'] as bool? ?? false,
    );

Map<String, dynamic> _$McpPortMappingDtoToJson(_McpPortMappingDto instance) =>
    <String, dynamic>{
      'name': instance.name,
      'dataType': instance.dataType,
      'description': instance.description,
      'required': instance.required,
    };

_McpPortMappingMetadataDto _$McpPortMappingMetadataDtoFromJson(
  Map<String, dynamic> json,
) => _McpPortMappingMetadataDto(
  inputs:
      (json['inputs'] as List<dynamic>?)
          ?.map((e) => McpPortMappingDto.fromJson(e as Map<String, dynamic>))
          .toList() ??
      const <McpPortMappingDto>[],
  outputs:
      (json['outputs'] as List<dynamic>?)
          ?.map((e) => McpPortMappingDto.fromJson(e as Map<String, dynamic>))
          .toList() ??
      const <McpPortMappingDto>[],
);

Map<String, dynamic> _$McpPortMappingMetadataDtoToJson(
  _McpPortMappingMetadataDto instance,
) => <String, dynamic>{
  'inputs': instance.inputs.map((e) => e.toJson()).toList(),
  'outputs': instance.outputs.map((e) => e.toJson()).toList(),
};

_ImportedToolResultDto _$ImportedToolResultDtoFromJson(
  Map<String, dynamic> json,
) => _ImportedToolResultDto(
  toolDefinitionId: json['toolDefinitionId'] as String?,
  toolName: json['toolName'] as String,
  status: json['status'] as String,
  title: json['title'] as String?,
  description: json['description'] as String?,
  portMappingMetadata: json['portMappingMetadata'] == null
      ? null
      : McpPortMappingMetadataDto.fromJson(
          json['portMappingMetadata'] as Map<String, dynamic>,
        ),
  reasonCode: json['reasonCode'] as String?,
  reasonMessage: json['reasonMessage'] as String?,
);

Map<String, dynamic> _$ImportedToolResultDtoToJson(
  _ImportedToolResultDto instance,
) => <String, dynamic>{
  'toolDefinitionId': instance.toolDefinitionId,
  'toolName': instance.toolName,
  'status': instance.status,
  'title': instance.title,
  'description': instance.description,
  'portMappingMetadata': instance.portMappingMetadata?.toJson(),
  'reasonCode': instance.reasonCode,
  'reasonMessage': instance.reasonMessage,
};

_ImportMcpToolsSummaryDto _$ImportMcpToolsSummaryDtoFromJson(
  Map<String, dynamic> json,
) => _ImportMcpToolsSummaryDto(
  total: (json['total'] as num?)?.toInt() ?? 0,
  imported: (json['imported'] as num?)?.toInt() ?? 0,
  overwritten: (json['overwritten'] as num?)?.toInt() ?? 0,
  skipped: (json['skipped'] as num?)?.toInt() ?? 0,
  failed: (json['failed'] as num?)?.toInt() ?? 0,
);

Map<String, dynamic> _$ImportMcpToolsSummaryDtoToJson(
  _ImportMcpToolsSummaryDto instance,
) => <String, dynamic>{
  'total': instance.total,
  'imported': instance.imported,
  'overwritten': instance.overwritten,
  'skipped': instance.skipped,
  'failed': instance.failed,
};

_ImportMcpToolsResultDto _$ImportMcpToolsResultDtoFromJson(
  Map<String, dynamic> json,
) => _ImportMcpToolsResultDto(
  mcpServerConfigId: json['mcpServerConfigId'] as String,
  summary: ImportMcpToolsSummaryDto.fromJson(
    json['summary'] as Map<String, dynamic>,
  ),
  results:
      (json['results'] as List<dynamic>?)
          ?.map(
            (e) => ImportedToolResultDto.fromJson(e as Map<String, dynamic>),
          )
          .toList() ??
      const <ImportedToolResultDto>[],
);

Map<String, dynamic> _$ImportMcpToolsResultDtoToJson(
  _ImportMcpToolsResultDto instance,
) => <String, dynamic>{
  'mcpServerConfigId': instance.mcpServerConfigId,
  'summary': instance.summary.toJson(),
  'results': instance.results.map((e) => e.toJson()).toList(),
};

_McpToolDefinitionDto _$McpToolDefinitionDtoFromJson(
  Map<String, dynamic> json,
) => _McpToolDefinitionDto(
  id: json['id'] as String,
  mcpServerConfigId: json['mcpServerConfigId'] as String?,
  source: json['source'] as String?,
  name: json['name'] as String,
  title: json['title'] as String?,
  description: json['description'] as String?,
  inputSchema: json['inputSchema'] as Map<String, dynamic>?,
  outputSchema: json['outputSchema'] as Map<String, dynamic>?,
  portMappingMetadata: json['portMappingMetadata'] == null
      ? null
      : McpPortMappingMetadataDto.fromJson(
          json['portMappingMetadata'] as Map<String, dynamic>,
        ),
  annotations: json['annotations'] as Map<String, dynamic>?,
  isActive: json['isActive'] as bool? ?? true,
  importedAt: json['importedAt'] as String?,
  createdAt: json['createdAt'] as String?,
  updatedAt: json['updatedAt'] as String?,
);

Map<String, dynamic> _$McpToolDefinitionDtoToJson(
  _McpToolDefinitionDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'mcpServerConfigId': instance.mcpServerConfigId,
  'source': instance.source,
  'name': instance.name,
  'title': instance.title,
  'description': instance.description,
  'inputSchema': instance.inputSchema,
  'outputSchema': instance.outputSchema,
  'portMappingMetadata': instance.portMappingMetadata?.toJson(),
  'annotations': instance.annotations,
  'isActive': instance.isActive,
  'importedAt': instance.importedAt,
  'createdAt': instance.createdAt,
  'updatedAt': instance.updatedAt,
};

_McpServerConfigSummaryDto _$McpServerConfigSummaryDtoFromJson(
  Map<String, dynamic> json,
) => _McpServerConfigSummaryDto(
  id: json['id'] as String,
  tenantId: json['tenantId'] as String,
  organizationId: json['organizationId'] as String,
  name: json['name'] as String,
  description: json['description'] as String?,
  transportType: json['transportType'] as String,
  status: json['status'] as String,
  lastTestedAt: json['lastTestedAt'] as String?,
  createdAt: json['createdAt'] as String,
  updatedAt: json['updatedAt'] as String,
  toolCount: (json['toolCount'] as num?)?.toInt() ?? 0,
  sourceKind: json['sourceKind'] as String? ?? 'manual',
);

Map<String, dynamic> _$McpServerConfigSummaryDtoToJson(
  _McpServerConfigSummaryDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'tenantId': instance.tenantId,
  'organizationId': instance.organizationId,
  'name': instance.name,
  'description': instance.description,
  'transportType': instance.transportType,
  'status': instance.status,
  'lastTestedAt': instance.lastTestedAt,
  'createdAt': instance.createdAt,
  'updatedAt': instance.updatedAt,
  'toolCount': instance.toolCount,
  'sourceKind': instance.sourceKind,
};

_McpServerConfigDetailDto _$McpServerConfigDetailDtoFromJson(
  Map<String, dynamic> json,
) => _McpServerConfigDetailDto(
  id: json['id'] as String,
  tenantId: json['tenantId'] as String,
  organizationId: json['organizationId'] as String,
  name: json['name'] as String,
  description: json['description'] as String?,
  transportType: json['transportType'] as String,
  status: json['status'] as String,
  lastTestedAt: json['lastTestedAt'] as String?,
  createdAt: json['createdAt'] as String,
  updatedAt: json['updatedAt'] as String,
  connection: McpConnectionConfigDto.fromJson(
    json['connection'] as Map<String, dynamic>,
  ),
  credentialKeys:
      (json['credentialKeys'] as List<dynamic>?)
          ?.map((e) => e as String)
          .toList() ??
      const <String>[],
  tools:
      (json['tools'] as List<dynamic>?)
          ?.map((e) => McpToolDefinitionDto.fromJson(e as Map<String, dynamic>))
          .toList() ??
      const <McpToolDefinitionDto>[],
  sourceKind: json['sourceKind'] as String? ?? 'manual',
);

Map<String, dynamic> _$McpServerConfigDetailDtoToJson(
  _McpServerConfigDetailDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'tenantId': instance.tenantId,
  'organizationId': instance.organizationId,
  'name': instance.name,
  'description': instance.description,
  'transportType': instance.transportType,
  'status': instance.status,
  'lastTestedAt': instance.lastTestedAt,
  'createdAt': instance.createdAt,
  'updatedAt': instance.updatedAt,
  'connection': instance.connection.toJson(),
  'credentialKeys': instance.credentialKeys,
  'tools': instance.tools.map((e) => e.toJson()).toList(),
  'sourceKind': instance.sourceKind,
};
