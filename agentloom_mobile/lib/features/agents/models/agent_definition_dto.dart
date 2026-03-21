import 'package:freezed_annotation/freezed_annotation.dart';

part 'agent_definition_dto.freezed.dart';
part 'agent_definition_dto.g.dart';

/// Agent 定义 DTO
@freezed
abstract class AgentDefinitionDto with _$AgentDefinitionDto {
  const factory AgentDefinitionDto({
    required String id,
    @JsonKey(name: 'organization_id') required String organizationId,
    required String name,
    String? description,
    required String status,
    @JsonKey(name: 'system_prompt') String? systemPrompt,
    @JsonKey(name: 'model_id') String? modelId,
    @JsonKey(name: 'autonomy_mode') String? autonomyMode,
    @JsonKey(name: 'max_iterations') int? maxIterations,
    @JsonKey(name: 'timeout_seconds') int? timeoutSeconds,
    int? version,
    @JsonKey(name: 'created_at') required String createdAt,
    @JsonKey(name: 'updated_at') required String updatedAt,
    @JsonKey(name: 'created_by') String? createdBy,
  }) = _AgentDefinitionDto;

  factory AgentDefinitionDto.fromJson(Map<String, dynamic> json) =>
      _$AgentDefinitionDtoFromJson(json);
}

/// Agent 列表分页状态
class AgentListState {
  final List<AgentDefinitionDto> agents;
  final int currentPage;
  final bool hasMore;
  final String? statusFilter;
  final String? searchQuery;
  final bool isLoadingMore;

  const AgentListState({
    this.agents = const [],
    this.currentPage = 1,
    this.hasMore = true,
    this.statusFilter,
    this.searchQuery,
    this.isLoadingMore = false,
  });

  AgentListState copyWith({
    List<AgentDefinitionDto>? agents,
    int? currentPage,
    bool? hasMore,
    String? statusFilter,
    String? searchQuery,
    bool? isLoadingMore,
  }) {
    return AgentListState(
      agents: agents ?? this.agents,
      currentPage: currentPage ?? this.currentPage,
      hasMore: hasMore ?? this.hasMore,
      statusFilter: statusFilter ?? this.statusFilter,
      searchQuery: searchQuery ?? this.searchQuery,
      isLoadingMore: isLoadingMore ?? this.isLoadingMore,
    );
  }
}
