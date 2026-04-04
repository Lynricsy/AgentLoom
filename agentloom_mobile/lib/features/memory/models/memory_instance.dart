import 'package:freezed_annotation/freezed_annotation.dart';

part 'memory_instance.freezed.dart';
part 'memory_instance.g.dart';

/// Memory 实例 DTO
@freezed
abstract class MemoryInstanceDto with _$MemoryInstanceDto {
  const factory MemoryInstanceDto({
    required String id,
    required String name,
    String? description,
    Map<String, dynamic>? config,
    required String status,
    @Default(0) int nodeCount,
    @Default(0) int edgeCount,
    required String createdAt,
    required String updatedAt,
    @Default('manual') String sourceKind,
  }) = _MemoryInstanceDto;

  factory MemoryInstanceDto.fromJson(Map<String, dynamic> json) =>
      _$MemoryInstanceDtoFromJson(json);
}

/// Memory 列表分页状态
class MemoryListState {
  final List<MemoryInstanceDto> instances;
  final int currentPage;
  final bool hasMore;
  final String? sourceKindFilter;
  final bool isLoadingMore;

  const MemoryListState({
    this.instances = const [],
    this.currentPage = 1,
    this.hasMore = true,
    this.sourceKindFilter,
    this.isLoadingMore = false,
  });

  MemoryListState copyWith({
    List<MemoryInstanceDto>? instances,
    int? currentPage,
    bool? hasMore,
    String? sourceKindFilter,
    bool? isLoadingMore,
  }) {
    return MemoryListState(
      instances: instances ?? this.instances,
      currentPage: currentPage ?? this.currentPage,
      hasMore: hasMore ?? this.hasMore,
      sourceKindFilter: sourceKindFilter ?? this.sourceKindFilter,
      isLoadingMore: isLoadingMore ?? this.isLoadingMore,
    );
  }
}
