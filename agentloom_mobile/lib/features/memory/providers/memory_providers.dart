import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/memory_api.dart';
import '../models/memory_audit_entry.dart';
import '../models/memory_instance.dart';
import '../models/memory_node.dart';
import '../models/memory_version.dart';

/// Memory 实例列表 Notifier
class MemoryListNotifier extends AsyncNotifier<MemoryListState> {
  @override
  Future<MemoryListState> build() async {
    return _fetchInstances();
  }

  Future<MemoryListState> _fetchInstances({int page = 1}) async {
    final api = ref.read(memoryApiProvider);
    final instances = await api.getMemoryInstances(page: page);
    return MemoryListState(
      instances: instances,
      currentPage: page,
      // 简化分页：如果返回数量 < pageSize，说明没有更多
      hasMore: instances.length >= 20,
    );
  }

  /// 刷新列表
  Future<void> refresh() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() => _fetchInstances());
  }

  /// 加载更多
  Future<void> loadMore() async {
    final currentState = state.value;
    if (currentState == null || currentState.isLoadingMore) return;
    if (!currentState.hasMore) return;

    state = AsyncValue.data(currentState.copyWith(isLoadingMore: true));

    try {
      final api = ref.read(memoryApiProvider);
      final nextPage = currentState.currentPage + 1;
      final moreInstances = await api.getMemoryInstances(page: nextPage);

      if (!ref.mounted) return;

      state = AsyncValue.data(
        MemoryListState(
          instances: [...currentState.instances, ...moreInstances],
          currentPage: nextPage,
          hasMore: moreInstances.length >= 20,
        ),
      );
    } catch (e, st) {
      if (!ref.mounted) return;
      state = AsyncValue.data(currentState.copyWith(isLoadingMore: false));
      state = AsyncValue.error(e, st);
    }
  }
}

/// Memory 实例列表 Provider
final memoryListProvider =
    AsyncNotifierProvider<MemoryListNotifier, MemoryListState>(
      MemoryListNotifier.new,
    );

/// Memory 实例详情 Provider（按 ID）
final memoryInstanceProvider = FutureProvider.family<MemoryInstanceDto, String>(
  (ref, id) async {
    final api = ref.read(memoryApiProvider);
    return api.getMemoryInstance(id);
  },
);

/// Memory 节点列表 Provider（按实例 ID）
final memoryNodesProvider = FutureProvider.family<List<MemoryNodeDto>, String>((
  ref,
  instanceId,
) async {
  final api = ref.read(memoryApiProvider);
  return api.getMemoryNodes(instanceId);
});

/// Memory 节点详情参数
class MemoryNodeParams {
  final String instanceId;
  final String nodeId;

  const MemoryNodeParams({required this.instanceId, required this.nodeId});

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is MemoryNodeParams &&
          instanceId == other.instanceId &&
          nodeId == other.nodeId;

  @override
  int get hashCode => Object.hash(instanceId, nodeId);
}

/// Memory 节点详情 Provider
final memoryNodeProvider =
    FutureProvider.family<MemoryNodeDto, MemoryNodeParams>((ref, params) async {
      final api = ref.read(memoryApiProvider);
      return api.getMemoryNode(params.instanceId, params.nodeId);
    });

/// Memory 版本历史 Provider
final memoryVersionsProvider =
    FutureProvider.family<List<MemoryVersionDto>, MemoryNodeParams>((
      ref,
      params,
    ) async {
      final api = ref.read(memoryApiProvider);
      return api.getMemoryVersions(params.instanceId, params.nodeId);
    });

/// Memory 审计日志分页状态
class MemoryAuditState {
  final List<MemoryAuditEntryDto> entries;
  final int currentPage;
  final bool hasMore;
  final bool isLoadingMore;
  final int total;

  const MemoryAuditState({
    this.entries = const [],
    this.currentPage = 1,
    this.hasMore = true,
    this.isLoadingMore = false,
    this.total = 0,
  });

  MemoryAuditState copyWith({
    List<MemoryAuditEntryDto>? entries,
    int? currentPage,
    bool? hasMore,
    bool? isLoadingMore,
    int? total,
  }) {
    return MemoryAuditState(
      entries: entries ?? this.entries,
      currentPage: currentPage ?? this.currentPage,
      hasMore: hasMore ?? this.hasMore,
      isLoadingMore: isLoadingMore ?? this.isLoadingMore,
      total: total ?? this.total,
    );
  }
}

/// Memory 审计日志 Notifier（按实例 ID）
///
/// 使用 AsyncNotifier + instanceId 通过 [memoryAuditInstanceIdProvider] 传入，
/// 因为 Riverpod 3.x 手写模式不支持 FamilyAsyncNotifier。
class MemoryAuditNotifier extends AsyncNotifier<MemoryAuditState> {
  @override
  Future<MemoryAuditState> build() async {
    final instanceId = ref.watch(memoryAuditInstanceIdProvider);
    return _fetchAuditLog(instanceId);
  }

  Future<MemoryAuditState> _fetchAuditLog(
    String instanceId, {
    int page = 1,
  }) async {
    final api = ref.read(memoryApiProvider);
    final result = await api.getAuditLog(instanceId, page: page);
    return MemoryAuditState(
      entries: result.data,
      currentPage: page,
      hasMore: result.data.length >= 20,
      total: result.total,
    );
  }

  /// 刷新审计日志
  Future<void> refresh() async {
    final instanceId = ref.read(memoryAuditInstanceIdProvider);
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() => _fetchAuditLog(instanceId));
  }

  /// 加载更多
  Future<void> loadMore() async {
    final currentState = state.value;
    if (currentState == null || currentState.isLoadingMore) return;
    if (!currentState.hasMore) return;

    state = AsyncValue.data(currentState.copyWith(isLoadingMore: true));

    try {
      final instanceId = ref.read(memoryAuditInstanceIdProvider);
      final api = ref.read(memoryApiProvider);
      final nextPage = currentState.currentPage + 1;
      final result = await api.getAuditLog(instanceId, page: nextPage);

      if (!ref.mounted) return;

      state = AsyncValue.data(
        MemoryAuditState(
          entries: [...currentState.entries, ...result.data],
          currentPage: nextPage,
          hasMore: result.data.length >= 20,
          total: result.total,
        ),
      );
    } catch (e, st) {
      if (!ref.mounted) return;
      state = AsyncValue.data(currentState.copyWith(isLoadingMore: false));
      state = AsyncValue.error(e, st);
    }
  }
}

/// 审计日志关联的实例 ID（由 ProviderScope.overrides 注入）
final memoryAuditInstanceIdProvider = Provider<String>(
  (_) => throw UnimplementedError(
    'memoryAuditInstanceIdProvider must be overridden',
  ),
);

/// Memory 审计日志 Provider
final memoryAuditProvider =
    AsyncNotifierProvider<MemoryAuditNotifier, MemoryAuditState>(
      MemoryAuditNotifier.new,
    );

/// 审计条目版本详情参数
class MemoryVersionDetailParams {
  final String instanceId;
  final String nodeId;
  final String versionId;

  const MemoryVersionDetailParams({
    required this.instanceId,
    required this.nodeId,
    required this.versionId,
  });

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is MemoryVersionDetailParams &&
          instanceId == other.instanceId &&
          nodeId == other.nodeId &&
          versionId == other.versionId;

  @override
  int get hashCode => Object.hash(instanceId, nodeId, versionId);
}

/// 版本详情 Provider（审计日志 → 版本内容）
final memoryVersionDetailProvider =
    FutureProvider.family<MemoryVersionDto, MemoryVersionDetailParams>((
      ref,
      params,
    ) async {
      final api = ref.read(memoryApiProvider);
      return api.getVersionDetail(
        params.instanceId,
        params.nodeId,
        params.versionId,
      );
    });
