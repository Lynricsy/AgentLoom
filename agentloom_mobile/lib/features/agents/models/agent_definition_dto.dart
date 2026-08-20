import 'package:freezed_annotation/freezed_annotation.dart';
import '../../../shared/utils/json_key_normalizer.dart';

part 'agent_definition_dto.freezed.dart';
part 'agent_definition_dto.g.dart';

Map<String, dynamic>? _nullableMapFromJson(Object? value) {
  if (value is Map<String, dynamic>) {
    return value;
  }
  if (value is Map<Object?, Object?>) {
    return value.map((key, item) => MapEntry('$key', item));
  }
  return null;
}

List<Map<String, dynamic>> _mapListFromJson(Object? value) {
  if (value is! List) {
    return const <Map<String, dynamic>>[];
  }

  return value
      .whereType<Map<Object?, Object?>>()
      .map((item) => item.map((key, entry) => MapEntry('$key', entry)))
      .toList(growable: false);
}

List<String>? _nullableStringListFromJson(Object? value) {
  if (value is! List) {
    return null;
  }

  final items = value.whereType<String>().toList(growable: false);
  return items.isEmpty ? null : items;
}

/// Agent 定义 DTO
@freezed
abstract class AgentDefinitionDto with _$AgentDefinitionDto {
  const factory AgentDefinitionDto({
    required String id,
    required String name,
    required String slug,
    String? description,
    String? icon,
    required String status,
    @Default('sandbox') String runtimeMode,
    int? version,
    String? publishedVersionId,
    String? tenantId,
    String? createdBy,
    String? updatedBy,
    required String createdAt,
    required String updatedAt,
    String? systemPrompt,
    @JsonKey(fromJson: _mapListFromJson)
    @Default(<Map<String, dynamic>>[])
    List<Map<String, dynamic>> nodes,
    @JsonKey(fromJson: _mapListFromJson)
    @Default(<Map<String, dynamic>>[])
    List<Map<String, dynamic>> edges,
    @JsonKey(fromJson: _nullableMapFromJson) Map<String, dynamic>? viewport,
    @JsonKey(fromJson: _nullableMapFromJson)
    Map<String, dynamic>? sandboxConfig,
    String? workspaceSnapshotId,
    @JsonKey(fromJson: _nullableMapFromJson) Map<String, dynamic>? inputSchema,
    @JsonKey(fromJson: _nullableStringListFromJson)
    List<String>? memoryInstanceIds,
    String? sandboxLifecycle,
    @Default('manual') String resourceSourceKind,
  }) = _AgentDefinitionDto;

  factory AgentDefinitionDto.fromJson(Map<String, dynamic> json) =>
      _$AgentDefinitionDtoFromJson(normalizeJsonMap(json));

  const AgentDefinitionDto._();

  bool get isNoSandboxRuntime => runtimeMode == 'no_sandbox';

  bool get hasSandboxRuntime => !isNoSandboxRuntime;

  String get runtimeModeLabel => isNoSandboxRuntime ? '无沙箱' : '有沙箱';

  bool get isShareImported => resourceSourceKind == 'share_imported';
}

/// Agent 列表分页状态
class AgentListState {
  const AgentListState({
    this.agents = const [],
    this.currentPage = 1,
    this.hasMore = true,
    this.statusFilter,
    this.sourceKindFilter,
    this.searchQuery,
    this.isLoadingMore = false,
  });

  final List<AgentDefinitionDto> agents;
  final int currentPage;
  final bool hasMore;
  final String? statusFilter;
  final String? sourceKindFilter;
  final String? searchQuery;
  final bool isLoadingMore;

  AgentListState copyWith({
    List<AgentDefinitionDto>? agents,
    int? currentPage,
    bool? hasMore,
    String? statusFilter,
    String? sourceKindFilter,
    String? searchQuery,
    bool? isLoadingMore,
  }) {
    return AgentListState(
      agents: agents ?? this.agents,
      currentPage: currentPage ?? this.currentPage,
      hasMore: hasMore ?? this.hasMore,
      statusFilter: statusFilter ?? this.statusFilter,
      sourceKindFilter: sourceKindFilter ?? this.sourceKindFilter,
      searchQuery: searchQuery ?? this.searchQuery,
      isLoadingMore: isLoadingMore ?? this.isLoadingMore,
    );
  }
}
