import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/models/paginated_response.dart';
import '../api/workflow_api.dart';
import '../models/workflow_definition_dto.dart';

/// 工作流列表状态
class WorkflowListState {
  final List<WorkflowDefinitionDto> workflows;
  final PaginationMeta? meta;
  final String? statusFilter;
  final String? sourceKindFilter;
  final String? searchQuery;
  final bool isLoadingMore;
  final Object? loadMoreError;

  const WorkflowListState({
    this.workflows = const [],
    this.meta,
    this.statusFilter,
    this.sourceKindFilter,
    this.searchQuery,
    this.isLoadingMore = false,
    this.loadMoreError,
  });

  WorkflowListState copyWith({
    List<WorkflowDefinitionDto>? workflows,
    PaginationMeta? meta,
    String? statusFilter,
    String? sourceKindFilter,
    String? searchQuery,
    bool? isLoadingMore,
    Object? loadMoreError,
    bool clearStatusFilter = false,
    bool clearSourceKindFilter = false,
    bool clearSearchQuery = false,
    bool clearLoadMoreError = false,
  }) {
    return WorkflowListState(
      workflows: workflows ?? this.workflows,
      meta: meta ?? this.meta,
      statusFilter: clearStatusFilter
          ? null
          : (statusFilter ?? this.statusFilter),
      sourceKindFilter: clearSourceKindFilter
          ? null
          : (sourceKindFilter ?? this.sourceKindFilter),
      searchQuery: clearSearchQuery ? null : (searchQuery ?? this.searchQuery),
      isLoadingMore: isLoadingMore ?? this.isLoadingMore,
      loadMoreError: clearLoadMoreError
          ? null
          : (loadMoreError ?? this.loadMoreError),
    );
  }
}

/// 工作流列表 Notifier（手动 AsyncNotifier，不使用 riverpod_generator）
class WorkflowListNotifier extends AsyncNotifier<WorkflowListState> {
  String? _statusFilter;
  String? _sourceKindFilter;
  String? _searchQuery;

  @override
  Future<WorkflowListState> build() async {
    return _fetchWorkflows();
  }

  Future<WorkflowListState> _fetchWorkflows({int page = 1}) async {
    final api = ref.read(workflowApiProvider);
    final result = await api.listWorkflows(
      page: page,
      status: _statusFilter,
      sourceKind: _sourceKindFilter,
      search: _searchQuery,
    );

    return WorkflowListState(
      workflows: result.data,
      meta: result.meta,
      statusFilter: _statusFilter,
      sourceKindFilter: _sourceKindFilter,
      searchQuery: _searchQuery,
    );
  }

  /// 设置状态过滤器并重新加载
  Future<void> setStatusFilter(String? status) async {
    _statusFilter = status;
    state = const AsyncValue.loading();
    final nextState = await AsyncValue.guard(() => _fetchWorkflows());
    if (!ref.mounted) return;
    state = nextState;
  }

  Future<void> setSourceKindFilter(String? sourceKind) async {
    _sourceKindFilter = sourceKind;
    state = const AsyncValue.loading();
    final nextState = await AsyncValue.guard(() => _fetchWorkflows());
    if (!ref.mounted) return;
    state = nextState;
  }

  /// 设置搜索关键词并重新加载
  Future<void> setSearchQuery(String? query) async {
    _searchQuery = (query != null && query.isEmpty) ? null : query;
    state = const AsyncValue.loading();
    final nextState = await AsyncValue.guard(() => _fetchWorkflows());
    if (!ref.mounted) return;
    state = nextState;
  }

  /// 刷新列表
  Future<void> refresh() async {
    state = const AsyncValue.loading();
    final nextState = await AsyncValue.guard(() => _fetchWorkflows());
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
      final api = ref.read(workflowApiProvider);
      final result = await api.listWorkflows(
        page: meta.page + 1,
        status: _statusFilter,
        sourceKind: _sourceKindFilter,
        search: _searchQuery,
      );
      if (!ref.mounted) return;

      state = AsyncValue.data(
        WorkflowListState(
          workflows: [...currentState.workflows, ...result.data],
          meta: result.meta,
          statusFilter: _statusFilter,
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

/// 工作流列表 Provider
final workflowListProvider =
    AsyncNotifierProvider<WorkflowListNotifier, WorkflowListState>(
      WorkflowListNotifier.new,
    );
