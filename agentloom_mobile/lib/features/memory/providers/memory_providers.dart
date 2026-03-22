import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/memory_api.dart';
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
