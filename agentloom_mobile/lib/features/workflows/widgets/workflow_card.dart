import 'package:flutter/material.dart';

import '../models/workflow_definition_dto.dart';
import 'workflow_status_chip.dart';

/// 工作流卡片（列表页用）
class WorkflowCard extends StatelessWidget {
  final WorkflowDefinitionDto workflow;
  final VoidCallback? onTap;

  const WorkflowCard({super.key, required this.workflow, this.onTap});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final releaseLabel = _buildReleaseLabel();

    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      workflow.name,
                      style: theme.textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  const SizedBox(width: 8),
                  WorkflowStatusChip(status: workflow.status),
                ],
              ),
              if (workflow.description != null &&
                  workflow.description!.isNotEmpty) ...[
                const SizedBox(height: 8),
                Text(
                  workflow.description!,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
              const SizedBox(height: 12),
              Row(
                children: [
                  Icon(
                    Icons.access_time,
                    size: 14,
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                  const SizedBox(width: 4),
                  Text(
                    _formatDate(workflow.updatedAt),
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                  const Spacer(),
                  Text(
                    releaseLabel,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _formatDate(String isoDate) {
    try {
      final date = DateTime.parse(isoDate);
      final now = DateTime.now();
      final diff = now.difference(date);

      if (diff.inDays == 0) return 'Today';
      if (diff.inDays == 1) return 'Yesterday';
      if (diff.inDays < 7) return '${diff.inDays}d ago';
      return '${date.month}/${date.day}/${date.year}';
    } catch (_) {
      return isoDate;
    }
  }

  String _buildReleaseLabel() {
    final releaseNumber = workflow.publishedReleaseNumber;
    if (workflow.status == 'published') {
      return 'v${releaseNumber ?? 1}';
    }

    return '未发布';
  }
}
