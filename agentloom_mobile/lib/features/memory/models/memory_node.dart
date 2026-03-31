import 'package:freezed_annotation/freezed_annotation.dart';

part 'memory_node.freezed.dart';
part 'memory_node.g.dart';

/// Memory 节点 DTO
@freezed
abstract class MemoryNodeDto with _$MemoryNodeDto {
  const factory MemoryNodeDto({
    required String id,
    required String instanceId,
    required String content,
    String? disclosureLevel,
    @Default([])
    List<String> triggerKeywords,
    required String createdAt,
    required String updatedAt,
  }) = _MemoryNodeDto;

  factory MemoryNodeDto.fromJson(Map<String, dynamic> json) =>
      _$MemoryNodeDtoFromJson(json);
}
