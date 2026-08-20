import 'package:freezed_annotation/freezed_annotation.dart';

import 'resource_envelope_decoder.dart';

part 'sandbox_dto.freezed.dart';
part 'sandbox_dto.g.dart';

@freezed
abstract class SandboxConfigDto with _$SandboxConfigDto {
  const SandboxConfigDto._();
  const factory SandboxConfigDto({
    @Default(1) double cpu,
    @Default(512) int memory,
    @Default(2) int disk,
    @Default(24) int timeout,
    int? timeoutSeconds,
    @Default('session') String lifecycleMode,
    String? name,
    int? persistenceExpiryHours,
    String? restoreWorkspaceId,
  }) = _SandboxConfigDto;
  factory SandboxConfigDto.fromJson(Map<String, dynamic> json) =>
      decodeResourceDto(json, _$SandboxConfigDtoFromJson, name: 'SandboxConfigDto');

  String get timeoutLabel => timeoutSeconds == null ? '${timeout}h' : '${timeoutSeconds}s';
}

@freezed
abstract class SandboxSessionDto with _$SandboxSessionDto {
  const SandboxSessionDto._();
  const factory SandboxSessionDto({
    required String id,
    required String tenantId,
    required String status,
    required SandboxConfigDto config,
    required String createdAt,
    @Default('resource') String bindingType,
    String? executionId,
    String? agentConversationId,
    String? sandboxNodeId,
    String? workspacePath,
    String? startedAt,
    String? stoppedAt,
  }) = _SandboxSessionDto;
  factory SandboxSessionDto.fromJson(Map<String, dynamic> json) =>
      decodeResourceDto(json, _$SandboxSessionDtoFromJson, name: 'SandboxSessionDto');

  String get bindingLabel => switch (bindingType) {
    'conversation' => '对话',
    'execution' => '执行',
    _ => '资源',
  };
}

@freezed
abstract class SandboxStatsDto with _$SandboxStatsDto {
  const SandboxStatsDto._();
  const factory SandboxStatsDto({
    required double cpuPercent,
    required double memoryUsageMb,
    required double memoryLimitMb,
    int? diskUsage,
    int? diskTotal,
  }) = _SandboxStatsDto;
  factory SandboxStatsDto.fromJson(Map<String, dynamic> json) =>
      decodeResourceDto(json, _$SandboxStatsDtoFromJson, name: 'SandboxStatsDto');

  bool get hasDiskStats => diskUsage != null && diskTotal != null;
}

@freezed
abstract class SandboxLogDto with _$SandboxLogDto {
  const factory SandboxLogDto({
    required String id,
    required String sessionId,
    @Default('stdout') String level,
    required String message,
    required String createdAt,
  }) = _SandboxLogDto;
  factory SandboxLogDto.fromJson(Map<String, dynamic> json) =>
      decodeResourceDto(json, _$SandboxLogDtoFromJson, name: 'SandboxLogDto');
}
