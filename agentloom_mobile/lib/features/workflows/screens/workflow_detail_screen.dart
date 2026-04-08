import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../routes/route_names.dart';
import '../../../shared/widgets/entity_icon.dart';
import '../../../shared/widgets/resource_source_chip.dart';
import '../api/workflow_api.dart';
import '../models/workflow_definition_dto.dart';
import '../providers/workflow_detail_provider.dart';
import '../providers/workflow_list_provider.dart';
import '../widgets/execution_summary_tile.dart';
import '../widgets/workflow_status_chip.dart';

/// 工作流详情页面
class WorkflowDetailScreen extends ConsumerWidget {
  final String workflowId;

  const WorkflowDetailScreen({super.key, required this.workflowId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final workflowAsync = ref.watch(workflowDetailProvider(workflowId));
    final executionsAsync = ref.watch(workflowExecutionsProvider(workflowId));
    final currentWorkflow = workflowAsync.whenOrNull(
      data: (workflow) => workflow,
    );

    return Scaffold(
      appBar: AppBar(
        title:
            workflowAsync.whenOrNull(data: (wf) => Text(wf.name)) ??
            const Text('工作流'),
        actions: [
          if (currentWorkflow?.isShareImported ?? false)
            IconButton(
              tooltip: '转为自己创建',
              onPressed: () =>
                  _convertWorkflowSourceToManual(context, ref, workflowId),
              icon: const Icon(Icons.drive_file_rename_outline),
            ),
        ],
      ),
      // 优先检查 error 状态（包含 Riverpod 3.x 的 loading-with-error 中间状态）
      body: (workflowAsync.hasError && !workflowAsync.hasValue)
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
                    '加载工作流失败',
                    style: theme.textTheme.titleMedium,
                  ),
                  const SizedBox(height: 8),
                  TextButton(
                    onPressed: () =>
                        ref.invalidate(workflowDetailProvider(workflowId)),
                    child: const Text('重试'),
                  ),
                ],
              ),
            )
          : workflowAsync.when(
              loading: () => const _SkeletonLoading(),
              error: (error, _) => const SizedBox.shrink(), // 已在上面处理
              data: (workflow) => CustomScrollView(
                slivers: [
                  // 元数据卡片
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
                                  child: Center(
                                    child: EntityIcon(
                                      icon: workflow.icon,
                                      fallbackIcon: Icons.account_tree_outlined,
                                      size: 28,
                                      color:
                                          theme.colorScheme.onPrimaryContainer,
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 16),
                                Expanded(
                                  child: Text(
                                    workflow.name,
                                    style: theme.textTheme.headlineSmall
                                        ?.copyWith(fontWeight: FontWeight.w600),
                                  ),
                                ),
                                WorkflowStatusChip(status: workflow.status),
                              ],
                            ),
                            if (workflow.description != null &&
                                workflow.description!.isNotEmpty) ...[
                              const SizedBox(height: 12),
                              Text(
                                workflow.description!,
                                style: theme.textTheme.bodyMedium?.copyWith(
                                  color: theme.colorScheme.onSurfaceVariant,
                                ),
                              ),
                            ],
                            const SizedBox(height: 16),
                            _MetadataRow(
                              label: 'Version',
                              value: _buildReleaseLabel(workflow),
                            ),
                            const SizedBox(height: 4),
                            _MetadataRow(
                              label: '来源',
                              value: getResourceSourceLabel(
                                workflow.resourceSourceKind,
                              ),
                            ),
                            const SizedBox(height: 4),
                            _MetadataRow(label: 'Slug', value: workflow.slug),
                            const SizedBox(height: 4),
                            _MetadataRow(
                              label: 'Updated',
                              value: _formatDate(workflow.updatedAt),
                            ),
                            const SizedBox(height: 4),
                            _MetadataRow(
                              label: 'Created',
                              value: _formatDate(workflow.createdAt),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),

                  // 执行历史标题
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 8,
                      ),
                      child: Text(
                        'Recent Executions',
                        style: theme.textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ),

                  // 执行列表
                  executionsAsync.when(
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
                          'Failed to load executions',
                          style: theme.textTheme.bodyMedium?.copyWith(
                            color: theme.colorScheme.error,
                          ),
                        ),
                      ),
                    ),
                    data: (response) {
                      if (response.data.isEmpty) {
                        return SliverToBoxAdapter(
                          child: Padding(
                            padding: const EdgeInsets.all(24),
                            child: Center(
                              child: Column(
                                children: [
                                  Icon(
                                    Icons.history,
                                    size: 48,
                                    color: theme.colorScheme.onSurfaceVariant
                                        .withValues(alpha: 0.5),
                                  ),
                                  const SizedBox(height: 8),
                                  Text(
                                    'No executions yet',
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
                        delegate: SliverChildBuilderDelegate(
                          (context, index) => ExecutionSummaryTile(
                            execution: response.data[index],
                            onTap: () => context.pushNamed(
                              RouteNames.executionMonitor,
                              pathParameters: {
                                'executionId': response.data[index].id,
                              },
                            ),
                          ),
                          childCount: response.data.length,
                        ),
                      );
                    },
                  ),
                ],
              ),
            ),
      floatingActionButton: workflowAsync.whenOrNull(
        data: (wf) => wf.status == 'published'
            ? FloatingActionButton.extended(
                onPressed: () {
                  context.pushNamed(
                    RouteNames.workflowLaunch,
                    pathParameters: {'workflowId': workflowId},
                    queryParameters: {'name': wf.name},
                  );
                },
                icon: const Icon(Icons.play_arrow),
                label: const Text('运行'),
              )
            : null,
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

  String _buildReleaseLabel(WorkflowDefinitionDto workflow) {
    if (workflow.status == 'published') {
      return 'v${workflow.publishedReleaseNumber ?? 1}';
    }

    return 'Unpublished';
  }
}

Future<void> _convertWorkflowSourceToManual(
  BuildContext context,
  WidgetRef ref,
  String workflowId,
) async {
  final messenger = ScaffoldMessenger.of(context);
  try {
    await ref.read(workflowApiProvider).convertSourceToManual(workflowId);
    ref.invalidate(workflowDetailProvider(workflowId));
    await ref.read(workflowListProvider.notifier).refresh();
    if (!context.mounted) {
      return;
    }
    messenger.showSnackBar(const SnackBar(content: Text('已转为自己创建')));
  } catch (error) {
    if (!context.mounted) {
      return;
    }
    messenger.showSnackBar(SnackBar(content: Text('转换失败：$error')));
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

/// 骨架加载效果
class _SkeletonLoading extends StatelessWidget {
  const _SkeletonLoading();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final shimmerColor = theme.colorScheme.surfaceContainerHighest;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // 标题骨架
          Container(
            width: 200,
            height: 28,
            decoration: BoxDecoration(
              color: shimmerColor,
              borderRadius: BorderRadius.circular(4),
            ),
          ),
          const SizedBox(height: 16),
          // 描述骨架
          Container(
            width: double.infinity,
            height: 16,
            decoration: BoxDecoration(
              color: shimmerColor,
              borderRadius: BorderRadius.circular(4),
            ),
          ),
          const SizedBox(height: 8),
          Container(
            width: 250,
            height: 16,
            decoration: BoxDecoration(
              color: shimmerColor,
              borderRadius: BorderRadius.circular(4),
            ),
          ),
          const SizedBox(height: 24),
          // 元数据骨架
          for (int i = 0; i < 4; i++) ...[
            Container(
              width: double.infinity,
              height: 14,
              decoration: BoxDecoration(
                color: shimmerColor,
                borderRadius: BorderRadius.circular(4),
              ),
            ),
            const SizedBox(height: 8),
          ],
        ],
      ),
    );
  }
}
