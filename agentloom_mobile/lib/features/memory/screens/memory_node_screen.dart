import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers/memory_providers.dart';

/// Memory 节点内容 + 版本历史页面
class MemoryNodeScreen extends ConsumerWidget {
  final String instanceId;
  final String nodeId;

  const MemoryNodeScreen({
    super.key,
    required this.instanceId,
    required this.nodeId,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final params = MemoryNodeParams(instanceId: instanceId, nodeId: nodeId);
    final nodeAsync = ref.watch(memoryNodeProvider(params));
    final versionsAsync = ref.watch(memoryVersionsProvider(params));

    return Scaffold(
      appBar: AppBar(title: const Text('记忆节点')),
      body: (nodeAsync.hasError && !nodeAsync.hasValue)
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
                    '加载节点失败',
                    style: theme.textTheme.titleMedium,
                  ),
                  const SizedBox(height: 8),
                  TextButton(
                    onPressed: () => ref.invalidate(memoryNodeProvider(params)),
                    child: const Text('重试'),
                  ),
                ],
              ),
            )
          : nodeAsync.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (_, __) => const SizedBox.shrink(),
              data: (node) => CustomScrollView(
                slivers: [
                  // 节点元数据
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
                                Icon(
                                  Icons.article_outlined,
                                  size: 24,
                                  color: theme.colorScheme.primary,
                                ),
                                const SizedBox(width: 8),
                                Text(
                                  'Node Info',
                                  style: theme.textTheme.titleMedium?.copyWith(
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 12),
                            _InfoRow(
                              label: '类型',
                              value: node.contentType,
                            ),
                            const SizedBox(height: 4),
                            _InfoRow(
                              label: '可见性',
                              value: '${node.disclosureLevel}',
                            ),
                            const SizedBox(height: 4),
                            _InfoRow(
                              label: '创建时间',
                              value: _formatDate(node.createdAt),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),

                  // 最新版本内容
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: versionsAsync.when(
                        loading: () => const Center(
                          child: Padding(
                            padding: EdgeInsets.all(16),
                            child: CircularProgressIndicator(),
                          ),
                        ),
                        error: (_, __) => const SizedBox.shrink(),
                        data: (versions) {
                          if (versions.isEmpty) {
                            return const SizedBox.shrink();
                          }
                          final latest = versions.first;
                          return Container(
                            width: double.infinity,
                            padding: const EdgeInsets.all(16),
                            decoration: BoxDecoration(
                              color: theme.colorScheme.surfaceContainerLow,
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(
                                color: theme.colorScheme.outlineVariant,
                              ),
                            ),
                            child: SelectableText(
                              latest.content,
                              style: theme.textTheme.bodyMedium?.copyWith(
                                height: 1.6,
                              ),
                            ),
                          );
                        },
                      ),
                    ),
                  ),

                  // 版本历史标题
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(16, 24, 16, 8),
                      child: Text(
                        'Version History',
                        style: theme.textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ),

                  // 版本列表
                  versionsAsync.when(
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
                          '加载版本失败',
                          style: theme.textTheme.bodyMedium?.copyWith(
                            color: theme.colorScheme.error,
                          ),
                        ),
                      ),
                    ),
                    data: (versions) {
                      if (versions.isEmpty) {
                        return SliverToBoxAdapter(
                          child: Padding(
                            padding: const EdgeInsets.all(24),
                            child: Center(
                              child: Text(
                                '暂无版本历史',
                                style: theme.textTheme.bodyMedium?.copyWith(
                                  color: theme.colorScheme.onSurfaceVariant,
                                ),
                              ),
                            ),
                          ),
                        );
                      }

                      return SliverList(
                        delegate: SliverChildBuilderDelegate((context, index) {
                          final version = versions[index];
                          return _VersionTile(
                            versionNumber: version.versionNumber,
                            changeType: version.changeType,
                            deprecated: version.deprecated,
                            createdAt: version.createdAt,
                            content: version.content,
                          );
                        }, childCount: versions.length),
                      );
                    },
                  ),

                  // 底部间距
                  const SliverPadding(padding: EdgeInsets.only(bottom: 32)),
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

class _InfoRow extends StatelessWidget {
  final String label;
  final String value;

  const _InfoRow({required this.label, required this.value});

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

class _VersionTile extends StatefulWidget {
  final int versionNumber;
  final String? changeType;
  final bool deprecated;
  final String createdAt;
  final String content;

  const _VersionTile({
    required this.versionNumber,
    this.changeType,
    required this.deprecated,
    required this.createdAt,
    required this.content,
  });

  @override
  State<_VersionTile> createState() => _VersionTileState();
}

class _VersionTileState extends State<_VersionTile> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => setState(() => _expanded = !_expanded),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 2,
                    ),
                    decoration: BoxDecoration(
                      color: theme.colorScheme.primaryContainer,
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(
                      'v${widget.versionNumber}',
                      style: theme.textTheme.labelSmall?.copyWith(
                        color: theme.colorScheme.onPrimaryContainer,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  if (widget.changeType != null)
                    Text(
                      widget.changeType!,
                      style: theme.textTheme.labelSmall?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                  if (widget.deprecated) ...[
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 6,
                        vertical: 1,
                      ),
                      decoration: BoxDecoration(
                        color: theme.colorScheme.errorContainer,
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        'deprecated',
                        style: theme.textTheme.labelSmall?.copyWith(
                          color: theme.colorScheme.onErrorContainer,
                          fontSize: 10,
                        ),
                      ),
                    ),
                  ],
                  const Spacer(),
                  Text(
                    _formatDate(widget.createdAt),
                    style: theme.textTheme.labelSmall?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                  Icon(
                    _expanded ? Icons.expand_less : Icons.expand_more,
                    size: 20,
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ],
              ),
              if (_expanded) ...[
                const SizedBox(height: 8),
                const Divider(height: 1),
                const SizedBox(height: 8),
                SelectableText(
                  widget.content,
                  style: theme.textTheme.bodySmall?.copyWith(height: 1.5),
                ),
              ],
            ],
          ),
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
