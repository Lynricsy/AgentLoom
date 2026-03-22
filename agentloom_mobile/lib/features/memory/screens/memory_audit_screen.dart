import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../routes/route_names.dart';
import '../models/memory_audit_entry.dart';
import '../providers/memory_providers.dart';

/// Memory 审计日志列表页面（只读）
class MemoryAuditScreen extends ConsumerStatefulWidget {
  final String instanceId;

  const MemoryAuditScreen({super.key, required this.instanceId});

  @override
  ConsumerState<MemoryAuditScreen> createState() => _MemoryAuditScreenState();
}

class _MemoryAuditScreenState extends ConsumerState<MemoryAuditScreen> {
  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final auditState = ref.watch(memoryAuditProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Audit Log')),
      body: auditState.when(
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
                'Failed to load audit log',
                style: theme.textTheme.titleMedium,
              ),
              const SizedBox(height: 8),
              TextButton(
                onPressed: () =>
                    ref.read(memoryAuditProvider.notifier).refresh(),
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
        data: (state) {
          if (state.entries.isEmpty) {
            return Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    Icons.history,
                    size: 64,
                    color: theme.colorScheme.onSurfaceVariant.withValues(
                      alpha: 0.5,
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'No audit entries found',
                    style: theme.textTheme.titleMedium?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                ],
              ),
            );
          }

          return RefreshIndicator(
            onRefresh: () => ref.read(memoryAuditProvider.notifier).refresh(),
            child: NotificationListener<ScrollNotification>(
              onNotification: (scrollInfo) {
                if (scrollInfo.metrics.pixels >=
                    scrollInfo.metrics.maxScrollExtent - 200) {
                  ref.read(memoryAuditProvider.notifier).loadMore();
                }
                return false;
              },
              child: ListView.builder(
                itemCount: state.entries.length + (state.isLoadingMore ? 1 : 0),
                itemBuilder: (context, index) {
                  if (index == state.entries.length) {
                    return const Center(
                      child: Padding(
                        padding: EdgeInsets.all(16),
                        child: CircularProgressIndicator(),
                      ),
                    );
                  }

                  final entry = state.entries[index];
                  return _AuditEntryTile(
                    entry: entry,
                    onTap:
                        entry.targetVersionId != null &&
                            entry.targetNodeId != null
                        ? () => context.pushNamed(
                            RouteNames.memoryAuditDetail,
                            pathParameters: {
                              'id': widget.instanceId,
                              'entryId': entry.id,
                            },
                            extra: entry,
                          )
                        : null,
                  );
                },
              ),
            ),
          );
        },
      ),
    );
  }
}

/// 审计条目列表项
class _AuditEntryTile extends StatelessWidget {
  final MemoryAuditEntryDto entry;
  final VoidCallback? onTap;

  const _AuditEntryTile({required this.entry, this.onTap});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final (IconData icon, Color? iconColor) = _actionIcon(entry.action, theme);

    return ListTile(
      leading: Container(
        width: 40,
        height: 40,
        decoration: BoxDecoration(
          color: (iconColor ?? theme.colorScheme.primary).withValues(
            alpha: 0.12,
          ),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Icon(
          icon,
          color: iconColor ?? theme.colorScheme.primary,
          size: 22,
        ),
      ),
      title: Text(
        _actionLabel(entry.action),
        style: theme.textTheme.titleSmall,
      ),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (_targetInfo(entry) != null)
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Text(
                _targetInfo(entry)!,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
            ),
          const SizedBox(height: 2),
          Text(
            _formatRelativeTime(entry.createdAt),
            style: theme.textTheme.labelSmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
        ],
      ),
      trailing: onTap != null ? const Icon(Icons.chevron_right) : null,
      onTap: onTap,
    );
  }

  /// 操作类型 → 图标 + 颜色
  static (IconData, Color?) _actionIcon(String action, ThemeData theme) {
    return switch (action) {
      'create_node' => (Icons.add_circle_outline, null),
      'update_version' => (Icons.edit_outlined, null),
      'delete_path' => (Icons.delete_outline, theme.colorScheme.error),
      'review_approved' => (Icons.check_circle_outline, Colors.green),
      'review_rejected' => (Icons.cancel_outlined, theme.colorScheme.error),
      'rollback' => (Icons.undo, Colors.orange),
      _ => (Icons.info_outline, null),
    };
  }

  /// 操作类型 → 可读标签
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

  /// 提取 target 描述信息
  static String? _targetInfo(MemoryAuditEntryDto entry) {
    final nodeName = entry.metadata?['nodeName'] as String?;
    final versionNumber = entry.metadata?['versionNumber'];
    final parts = <String>[];
    if (nodeName != null) parts.add(nodeName);
    if (versionNumber != null) parts.add('v$versionNumber');
    if (parts.isEmpty && entry.targetNodeId != null) {
      parts.add('Node ${entry.targetNodeId!.substring(0, 8)}...');
    }
    return parts.isEmpty ? null : parts.join(' · ');
  }

  /// 相对时间格式化
  static String _formatRelativeTime(DateTime dateTime) {
    final now = DateTime.now();
    final diff = now.difference(dateTime);

    if (diff.inSeconds < 60) return 'Just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    if (diff.inDays < 7) return '${diff.inDays}d ago';
    if (diff.inDays < 30) return '${(diff.inDays / 7).floor()}w ago';
    return '${dateTime.year}-${dateTime.month.toString().padLeft(2, '0')}-${dateTime.day.toString().padLeft(2, '0')}';
  }
}
