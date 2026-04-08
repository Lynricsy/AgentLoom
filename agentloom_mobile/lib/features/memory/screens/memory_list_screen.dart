import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../routes/route_names.dart';
import '../../../shared/widgets/resource_source_chip.dart';
import '../providers/memory_providers.dart';

/// Memory 实例列表页面
class MemoryListScreen extends ConsumerStatefulWidget {
  const MemoryListScreen({super.key});

  @override
  ConsumerState<MemoryListScreen> createState() => _MemoryListScreenState();
}

class _MemoryListScreenState extends ConsumerState<MemoryListScreen> {
  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final memoryState = ref.watch(memoryListProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('记忆')),
      body: Column(
        children: [
          SizedBox(
            height: 56,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              children: [
                _FilterChip(
                  label: '全部来源',
                  selected: memoryState.value?.sourceKindFilter == null,
                  onSelected: (_) => ref
                      .read(memoryListProvider.notifier)
                      .setSourceKindFilter(null),
                ),
                const SizedBox(width: 8),
                _FilterChip(
                  label: '自己创建',
                  selected: memoryState.value?.sourceKindFilter == 'manual',
                  onSelected: (_) => ref
                      .read(memoryListProvider.notifier)
                      .setSourceKindFilter('manual'),
                ),
                const SizedBox(width: 8),
                _FilterChip(
                  label: '分享导入',
                  selected:
                      memoryState.value?.sourceKindFilter == 'share_imported',
                  onSelected: (_) => ref
                      .read(memoryListProvider.notifier)
                      .setSourceKindFilter('share_imported'),
                ),
              ],
            ),
          ),
          Expanded(
            child: memoryState.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (error, _) => Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      Icons.error_outline,
                      size: 48,
                      color: theme.colorScheme.error,
                    ),
                    const SizedBox(height: 16),
                    Text(
                      '加载记忆实例失败',
                      style: theme.textTheme.titleMedium,
                    ),
                    const SizedBox(height: 8),
                    TextButton(
                      onPressed: () =>
                          ref.read(memoryListProvider.notifier).refresh(),
                      child: const Text('重试'),
                    ),
                  ],
                ),
              ),
              data: (state) {
                if (state.instances.isEmpty) {
                  return Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          Icons.memory_outlined,
                          size: 64,
                          color: theme.colorScheme.onSurfaceVariant.withValues(
                            alpha: 0.5,
                          ),
                        ),
                        const SizedBox(height: 16),
                        Text(
                          '未找到记忆实例',
                          style: theme.textTheme.titleMedium?.copyWith(
                            color: theme.colorScheme.onSurfaceVariant,
                          ),
                        ),
                      ],
                    ),
                  );
                }

                return RefreshIndicator(
                  onRefresh: () =>
                      ref.read(memoryListProvider.notifier).refresh(),
                  child: NotificationListener<ScrollNotification>(
                    onNotification: (scrollInfo) {
                      if (scrollInfo.metrics.pixels >=
                          scrollInfo.metrics.maxScrollExtent - 200) {
                        ref.read(memoryListProvider.notifier).loadMore();
                      }
                      return false;
                    },
                    child: ListView.builder(
                      itemCount:
                          state.instances.length +
                          (state.isLoadingMore ? 1 : 0),
                      itemBuilder: (context, index) {
                        if (index == state.instances.length) {
                          return const Center(
                            child: Padding(
                              padding: EdgeInsets.all(16),
                              child: CircularProgressIndicator(),
                            ),
                          );
                        }

                        final instance = state.instances[index];
                        return _MemoryInstanceCard(
                          name: instance.name,
                          description: instance.description,
                          status: instance.status,
                          sourceKind: instance.sourceKind,
                          nodeCount: instance.nodeCount,
                          onTap: () => context.pushNamed(
                            RouteNames.memoryDetail,
                            pathParameters: {'id': instance.id},
                          ),
                        );
                      },
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _MemoryInstanceCard extends StatelessWidget {
  final String name;
  final String? description;
  final String status;
  final String sourceKind;
  final int nodeCount;
  final VoidCallback onTap;

  const _MemoryInstanceCard({
    required this.name,
    this.description,
    required this.status,
    required this.sourceKind,
    required this.nodeCount,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      child: ListTile(
        leading: Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(
            color: theme.colorScheme.primaryContainer,
            borderRadius: BorderRadius.circular(10),
          ),
          child: Icon(
            Icons.memory,
            color: theme.colorScheme.onPrimaryContainer,
            size: 22,
          ),
        ),
        title: Text(name, style: theme.textTheme.titleSmall),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (description != null && description!.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Text(
                  description!,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
              ),
            const SizedBox(height: 4),
            Row(
              children: [
                _StatusChip(status: status),
                const SizedBox(width: 8),
                ResourceSourceChip(sourceKind: sourceKind, compact: true),
                const SizedBox(width: 8),
                Icon(
                  Icons.account_tree_outlined,
                  size: 14,
                  color: theme.colorScheme.onSurfaceVariant,
                ),
                const SizedBox(width: 2),
                Text(
                  '$nodeCount nodes',
                  style: theme.textTheme.labelSmall?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
              ],
            ),
          ],
        ),
        trailing: const Icon(Icons.chevron_right),
        onTap: onTap,
      ),
    );
  }
}

class _FilterChip extends StatelessWidget {
  final String label;
  final bool selected;
  final ValueChanged<bool> onSelected;

  const _FilterChip({
    required this.label,
    required this.selected,
    required this.onSelected,
  });

  @override
  Widget build(BuildContext context) {
    return FilterChip(
      label: Text(label),
      selected: selected,
      onSelected: onSelected,
      showCheckmark: false,
    );
  }
}

class _StatusChip extends StatelessWidget {
  final String status;

  const _StatusChip({required this.status});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final (Color bg, Color fg) = switch (status) {
      'active' => (
        theme.colorScheme.primaryContainer,
        theme.colorScheme.onPrimaryContainer,
      ),
      'inactive' => (
        theme.colorScheme.secondaryContainer,
        theme.colorScheme.onSecondaryContainer,
      ),
      _ => (
        theme.colorScheme.surfaceContainerHighest,
        theme.colorScheme.onSurfaceVariant,
      ),
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        status[0].toUpperCase() + status.substring(1),
        style: theme.textTheme.labelSmall?.copyWith(color: fg, fontSize: 10),
      ),
    );
  }
}
