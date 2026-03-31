import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../routes/route_names.dart';
import '../providers/memory_providers.dart';

/// Memory 实例详情页面
class MemoryDetailScreen extends ConsumerWidget {
  final String instanceId;

  const MemoryDetailScreen({super.key, required this.instanceId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final instanceAsync = ref.watch(memoryInstanceProvider(instanceId));
    final nodesAsync = ref.watch(memoryNodesProvider(instanceId));

    return Scaffold(
      appBar: AppBar(
        title:
            instanceAsync.whenOrNull(data: (inst) => Text(inst.name)) ??
            const Text('Memory'),
      ),
      body: (instanceAsync.hasError && !instanceAsync.hasValue)
          ? Center(
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
                    'Failed to load memory instance',
                    style: theme.textTheme.titleMedium,
                  ),
                  const SizedBox(height: 8),
                  TextButton(
                    onPressed: () =>
                        ref.invalidate(memoryInstanceProvider(instanceId)),
                    child: const Text('Retry'),
                  ),
                ],
              ),
            )
          : instanceAsync.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (_, __) => const SizedBox.shrink(),
              data: (instance) => CustomScrollView(
                slivers: [
                  // 实例信息卡片
                  SliverToBoxAdapter(
                    child: Card(
                      margin: const EdgeInsets.all(16),
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Container(
                                  width: 48,
                                  height: 48,
                                  decoration: BoxDecoration(
                                    color: theme.colorScheme.primaryContainer,
                                    borderRadius: BorderRadius.circular(12),
                                  ),
                                  child: Icon(
                                    Icons.memory,
                                    color: theme.colorScheme.onPrimaryContainer,
                                    size: 28,
                                  ),
                                ),
                                const SizedBox(width: 16),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        instance.name,
                                        style: theme.textTheme.headlineSmall
                                            ?.copyWith(
                                              fontWeight: FontWeight.w600,
                                            ),
                                      ),
                                      const SizedBox(height: 4),
                                      _StatusBadge(status: instance.status),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                            if (instance.description != null &&
                                instance.description!.isNotEmpty) ...[
                              const SizedBox(height: 12),
                              Text(
                                instance.description!,
                                style: theme.textTheme.bodyMedium?.copyWith(
                                  color: theme.colorScheme.onSurfaceVariant,
                                ),
                              ),
                            ],
                            const SizedBox(height: 16),
                            _MetadataRow(
                              label: 'Nodes',
                              value: '${instance.nodeCount}',
                            ),
                            const SizedBox(height: 4),
                            _MetadataRow(
                              label: 'Edges',
                              value: '${instance.edgeCount}',
                            ),
                            const SizedBox(height: 4),
                            if (instance.config != null &&
                                instance.config!.isNotEmpty) ...[
                              _MetadataRow(
                                label: 'Config',
                                value:
                                    instance.config!.keys.take(3).join(', ') +
                                    (instance.config!.length > 3 ? '...' : ''),
                              ),
                              const SizedBox(height: 4),
                            ],
                            _MetadataRow(
                              label: 'Updated',
                              value: _formatDate(instance.updatedAt),
                            ),
                            const SizedBox(height: 4),
                            _MetadataRow(
                              label: 'Created',
                              value: _formatDate(instance.createdAt),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),

                  // 节点列表标题
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 8,
                      ),
                      child: Text(
                        'Nodes',
                        style: theme.textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ),

                  // 节点列表
                  nodesAsync.when(
                    loading: () => const SliverToBoxAdapter(
                      child: Center(
                        child: Padding(
                          padding: EdgeInsets.all(24),
                          child: CircularProgressIndicator(),
                        ),
                      ),
                    ),
                    error: (_, __) => SliverToBoxAdapter(
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Text(
                          'Failed to load nodes',
                          style: theme.textTheme.bodyMedium?.copyWith(
                            color: theme.colorScheme.error,
                          ),
                        ),
                      ),
                    ),
                    data: (nodes) {
                      if (nodes.isEmpty) {
                        return SliverToBoxAdapter(
                          child: Padding(
                            padding: const EdgeInsets.all(24),
                            child: Center(
                              child: Column(
                                children: [
                                  Icon(
                                    Icons.account_tree_outlined,
                                    size: 48,
                                    color: theme.colorScheme.onSurfaceVariant
                                        .withValues(alpha: 0.5),
                                  ),
                                  const SizedBox(height: 8),
                                  Text(
                                    'No nodes yet',
                                    style: theme.textTheme.bodyMedium?.copyWith(
                                      color: theme.colorScheme.onSurfaceVariant,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        );
                      }

                      return SliverList(
                        delegate: SliverChildBuilderDelegate((context, index) {
                          final node = nodes[index];
                          return ListTile(
                            leading: const Icon(Icons.article_outlined),
                            title: Text(
                              node.contentType,
                              style: theme.textTheme.titleSmall,
                            ),
                            subtitle: Text(
                              'Disclosure: ${node.disclosureLevel}',
                              style: theme.textTheme.labelSmall?.copyWith(
                                color: theme.colorScheme.onSurfaceVariant,
                              ),
                            ),
                            trailing: const Icon(Icons.chevron_right),
                            onTap: () => context.pushNamed(
                              RouteNames.memoryNode,
                              pathParameters: {
                                'id': instanceId,
                                'nodeId': node.id,
                              },
                            ),
                          );
                        }, childCount: nodes.length),
                      );
                    },
                  ),
                ],
              ),
            ),
    );
  }

  String _formatDate(String isoDate) {
    try {
      final date = DateTime.parse(isoDate);
      return '${date.year}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';
    } catch (_) {
      return isoDate;
    }
  }
}

class _StatusBadge extends StatelessWidget {
  final String status;

  const _StatusBadge({required this.status});

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
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        status[0].toUpperCase() + status.substring(1),
        style: theme.textTheme.labelSmall?.copyWith(color: fg),
      ),
    );
  }
}

class _MetadataRow extends StatelessWidget {
  final String label;
  final String value;

  const _MetadataRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      children: [
        SizedBox(
          width: 80,
          child: Text(
            label,
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
        ),
        Expanded(child: Text(value, style: theme.textTheme.bodyMedium)),
      ],
    );
  }
}
