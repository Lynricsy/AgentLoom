import 'package:freezed_annotation/freezed_annotation.dart';

part 'memory_node.freezed.dart';
part 'memory_node.g.dart';

/// Memory 节点 DTO — 匹配服务端 memory_nodes 表结构
@freezed
abstract class MemoryNodeDto with _$MemoryNodeDto {
  const factory MemoryNodeDto({
    required String id,
    required String instanceId,
    required String contentType,
    Map<String, dynamic>? metadata,
    @Default(0) int disclosureLevel,
    required String createdAt,
  }) = _MemoryNodeDto;

  factory MemoryNodeDto.fromJson(Map<String, dynamic> json) =>
      _$MemoryNodeDtoFromJson(json);
}
