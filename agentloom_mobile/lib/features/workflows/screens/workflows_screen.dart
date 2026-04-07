import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../routes/route_names.dart';
import '../../../shared/widgets/entity_grid_card.dart';
import '../../../shared/widgets/resource_source_chip.dart';
import '../providers/workflow_list_provider.dart';

/// 工作流列表页面
class WorkflowsScreen extends ConsumerStatefulWidget {
  const WorkflowsScreen({super.key});

  @override
  ConsumerState<WorkflowsScreen> createState() => _WorkflowsScreenState();
}

class _WorkflowsScreenState extends ConsumerState<WorkflowsScreen> {
  final _searchController = TextEditingController();
  Timer? _debounceTimer;

  @override
  void dispose() {
    _searchController.dispose();
    _debounceTimer?.cancel();
    super.dispose();
  }

  void _onSearchChanged(String query) {
    _debounceTimer?.cancel();
    _debounceTimer = Timer(const Duration(milliseconds: 300), () {
      ref.read(workflowListProvider.notifier).setSearchQuery(query);
    });
  }

  /// 根据宽度计算列数
  int _crossAxisCount(double width) {
    if (width >= 1200) return 4;
    if (width >= 800) return 3;
    if (width >= 500) return 2;
    return 1;
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

  String _buildReleaseLabel(String status, int? publishedReleaseNumber) {
    if (status == 'published') {
      return 'v${publishedReleaseNumber ?? 1}';
    }
    return '';
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final workflowState = ref.watch(workflowListProvider);

    return Scaffold(
      appBar: AppBar(
        title: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.account_tree_rounded,
              size: 22,
              color: theme.colorScheme.onSurface,
            ),
            const SizedBox(width: 8),
            const Text('Workflows'),
          ],
        ),
      ),
      body: Column(
        children: [
          // 搜索栏
          Padding(
            padding: const EdgeInsets.all(16),
            child: TextField(
              controller: _searchController,
              onChanged: _onSearchChanged,
              decoration: InputDecoration(
                hintText: 'Search workflows...',
                prefixIcon: const Icon(Icons.search),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
                contentPadding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 12,
                ),
              ),
            ),
          ),

          // 状态筛选 Chips
          SizedBox(
            height: 40,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              children: [
                _FilterChip(
                  label: 'All',
                  selected: workflowState.value?.statusFilter == null,
                  onSelected: (_) => ref
                      .read(workflowListProvider.notifier)
                      .setStatusFilter(null),
                ),
                const SizedBox(width: 8),
                _FilterChip(
                  label: 'Draft',
                  selected: workflowState.value?.statusFilter == 'draft',
                  onSelected: (_) => ref
                      .read(workflowListProvider.notifier)
                      .setStatusFilter('draft'),
                ),
                const SizedBox(width: 8),
                _FilterChip(
                  label: 'Published',
                  selected: workflowState.value?.statusFilter == 'published',
                  onSelected: (_) => ref
                      .read(workflowListProvider.notifier)
                      .setStatusFilter('published'),
                ),
                const SizedBox(width: 8),
                _FilterChip(
                  label: 'Archived',
                  selected: workflowState.value?.statusFilter == 'archived',
                  onSelected: (_) => ref
                      .read(workflowListProvider.notifier)
                      .setStatusFilter('archived'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),

          SizedBox(
            height: 40,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              children: [
                _FilterChip(
                  label: '全部来源',
                  selected: workflowState.value?.sourceKindFilter == null,
                  onSelected: (_) => ref
                      .read(workflowListProvider.notifier)
                      .setSourceKindFilter(null),
                ),
                const SizedBox(width: 8),
                _FilterChip(
                  label: '自己创建',
                  selected: workflowState.value?.sourceKindFilter == 'manual',
                  onSelected: (_) => ref
                      .read(workflowListProvider.notifier)
                      .setSourceKindFilter('manual'),
                ),
                const SizedBox(width: 8),
                _FilterChip(
                  label: '分享导入',
                  selected:
                      workflowState.value?.sourceKindFilter == 'share_imported',
                  onSelected: (_) => ref
                      .read(workflowListProvider.notifier)
                      .setSourceKindFilter('share_imported'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),

          // 网格列表
          Expanded(
            child: workflowState.when(
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
                      'Failed to load workflows',
                      style: theme.textTheme.titleMedium,
                    ),
                    const SizedBox(height: 8),
                    TextButton(
                      onPressed: () =>
                          ref.read(workflowListProvider.notifier).refresh(),
                      child: const Text('Retry'),
                    ),
                  ],
                ),
              ),
              data: (state) {
                if (state.workflows.isEmpty) {
                  return Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          Icons.inbox,
                          size: 64,
                          color: theme.colorScheme.onSurfaceVariant.withValues(
                            alpha: 0.5,
                          ),
                        ),
                        const SizedBox(height: 16),
                        Text(
                          'No workflows found',
                          style: theme.textTheme.titleMedium?.copyWith(
                            color: theme.colorScheme.onSurfaceVariant,
                          ),
                        ),
                      ],
                    ),
                  );
                }

                return RefreshIndicator(
                  onRefresh: () =>
                      ref.read(workflowListProvider.notifier).refresh(),
                  child: LayoutBuilder(
                    builder: (context, constraints) {
                      final crossAxisCount = _crossAxisCount(
                        constraints.maxWidth,
                      );
                      final childAspectRatio =
                          crossAxisCount == 1 ? 2.0 : 0.88;

                      return NotificationListener<ScrollNotification>(
                        onNotification: (scrollInfo) {
                          if (scrollInfo.metrics.pixels >=
                              scrollInfo.metrics.maxScrollExtent - 200) {
                            ref.read(workflowListProvider.notifier).loadMore();
                          }
                          return false;
                        },
                        child: CustomScrollView(
                          slivers: [
                            SliverPadding(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 16,
                                vertical: 4,
                              ),
                              sliver: SliverGrid(
                                gridDelegate:
                                    SliverGridDelegateWithFixedCrossAxisCount(
                                      crossAxisCount: crossAxisCount,
                                      mainAxisSpacing: 8,
                                      crossAxisSpacing: 8,
                                      childAspectRatio: childAspectRatio,
                                    ),
                                delegate: SliverChildBuilderDelegate((
                                  context,
                                  index,
                                ) {
                                  final workflow = state.workflows[index];
                                  final versionLabel = _buildReleaseLabel(
                                    workflow.status,
                                    workflow.publishedReleaseNumber,
                                  );

                                  return EntityGridCard(
                                    icon: workflow.icon,
                                    fallbackIcon: Icons.account_tree_outlined,
                                    name: workflow.name,
                                    description: workflow.description,
                                    status: workflow.status,
                                    date: _formatDate(workflow.updatedAt),
                                    titleTrailing: ResourceSourceChip(
                                      sourceKind: workflow.resourceSourceKind,
                                      compact: true,
                                    ),
                                    versionLabel: versionLabel.isNotEmpty
                                        ? versionLabel
                                        : null,
                                    onTap: () => context.goNamed(
                                      RouteNames.workflowDetail,
                                      pathParameters: {
                                        'workflowId': workflow.id,
                                      },
                                    ),
                                  );
                                }, childCount: state.workflows.length),
                              ),
                            ),
                            // 加载更多指示器
                            if (state.isLoadingMore)
                              const SliverToBoxAdapter(
                                child: Center(
                                  child: Padding(
                                    padding: EdgeInsets.all(16),
                                    child: CircularProgressIndicator(),
                                  ),
                                ),
                              ),
                          ],
                        ),
                      );
                    },
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _FilterChip extends StatelessWidget {
  final String label;
  final bool selected;
  final ValueChanged<bool> onSelected;

  const _FilterChip({
    required this.label,
    required this.selected,
    required this.onSelected,
  });

  @override
  Widget build(BuildContext context) {
    return FilterChip(
      label: Text(label),
      selected: selected,
      onSelected: onSelected,
      showCheckmark: false,
    );
  }
}
