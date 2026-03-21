import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/agent_api.dart';
import '../models/agent_definition_dto.dart';

/// Agent 列表 Notifier（手动 AsyncNotifier，不使用 riverpod_generator）
class AgentListNotifier extends AsyncNotifier<AgentListState> {
  String? _statusFilter;
  String? _searchQuery;

  @override
  Future<AgentListState> build() async {
    return _fetchAgents();
  }

  Future<AgentListState> _fetchAgents({int page = 1}) async {
    final api = ref.read(agentApiProvider);
    final result = await api.listAgents(
      page: page,
      status: _statusFilter,
      search: _searchQuery,
    );

    return AgentListState(
      agents: result.data,
      currentPage: result.meta.page,
      hasMore: result.meta.page < result.meta.totalPages,
      statusFilter: _statusFilter,
      searchQuery: _searchQuery,
    );
  }

  /// 设置状态过滤器并重新加载
  Future<void> setStatusFilter(String? status) async {
    _statusFilter = status;
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() => _fetchAgents());
  }

  /// 设置搜索关键词并重新加载
  Future<void> setSearchQuery(String? query) async {
    _searchQuery = (query != null && query.isEmpty) ? null : query;
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() => _fetchAgents());
  }

  /// 刷新列表
  Future<void> refresh() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() => _fetchAgents());
  }

  /// 加载更多（下一页）
  Future<void> loadMore() async {
    final currentState = state.value;
    if (currentState == null || currentState.isLoadingMore) return;
    if (!currentState.hasMore) return;

    state = AsyncValue.data(currentState.copyWith(isLoadingMore: true));

    try {
      final api = ref.read(agentApiProvider);
      final result = await api.listAgents(
        page: currentState.currentPage + 1,
        status: _statusFilter,
        search: _searchQuery,
      );

      if (!ref.mounted) return;

      state = AsyncValue.data(
        AgentListState(
          agents: [...currentState.agents, ...result.data],
          currentPage: result.meta.page,
          hasMore: result.meta.page < result.meta.totalPages,
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

/// Agent 列表 Provider
final agentListProvider =
    AsyncNotifierProvider<AgentListNotifier, AgentListState>(
      AgentListNotifier.new,
    );

/// Agent 详情 Provider（按 ID 获取单个 Agent）
final agentDetailProvider = FutureProvider.family<AgentDefinitionDto, String>((
  ref,
  id,
) async {
  final api = ref.read(agentApiProvider);
  return api.getAgent(id);
});
