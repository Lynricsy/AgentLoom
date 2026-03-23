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
  final String? searchQuery;
  final bool isLoadingMore;

  const SkillListState({
    this.skills = const [],
    this.meta,
    this.statusFilter,
    this.searchQuery,
    this.isLoadingMore = false,
  });

  SkillListState copyWith({
    List<SkillDto>? skills,
    PaginationMeta? meta,
    String? statusFilter,
    String? searchQuery,
    bool? isLoadingMore,
    bool clearStatusFilter = false,
    bool clearSearchQuery = false,
  }) {
    return SkillListState(
      skills: skills ?? this.skills,
      meta: meta ?? this.meta,
      statusFilter: clearStatusFilter
          ? null
          : (statusFilter ?? this.statusFilter),
      searchQuery: clearSearchQuery ? null : (searchQuery ?? this.searchQuery),
      isLoadingMore: isLoadingMore ?? this.isLoadingMore,
    );
  }
}

/// 技能列表 Notifier（手动 AsyncNotifier，不使用 riverpod_generator）
class SkillListNotifier extends AsyncNotifier<SkillListState> {
  String? _statusFilter;
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
      search: _searchQuery,
    );

    return SkillListState(
      skills: result.data,
      meta: result.meta,
      statusFilter: _statusFilter,
      searchQuery: _searchQuery,
    );
  }

  /// 设置状态过滤器并重新加载
  Future<void> setStatusFilter(String? status) async {
    _statusFilter = status;
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() => _fetchSkills());
  }

  /// 设置搜索关键词并重新加载
  Future<void> setSearchQuery(String? query) async {
    _searchQuery = (query != null && query.isEmpty) ? null : query;
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() => _fetchSkills());
  }

  /// 刷新列表
  Future<void> refresh() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() => _fetchSkills());
  }

  /// 加载更多（下一页）
  Future<void> loadMore() async {
    final currentState = state.value;
    if (currentState == null || currentState.isLoadingMore) return;

    final meta = currentState.meta;
    if (meta == null || meta.page >= meta.totalPages) return;

    state = AsyncValue.data(currentState.copyWith(isLoadingMore: true));

    try {
      final api = ref.read(skillApiProvider);
      final result = await api.listSkills(
        page: meta.page + 1,
        status: _statusFilter,
        search: _searchQuery,
      );

      if (!ref.mounted) return;

      state = AsyncValue.data(
        SkillListState(
          skills: [...currentState.skills, ...result.data],
          meta: result.meta,
          statusFilter: _statusFilter,
          searchQuery: _searchQuery,
        ),
      );
    } catch (e, st) {
      if (!ref.mounted) return;
      state = AsyncValue.data(currentState.copyWith(isLoadingMore: false));
      state = AsyncValue.error(e, st);
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
