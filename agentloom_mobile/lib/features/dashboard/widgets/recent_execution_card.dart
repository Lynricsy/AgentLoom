import 'package:flutter/material.dart';

import '../../workflows/models/execution_summary_dto.dart';

/// 最近执行卡片（Dashboard 用）
class RecentExecutionCard extends StatelessWidget {
  final ExecutionSummaryDto execution;
  final String? workflowName;
  final VoidCallback? onTap;

  const RecentExecutionCard({
    super.key,
    required this.execution,
    this.workflowName,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final (icon, color) = _statusIcon(execution.status);

    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      child: ListTile(
        onTap: onTap,
        leading: CircleAvatar(
          backgroundColor: color.withValues(alpha: 0.12),
          child: Icon(icon, color: color, size: 20),
        ),
        title: Text(
          workflowName ??
              execution.workflowName ??
              'Run #${execution.id.substring(0, 8)}',
          style: theme.textTheme.bodyMedium?.copyWith(
            fontWeight: FontWeight.w500,
          ),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        subtitle: Text(
          _formatTimestamp(execution.createdAt),
          style: theme.textTheme.bodySmall?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
          ),
        ),
        trailing: _StatusBadge(status: execution.status, color: color),
      ),
    );
  }

  (IconData, Color) _statusIcon(String status) {
    return switch (status) {
      'completed' => (Icons.check_circle, Colors.green),
      'failed' => (Icons.error, Colors.red),
      'running' => (Icons.play_circle, Colors.blue),
      'pending' => (Icons.schedule, Colors.orange),
      'cancelled' => (Icons.cancel, Colors.grey),
      _ => (Icons.help, Colors.grey),
    };
  }

  String _formatTimestamp(String isoDate) {
    try {
      final date = DateTime.parse(isoDate);
      final now = DateTime.now();
      final diff = now.difference(date);

      if (diff.inMinutes < 1) return '刚刚';
      if (diff.inMinutes < 60) return '${diff.inMinutes}分钟前';
      if (diff.inHours < 24) return '${diff.inHours}小时前';
      if (diff.inDays < 7) return '${diff.inDays}天前';
      return '${date.month}/${date.day}/${date.year}';
    } catch (_) {
      return isoDate;
    }
  }
}

class _StatusBadge extends StatelessWidget {
  final String status;
  final Color color;

  const _StatusBadge({required this.status, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        _capitalize(status),
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
          color: color,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }

  String _capitalize(String s) =>
      s.isEmpty ? s : '${s[0].toUpperCase()}${s.substring(1)}';
}
