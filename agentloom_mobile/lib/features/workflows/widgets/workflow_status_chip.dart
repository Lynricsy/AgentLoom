import 'package:flutter/material.dart';

/// 工作流状态标签
class WorkflowStatusChip extends StatelessWidget {
  final String status;

  const WorkflowStatusChip({super.key, required this.status});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final (color, label) = _statusConfig(status);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        label,
        style: theme.textTheme.labelSmall?.copyWith(
          color: color,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }

  (Color, String) _statusConfig(String status) {
    return switch (status) {
      'published' => (Colors.green, 'Published'),
      'archived' => (Colors.grey, 'Archived'),
      _ => (Colors.orange, 'Draft'),
    };
  }
}
