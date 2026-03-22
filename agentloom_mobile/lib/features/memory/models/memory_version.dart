import 'package:freezed_annotation/freezed_annotation.dart';

part 'memory_version.freezed.dart';
part 'memory_version.g.dart';

/// Memory 版本 DTO
@freezed
abstract class MemoryVersionDto with _$MemoryVersionDto {
  const factory MemoryVersionDto({
    required String id,
    @JsonKey(name: 'node_id') required String nodeId,
    required String content,
    @JsonKey(name: 'version_number') required int versionNumber,
    @JsonKey(name: 'change_type') String? changeType,
    @Default(false) bool deprecated,
    @JsonKey(name: 'created_at') required String createdAt,
  }) = _MemoryVersionDto;

  factory MemoryVersionDto.fromJson(Map<String, dynamic> json) =>
      _$MemoryVersionDtoFromJson(json);
}
