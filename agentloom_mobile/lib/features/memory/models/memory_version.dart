import 'package:freezed_annotation/freezed_annotation.dart';

part 'memory_version.freezed.dart';
part 'memory_version.g.dart';

/// Memory 版本 DTO
@freezed
abstract class MemoryVersionDto with _$MemoryVersionDto {
  const factory MemoryVersionDto({
    required String id,
    required String nodeId,
    required String content,
    required int versionNumber,
    String? changeType,
    @Default(false) bool deprecated,
    required String createdAt,
  }) = _MemoryVersionDto;

  factory MemoryVersionDto.fromJson(Map<String, dynamic> json) =>
      _$MemoryVersionDtoFromJson(json);
}
