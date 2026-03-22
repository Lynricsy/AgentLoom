import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/memory_audit_entry.dart';
import '../providers/memory_providers.dart';

/// 审计条目详情页面 — 展示对应版本的内容
class MemoryAuditDetailScreen extends ConsumerWidget {
  final String instanceId;
  final String entryId;
  final MemoryAuditEntryDto? entry;

  const MemoryAuditDetailScreen({
    super.key,
    required this.instanceId,
    required this.entryId,
    this.entry,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);

    // 如果没有传入 entry 或缺少 nodeId/versionId，显示仅审计信息
    if (entry == null ||
        entry!.targetNodeId == null ||
        entry!.targetVersionId == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Audit Detail')),
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                Icons.info_outline,
                size: 48,
                color: theme.colorScheme.onSurfaceVariant.withValues(
                  alpha: 0.5,
                ),
              ),
              const SizedBox(height: 16),
              Text(
                'No version content available',
                style: theme.textTheme.titleMedium?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
              if (entry != null) ...[
                const SizedBox(height: 24),
                _AuditInfoCard(entry: entry!, theme: theme),
              ],
            ],
          ),
        ),
      );
    }

    final versionParams = MemoryVersionDetailParams(
      instanceId: instanceId,
      nodeId: entry!.targetNodeId!,
      versionId: entry!.targetVersionId!,
    );
    final versionAsync = ref.watch(memoryVersionDetailProvider(versionParams));

    return Scaffold(
      appBar: AppBar(title: const Text('Audit Detail')),
      body: (versionAsync.hasError && !versionAsync.hasValue)
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
                    'Failed to load version detail',
                    style: theme.textTheme.titleMedium,
                  ),
                  const SizedBox(height: 8),
                  TextButton(
                    onPressed: () => ref.invalidate(
                      memoryVersionDetailProvider(versionParams),
                    ),
                    child: const Text('Retry'),
                  ),
                ],
              ),
            )
          : versionAsync.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (_, __) => const SizedBox.shrink(),
              data: (version) => SingleChildScrollView(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // 审计信息卡片
                    _AuditInfoCard(entry: entry!, theme: theme),

                    const SizedBox(height: 16),

                    // 版本内容卡片
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Icon(
                                  Icons.article_outlined,
                                  size: 20,
                                  color: theme.colorScheme.primary,
                                ),
                                const SizedBox(width: 8),
                                Text(
                                  'Version Content',
                                  style: theme.textTheme.titleMedium?.copyWith(
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 4),
                            _MetadataRow(
                              label: 'Version',
                              value: 'v${version.versionNumber}',
                              theme: theme,
                            ),
                            if (version.deprecated) ...[
                              const SizedBox(height: 4),
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 8,
                                  vertical: 2,
                                ),
                                decoration: BoxDecoration(
                                  color: theme.colorScheme.errorContainer,
                                  borderRadius: BorderRadius.circular(6),
                                ),
                                child: Text(
                                  'Deprecated',
                                  style: theme.textTheme.labelSmall?.copyWith(
                                    color: theme.colorScheme.onErrorContainer,
                                  ),
                                ),
                              ),
                            ],
                            const Divider(height: 24),
                            SelectableText(
                              version.content,
                              style: theme.textTheme.bodyMedium?.copyWith(
                                height: 1.6,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
    );
  }
}

/// 审计信息卡片
class _AuditInfoCard extends StatelessWidget {
  final MemoryAuditEntryDto entry;
  final ThemeData theme;

  const _AuditInfoCard({required this.entry, required this.theme});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.history, size: 20, color: theme.colorScheme.primary),
                const SizedBox(width: 8),
                Text(
                  'Audit Entry',
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            _MetadataRow(
              label: 'Action',
              value: _actionLabel(entry.action),
              theme: theme,
            ),
            const SizedBox(height: 4),
            _MetadataRow(
              label: 'User',
              value: entry.userId.length > 12
                  ? '${entry.userId.substring(0, 12)}...'
                  : entry.userId,
              theme: theme,
            ),
            const SizedBox(height: 4),
            _MetadataRow(
              label: 'Time',
              value: _formatDateTime(entry.createdAt),
              theme: theme,
            ),
            if (entry.targetNodeId != null) ...[
              const SizedBox(height: 4),
              _MetadataRow(
                label: 'Node',
                value:
                    entry.metadata?['nodeName'] as String? ??
                    entry.targetNodeId!.substring(0, 8),
                theme: theme,
              ),
            ],
          ],
        ),
      ),
    );
  }

  static String _actionLabel(String action) {
    return switch (action) {
      'create_node' => 'Node Created',
      'update_version' => 'Version Updated',
      'delete_path' => 'Path Deleted',
      'review_approved' => 'Review Approved',
      'review_rejected' => 'Review Rejected',
      'rollback' => 'Rollback',
      _ =>
        action
            .replaceAll('_', ' ')
            .split(' ')
            .map((w) => w.isEmpty ? w : w[0].toUpperCase() + w.substring(1))
            .join(' '),
    };
  }

  static String _formatDateTime(DateTime dateTime) {
    return '${dateTime.year}-'
        '${dateTime.month.toString().padLeft(2, '0')}-'
        '${dateTime.day.toString().padLeft(2, '0')} '
        '${dateTime.hour.toString().padLeft(2, '0')}:'
        '${dateTime.minute.toString().padLeft(2, '0')}';
  }
}

/// 元数据行
class _MetadataRow extends StatelessWidget {
  final String label;
  final String value;
  final ThemeData theme;

  const _MetadataRow({
    required this.label,
    required this.value,
    required this.theme,
  });

  @override
  Widget build(BuildContext context) {
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
