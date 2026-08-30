import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../routes/route_names.dart';
import '../../workflows/models/workflow_definition_dto.dart';
import '../../workflows/widgets/workflow_status_chip.dart';

/// 快速访问区块（Dashboard 用，展示已发布工作流）
class QuickAccessSection extends StatelessWidget {
  final List<WorkflowDefinitionDto> workflows;
  final bool isLoading;
  final String? error;

  const QuickAccessSection({
    super.key,
    this.workflows = const [],
    this.isLoading = false,
    this.error,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                '快速访问',
                style: theme.textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w600,
                ),
              ),
              TextButton(
                onPressed: () => context.go('/workflows'),
                child: const Text('查看全部'),
              ),
            ],
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
        else if (workflows.isEmpty)
          Padding(
            padding: const EdgeInsets.all(24),
            child: Center(
              child: Column(
                children: [
                  Icon(
                    Icons.rocket_launch,
                    size: 48,
                    color: theme.colorScheme.onSurfaceVariant.withValues(
                      alpha: 0.5,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    '暂无已发布的工作流',
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                ],
              ),
            ),
          )
        else
          SizedBox(
            height: 140,
            child: ListView.separated(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              scrollDirection: Axis.horizontal,
              itemCount: workflows.length,
              separatorBuilder: (_, _) => const SizedBox(width: 12),
              itemBuilder: (context, index) {
                final wf = workflows[index];
                return _QuickAccessCard(
                  workflow: wf,
                  onTap: () => context.goNamed(
                    RouteNames.workflowDetail,
                    pathParameters: {'workflowId': wf.id},
                  ),
                );
              },
            ),
          ),
      ],
    );
  }
}

class _QuickAccessCard extends StatelessWidget {
  final WorkflowDefinitionDto workflow;
  final VoidCallback? onTap;

  const _QuickAccessCard({required this.workflow, this.onTap});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return SizedBox(
      width: 160,
      child: Card(
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(12),
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.account_tree, color: theme.colorScheme.primary),
                const SizedBox(height: 8),
                Text(
                  workflow.name,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                const Spacer(),
                WorkflowStatusChip(status: workflow.status),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
