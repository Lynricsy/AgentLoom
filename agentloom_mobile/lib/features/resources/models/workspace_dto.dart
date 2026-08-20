import 'package:freezed_annotation/freezed_annotation.dart';

import 'resource_envelope_decoder.dart';

part 'workspace_dto.freezed.dart';
part 'workspace_dto.g.dart';

@freezed
abstract class WorkspaceDto with _$WorkspaceDto {
  const WorkspaceDto._();
  const factory WorkspaceDto({
    required String id,
    required String name,
    String? description,
    required String storageKey,
    int? sizeBytes,
    required String status,
    Map<String, dynamic>? config,
    @Default('manual') String sourceKind,
    @Default(false) bool isAutoArchived,
    required String createdAt,
    required String updatedAt,
  }) = _WorkspaceDto;

  factory WorkspaceDto.fromJson(Map<String, dynamic> json) =>
      decodeResourceDto(json, _$WorkspaceDtoFromJson, name: 'WorkspaceDto');

  String get sourceLabel => switch (sourceKind) {
    'sandbox_snapshot' => '沙箱快照',
    'execution_archive' => '执行归档',
    _ => '常规',
  };
}
