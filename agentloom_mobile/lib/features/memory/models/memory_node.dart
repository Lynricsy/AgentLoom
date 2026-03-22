import 'package:freezed_annotation/freezed_annotation.dart';

part 'memory_node.freezed.dart';
part 'memory_node.g.dart';

/// Memory 节点 DTO
@freezed
abstract class MemoryNodeDto with _$MemoryNodeDto {
  const factory MemoryNodeDto({
    required String id,
    @JsonKey(name: 'instance_id') required String instanceId,
    required String content,
    @JsonKey(name: 'disclosure_level') String? disclosureLevel,
    @JsonKey(name: 'trigger_keywords')
    @Default([])
    List<String> triggerKeywords,
    @JsonKey(name: 'created_at') required String createdAt,
    @JsonKey(name: 'updated_at') required String updatedAt,
  }) = _MemoryNodeDto;

  factory MemoryNodeDto.fromJson(Map<String, dynamic> json) =>
      _$MemoryNodeDtoFromJson(json);
}
