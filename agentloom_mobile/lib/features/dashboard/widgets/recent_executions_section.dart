import 'package:flutter/material.dart';

import 'recent_execution_card.dart';
import '../../workflows/models/execution_summary_dto.dart';

/// 最近执行区块（Dashboard 用）
class RecentExecutionsSection extends StatelessWidget {
  final List<ExecutionSummaryDto> executions;
  final bool isLoading;
  final String? error;
  final void Function(ExecutionSummaryDto execution)? onExecutionTap;

  const RecentExecutionsSection({
    super.key,
    this.executions = const [],
    this.isLoading = false,
    this.error,
    this.onExecutionTap,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: Text(
            'Recent Executions',
            style: theme.textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
        if (isLoading)
          const Center(
            child: Padding(
              padding: EdgeInsets.all(24),
              child: CircularProgressIndicator(),
            ),
          )
        else if (error != null)
          Padding(
            padding: const EdgeInsets.all(16),
            child: Text(
              error!,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.error,
              ),
            ),
          )
        else if (executions.isEmpty)
          Padding(
            padding: const EdgeInsets.all(24),
            child: Center(
              child: Column(
                children: [
                  Icon(
                    Icons.history,
                    size: 48,
                    color: theme.colorScheme.onSurfaceVariant.withValues(
                      alpha: 0.5,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'No recent executions',
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                ],
              ),
            ),
          )
        else
          ...executions.map(
            (e) => RecentExecutionCard(
              execution: e,
              onTap: onExecutionTap != null ? () => onExecutionTap!(e) : null,
            ),
          ),
      ],
    );
  }
}
