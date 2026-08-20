import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/models/paginated_response.dart';
import '../api/skill_api.dart';
import '../models/skill_dto.dart';

/// 技能列表状态
class SkillListState {
  final List<SkillDto> skills;
  final PaginationMeta? meta;
  final String? statusFilter;
  final bool? isBuiltinFilter;
  final String? sourceKindFilter;
  final String? searchQuery;
  final bool isLoadingMore;
  final Object? loadMoreError;

  const SkillListState({
    this.skills = const [],
    this.meta,
    this.statusFilter,
    this.isBuiltinFilter,
    this.sourceKindFilter,
    this.searchQuery,
    this.isLoadingMore = false,
    this.loadMoreError,
  });

  SkillListState copyWith({
    List<SkillDto>? skills,
    PaginationMeta? meta,
    String? statusFilter,
    bool? isBuiltinFilter,
    String? sourceKindFilter,
    String? searchQuery,
    bool? isLoadingMore,
    Object? loadMoreError,
    bool clearStatusFilter = false,
    bool clearIsBuiltinFilter = false,
    bool clearSearchQuery = false,
    bool clearLoadMoreError = false,
  }) {
    return SkillListState(
      skills: skills ?? this.skills,
      meta: meta ?? this.meta,
      statusFilter: clearStatusFilter
          ? null
          : (statusFilter ?? this.statusFilter),
      isBuiltinFilter: clearIsBuiltinFilter
          ? null
          : (isBuiltinFilter ?? this.isBuiltinFilter),
      sourceKindFilter: sourceKindFilter ?? this.sourceKindFilter,
      searchQuery: clearSearchQuery ? null : (searchQuery ?? this.searchQuery),
      isLoadingMore: isLoadingMore ?? this.isLoadingMore,
      loadMoreError: clearLoadMoreError
          ? null
          : (loadMoreError ?? this.loadMoreError),
    );
  }
}

/// 技能列表 Notifier（手动 AsyncNotifier，不使用 riverpod_generator）
class SkillListNotifier extends AsyncNotifier<SkillListState> {
  String? _statusFilter;
  bool? _isBuiltinFilter;
  String? _sourceKindFilter;
  String? _searchQuery;

  @override
  Future<SkillListState> build() async {
    return _fetchSkills();
  }

  Future<SkillListState> _fetchSkills({int page = 1}) async {
    final api = ref.read(skillApiProvider);
    final result = await api.listSkills(
      page: page,
      status: _statusFilter,
      isBuiltin: _isBuiltinFilter,
      sourceKind: _sourceKindFilter,
      search: _searchQuery,
    );

    return SkillListState(
      skills: result.data,
      meta: result.meta,
      statusFilter: _statusFilter,
      isBuiltinFilter: _isBuiltinFilter,
      sourceKindFilter: _sourceKindFilter,
      searchQuery: _searchQuery,
    );
  }

  /// 设置状态过滤器并重新加载
  Future<void> setStatusFilter(String? status) async {
    _statusFilter = status;
    state = const AsyncValue.loading();
    final nextState = await AsyncValue.guard(() => _fetchSkills());
    if (!ref.mounted) return;
    state = nextState;
  }

  /// 设置内置/自定义过滤器并重新加载
  Future<void> setIsBuiltinFilter(bool? isBuiltin) async {
    _isBuiltinFilter = isBuiltin;
    state = const AsyncValue.loading();
    final nextState = await AsyncValue.guard(() => _fetchSkills());
    if (!ref.mounted) return;
    state = nextState;
  }

  Future<void> setSourceKindFilter(String? sourceKind) async {
    _sourceKindFilter = sourceKind;
    state = const AsyncValue.loading();
    final nextState = await AsyncValue.guard(() => _fetchSkills());
    if (!ref.mounted) return;
    state = nextState;
  }

  /// 设置搜索关键词并重新加载
  Future<void> setSearchQuery(String? query) async {
    _searchQuery = (query != null && query.isEmpty) ? null : query;
    state = const AsyncValue.loading();
    final nextState = await AsyncValue.guard(() => _fetchSkills());
    if (!ref.mounted) return;
    state = nextState;
  }

  /// 刷新列表
  Future<void> refresh() async {
    state = const AsyncValue.loading();
    final nextState = await AsyncValue.guard(() => _fetchSkills());
    if (!ref.mounted) return;
    state = nextState;
  }

  /// 加载更多（下一页）
  Future<void> loadMore() async {
    final currentState = state.value;
    if (currentState == null || currentState.isLoadingMore) return;

    final meta = currentState.meta;
    if (meta == null || meta.page >= meta.totalPages) return;

    state = AsyncValue.data(
      currentState.copyWith(isLoadingMore: true, clearLoadMoreError: true),
    );

    try {
      final api = ref.read(skillApiProvider);
      final result = await api.listSkills(
        page: meta.page + 1,
        status: _statusFilter,
        isBuiltin: _isBuiltinFilter,
        sourceKind: _sourceKindFilter,
        search: _searchQuery,
      );

      if (!ref.mounted) return;

      state = AsyncValue.data(
        SkillListState(
          skills: [...currentState.skills, ...result.data],
          meta: result.meta,
          statusFilter: _statusFilter,
          isBuiltinFilter: _isBuiltinFilter,
          sourceKindFilter: _sourceKindFilter,
          searchQuery: _searchQuery,
        ),
      );
    } catch (e) {
      if (!ref.mounted) return;
      state = AsyncValue.data(
        currentState.copyWith(isLoadingMore: false, loadMoreError: e),
      );
    }
  }
}

/// 技能列表 Provider
final skillListProvider =
    AsyncNotifierProvider<SkillListNotifier, SkillListState>(
      SkillListNotifier.new,
    );

/// 技能详情 Provider（按 ID 获取单个技能）
final skillDetailProvider = FutureProvider.family<SkillDto, String>((
  ref,
  id,
) async {
  final api = ref.read(skillApiProvider);
  return api.getSkill(id);
});
