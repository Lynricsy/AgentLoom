import 'package:freezed_annotation/freezed_annotation.dart';

import 'resource_envelope_decoder.dart';

part 'mcp_dto.freezed.dart';
part 'mcp_dto.g.dart';

const mcpTransportTypes = <String>['stdio', 'sse', 'streamable_http'];

@freezed
abstract class McpConnectionConfigDto with _$McpConnectionConfigDto {
  const factory McpConnectionConfigDto({
    @Default('stdio') String transportType,
    String? command,
    @Default(<String>[]) List<String> args,
    Map<String, String>? env,
    String? url,
    Map<String, String>? headers,
  }) = _McpConnectionConfigDto;
  factory McpConnectionConfigDto.fromJson(Map<String, dynamic> json) =>
      decodeResourceDto(json, _$McpConnectionConfigDtoFromJson, name: 'McpConnectionConfigDto');
}

@freezed
abstract class McpServerInfoDto with _$McpServerInfoDto {
  const factory McpServerInfoDto({required String name, required String version, String? protocolVersion}) = _McpServerInfoDto;
  factory McpServerInfoDto.fromJson(Map<String, dynamic> json) => decodeResourceDto(json, _$McpServerInfoDtoFromJson, name: 'McpServerInfoDto');
}

@freezed
abstract class TestMcpConnectionResultDto with _$TestMcpConnectionResultDto {
  const factory TestMcpConnectionResultDto({required bool success, McpServerInfoDto? serverInfo}) = _TestMcpConnectionResultDto;
  factory TestMcpConnectionResultDto.fromJson(Map<String, dynamic> json) => decodeResourceDto(json, _$TestMcpConnectionResultDtoFromJson, name: 'TestMcpConnectionResultDto');
}

@freezed
abstract class DiscoveredMcpToolDto with _$DiscoveredMcpToolDto {
  const factory DiscoveredMcpToolDto({required String name, String? title, String? description, Map<String, dynamic>? inputSchema, Map<String, dynamic>? annotations}) = _DiscoveredMcpToolDto;
  factory DiscoveredMcpToolDto.fromJson(Map<String, dynamic> json) => decodeResourceDto(json, _$DiscoveredMcpToolDtoFromJson, name: 'DiscoveredMcpToolDto');
}

@freezed
abstract class DiscoverMcpToolsResultDto with _$DiscoverMcpToolsResultDto {
  const factory DiscoverMcpToolsResultDto({@Default(<DiscoveredMcpToolDto>[]) List<DiscoveredMcpToolDto> tools, McpServerInfoDto? serverInfo}) = _DiscoverMcpToolsResultDto;
  factory DiscoverMcpToolsResultDto.fromJson(Map<String, dynamic> json) => decodeResourceDto(json, _$DiscoverMcpToolsResultDtoFromJson, name: 'DiscoverMcpToolsResultDto');
}

@freezed
abstract class McpPortMappingDto with _$McpPortMappingDto {
  const factory McpPortMappingDto({required String name, @Default('json') String dataType, String? description, @Default(false) bool required}) = _McpPortMappingDto;
  factory McpPortMappingDto.fromJson(Map<String, dynamic> json) => decodeResourceDto(json, _$McpPortMappingDtoFromJson, name: 'McpPortMappingDto');
}

@freezed
abstract class McpPortMappingMetadataDto with _$McpPortMappingMetadataDto {
  const factory McpPortMappingMetadataDto({@Default(<McpPortMappingDto>[]) List<McpPortMappingDto> inputs, @Default(<McpPortMappingDto>[]) List<McpPortMappingDto> outputs}) = _McpPortMappingMetadataDto;
  factory McpPortMappingMetadataDto.fromJson(Map<String, dynamic> json) => decodeResourceDto(json, _$McpPortMappingMetadataDtoFromJson, name: 'McpPortMappingMetadataDto');
}

@freezed
abstract class ImportedToolResultDto with _$ImportedToolResultDto {
  const factory ImportedToolResultDto({String? toolDefinitionId, required String toolName, required String status, String? title, String? description, McpPortMappingMetadataDto? portMappingMetadata, String? reasonCode, String? reasonMessage}) = _ImportedToolResultDto;
  factory ImportedToolResultDto.fromJson(Map<String, dynamic> json) => decodeResourceDto(json, _$ImportedToolResultDtoFromJson, name: 'ImportedToolResultDto');
}

@freezed
abstract class ImportMcpToolsSummaryDto with _$ImportMcpToolsSummaryDto {
  const factory ImportMcpToolsSummaryDto({@Default(0) int total, @Default(0) int imported, @Default(0) int overwritten, @Default(0) int skipped, @Default(0) int failed}) = _ImportMcpToolsSummaryDto;
  factory ImportMcpToolsSummaryDto.fromJson(Map<String, dynamic> json) => decodeResourceDto(json, _$ImportMcpToolsSummaryDtoFromJson, name: 'ImportMcpToolsSummaryDto');
}

@freezed
abstract class ImportMcpToolsResultDto with _$ImportMcpToolsResultDto {
  const factory ImportMcpToolsResultDto({required String mcpServerConfigId, required ImportMcpToolsSummaryDto summary, @Default(<ImportedToolResultDto>[]) List<ImportedToolResultDto> results}) = _ImportMcpToolsResultDto;
  factory ImportMcpToolsResultDto.fromJson(Map<String, dynamic> json) => decodeResourceDto(json, _$ImportMcpToolsResultDtoFromJson, name: 'ImportMcpToolsResultDto');
}

@freezed
abstract class McpToolDefinitionDto with _$McpToolDefinitionDto {
  const factory McpToolDefinitionDto({required String id, String? mcpServerConfigId, String? source, required String name, String? title, String? description, Map<String, dynamic>? inputSchema, Map<String, dynamic>? outputSchema, McpPortMappingMetadataDto? portMappingMetadata, Map<String, dynamic>? annotations, @Default(true) bool isActive, String? importedAt, String? createdAt, String? updatedAt}) = _McpToolDefinitionDto;
  factory McpToolDefinitionDto.fromJson(Map<String, dynamic> json) => decodeResourceDto(json, _$McpToolDefinitionDtoFromJson, name: 'McpToolDefinitionDto');
}

@freezed
abstract class McpServerConfigSummaryDto with _$McpServerConfigSummaryDto {
  const factory McpServerConfigSummaryDto({required String id, required String tenantId, required String organizationId, required String name, String? description, required String transportType, required String status, String? lastTestedAt, required String createdAt, required String updatedAt, @Default(0) int toolCount, @Default('manual') String sourceKind}) = _McpServerConfigSummaryDto;
  factory McpServerConfigSummaryDto.fromJson(Map<String, dynamic> json) => decodeResourceDto(json, _$McpServerConfigSummaryDtoFromJson, name: 'McpServerConfigSummaryDto');
}

@freezed
abstract class McpServerConfigDetailDto with _$McpServerConfigDetailDto {
  const factory McpServerConfigDetailDto({required String id, required String tenantId, required String organizationId, required String name, String? description, required String transportType, required String status, String? lastTestedAt, required String createdAt, required String updatedAt, required McpConnectionConfigDto connection, @Default(<String>[]) List<String> credentialKeys, @Default(<McpToolDefinitionDto>[]) List<McpToolDefinitionDto> tools, @Default('manual') String sourceKind}) = _McpServerConfigDetailDto;
  factory McpServerConfigDetailDto.fromJson(Map<String, dynamic> json) =>
      decodeResourceDto(_normalizeMcpDetail(json), _$McpServerConfigDetailDtoFromJson, name: 'McpServerConfigDetailDto');
}

Map<String, dynamic> _normalizeMcpDetail(Map<String, dynamic> json) {
  final normalized = Map<String, dynamic>.from(json);
  normalized.putIfAbsent('connection', () => <String, dynamic>{
    'transportType': normalized['transportType'],
    'command': normalized['command'],
    'args': normalized['args'] ?? const <String>[],
    'url': normalized['url'],
  });
  return normalized;
}
