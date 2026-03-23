import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/skill_api.dart';
import '../models/skill_listing_dto.dart';

/// Skill 列表 Notifier（手动 AsyncNotifier，不使用 riverpod_generator）
class SkillListNotifier extends AsyncNotifier<SkillListState> {
  String? _categoryFilter;
  String? _searchQuery;
  String _sortBy = 'popular';

  @override
  Future<SkillListState> build() async {
    return _fetchSkills();
  }

  Future<SkillListState> _fetchSkills({int page = 1}) async {
    final api = ref.read(skillApiProvider);
    final result = await api.browseSkills(
      page: page,
      category: _categoryFilter,
      search: _searchQuery,
      sort: _sortBy,
    );

    return SkillListState(
      skills: result.data,
      currentPage: result.page,
      hasMore: result.page < result.totalPages,
      categoryFilter: _categoryFilter,
      searchQuery: _searchQuery,
      sortBy: _sortBy,
    );
  }

  /// 设置分类过滤器并重新加载
  Future<void> setCategoryFilter(String? category) async {
    _categoryFilter = category;
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() => _fetchSkills());
  }

  /// 设置搜索关键词并重新加载
  Future<void> setSearchQuery(String? query) async {
    _searchQuery = (query != null && query.isEmpty) ? null : query;
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() => _fetchSkills());
  }

  /// 设置排序方式并重新加载
  Future<void> setSortBy(String sort) async {
    _sortBy = sort;
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
    if (!currentState.hasMore) return;

    state = AsyncValue.data(currentState.copyWith(isLoadingMore: true));

    try {
      final api = ref.read(skillApiProvider);
      final result = await api.browseSkills(
        page: currentState.currentPage + 1,
        category: _categoryFilter,
        search: _searchQuery,
        sort: _sortBy,
      );

      if (!ref.mounted) return;

      state = AsyncValue.data(
        SkillListState(
          skills: [...currentState.skills, ...result.data],
          currentPage: result.page,
          hasMore: result.page < result.totalPages,
          categoryFilter: _categoryFilter,
          searchQuery: _searchQuery,
          sortBy: _sortBy,
        ),
      );
    } catch (e, st) {
      if (!ref.mounted) return;
      state = AsyncValue.data(currentState.copyWith(isLoadingMore: false));
      state = AsyncValue.error(e, st);
    }
  }
}

/// Skill 列表 Provider
final skillListProvider =
    AsyncNotifierProvider<SkillListNotifier, SkillListState>(
      SkillListNotifier.new,
    );

/// Skill 详情 Provider（按 ID 获取单个 Skill）
final skillDetailProvider = FutureProvider.family<SkillListingDto, String>((
  ref,
  id,
) async {
  final api = ref.read(skillApiProvider);
  return api.getSkillDetail(id);
});
