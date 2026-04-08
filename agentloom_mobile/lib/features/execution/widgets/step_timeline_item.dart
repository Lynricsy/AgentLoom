import 'package:flutter/material.dart';

import '../models/execution_state.dart';
import '../models/execution_status.dart';

/// 步骤时间线单项
///
/// 展示单个执行步骤的状态图标、节点 ID、持续时间和错误信息。
class StepTimelineItem extends StatelessWidget {
  const StepTimelineItem({super.key, required this.step, required this.isLast});

  final StepSnapshot step;
  final bool isLast;

  StepStatus get _stepStatus => StepStatus.fromJson(step.status);

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final status = _stepStatus;
    final nodeName = step.nodeName ?? step.nodeId;

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // 左侧状态图标
        Icon(
          status == StepStatus.running ? Icons.sync : status.icon,
          color: status == StepStatus.running ? Colors.blue : status.color,
          size: 24,
        ),
        const SizedBox(width: 12),
        // 右侧内容区
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // 节点 ID + 状态标签
              Row(
                children: [
                  Expanded(
                    child: Text(
                      nodeName,
                      style: theme.textTheme.bodyMedium?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  const SizedBox(width: 8),
                  _StatusChip(status: status),
                ],
              ),
              if (step.nodeType != null || step.nodeName != null) ...[
                const SizedBox(height: 4),
                Wrap(
                  spacing: 8,
                  runSpacing: 4,
                  children: [
                    if (step.nodeType != null)
                      _NodeMetaChip(label: step.nodeType!),
                    if (step.nodeName != null && step.nodeName != step.nodeId)
                      Text(
                        step.nodeId,
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                      ),
                  ],
                ),
              ],
              // 时间信息
              if (step.startedAt != null) ...[
                const SizedBox(height: 4),
                Text(
                  _buildTimeText(),
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
              ],
              // 错误信息
              if (status == StepStatus.failed && step.errorMessage != null) ...[
                const SizedBox(height: 4),
                _ErrorDetail(errorMessage: step.errorMessage!),
              ],
            ],
          ),
        ),
      ],
    );
  }

  /// 构建时间展示文本
  String _buildTimeText() {
    final startedAtStr = step.startedAt;
    if (startedAtStr == null) return '';

    final startedAt = DateTime.tryParse(startedAtStr);
    if (startedAt == null) return startedAtStr;

    final completedAtStr = step.completedAt;
    if (completedAtStr != null) {
      final completedAt = DateTime.tryParse(completedAtStr);
      if (completedAt != null) {
        final duration = completedAt.difference(startedAt);
        if (duration.inSeconds < 1) {
          return '${duration.inMilliseconds}ms';
        } else if (duration.inMinutes < 1) {
          return '${duration.inSeconds}s';
        } else {
          return '${duration.inMinutes}m ${duration.inSeconds % 60}s';
        }
      }
    }

    // 运行中，显示开始时间
    final hour = startedAt.hour.toString().padLeft(2, '0');
    final minute = startedAt.minute.toString().padLeft(2, '0');
    final second = startedAt.second.toString().padLeft(2, '0');
    return '开始于 $hour:$minute:$second';
  }
}

class _NodeMetaChip extends StatelessWidget {
  const _NodeMetaChip({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        label,
        style: theme.textTheme.labelSmall?.copyWith(
          color: theme.colorScheme.onSurfaceVariant,
          fontWeight: FontWeight.w500,
        ),
      ),
    );
  }
}

/// 状态标签芯片
class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.status});

  final StepStatus status;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: status.color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        status.label,
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
          color: status.color,
          fontWeight: FontWeight.w500,
        ),
      ),
    );
  }
}

/// 可展开的错误详情
class _ErrorDetail extends StatelessWidget {
  const _ErrorDetail({required this.errorMessage});

  final String errorMessage;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return ExpansionTile(
      tilePadding: EdgeInsets.zero,
      childrenPadding: const EdgeInsets.only(bottom: 8),
      dense: true,
      title: Text(
        errorMessage,
        maxLines: 2,
        overflow: TextOverflow.ellipsis,
        style: theme.textTheme.bodySmall?.copyWith(
          color: theme.colorScheme.error,
        ),
      ),
      children: [
        SizedBox(
          width: double.infinity,
          child: Text(
            errorMessage,
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.error,
            ),
          ),
        ),
      ],
    );
  }
}
