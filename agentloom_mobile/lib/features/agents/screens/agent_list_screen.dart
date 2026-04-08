import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../routes/route_names.dart';
import '../../../shared/widgets/entity_grid_card.dart';
import '../../../shared/widgets/resource_source_chip.dart';
import '../providers/agent_provider.dart';

/// Agent 列表页面
class AgentListScreen extends ConsumerStatefulWidget {
  const AgentListScreen({super.key});

  @override
  ConsumerState<AgentListScreen> createState() => _AgentListScreenState();
}

class _AgentListScreenState extends ConsumerState<AgentListScreen> {
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
      ref.read(agentListProvider.notifier).setSearchQuery(query);
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

      if (diff.inDays == 0) return '今天';
      if (diff.inDays == 1) return '昨天';
      if (diff.inDays < 7) return '${diff.inDays}天前';
      return '${date.month}/${date.day}/${date.year}';
    } catch (_) {
      return isoDate;
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final agentState = ref.watch(agentListProvider);

    return Scaffold(
      appBar: AppBar(
        title: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.smart_toy_rounded,
              size: 22,
              color: theme.colorScheme.onSurface,
            ),
            const SizedBox(width: 8),
            const Text('智能体'),
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
                hintText: '搜索智能体...',
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
                  label: '全部',
                  selected: agentState.value?.statusFilter == null,
                  onSelected: (_) => ref
                      .read(agentListProvider.notifier)
                      .setStatusFilter(null),
                ),
                const SizedBox(width: 8),
                _FilterChip(
                  label: '草稿',
                  selected: agentState.value?.statusFilter == 'draft',
                  onSelected: (_) => ref
                      .read(agentListProvider.notifier)
                      .setStatusFilter('draft'),
                ),
                const SizedBox(width: 8),
                _FilterChip(
                  label: '已发布',
                  selected: agentState.value?.statusFilter == 'published',
                  onSelected: (_) => ref
                      .read(agentListProvider.notifier)
                      .setStatusFilter('published'),
                ),
                const SizedBox(width: 8),
                _FilterChip(
                  label: '已归档',
                  selected: agentState.value?.statusFilter == 'archived',
                  onSelected: (_) => ref
                      .read(agentListProvider.notifier)
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
                  selected: agentState.value?.sourceKindFilter == null,
                  onSelected: (_) => ref
                      .read(agentListProvider.notifier)
                      .setSourceKindFilter(null),
                ),
                const SizedBox(width: 8),
                _FilterChip(
                  label: '自己创建',
                  selected: agentState.value?.sourceKindFilter == 'manual',
                  onSelected: (_) => ref
                      .read(agentListProvider.notifier)
                      .setSourceKindFilter('manual'),
                ),
                const SizedBox(width: 8),
                _FilterChip(
                  label: '分享导入',
                  selected:
                      agentState.value?.sourceKindFilter == 'share_imported',
                  onSelected: (_) => ref
                      .read(agentListProvider.notifier)
                      .setSourceKindFilter('share_imported'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),

          // 网格列表
          Expanded(
            child: agentState.when(
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
                      '加载智能体失败',
                      style: theme.textTheme.titleMedium,
                    ),
                    const SizedBox(height: 8),
                    TextButton(
                      onPressed: () =>
                          ref.read(agentListProvider.notifier).refresh(),
                      child: const Text('重试'),
                    ),
                  ],
                ),
              ),
              data: (state) {
                if (state.agents.isEmpty) {
                  return Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          Icons.smart_toy_outlined,
                          size: 64,
                          color: theme.colorScheme.onSurfaceVariant.withValues(
                            alpha: 0.5,
                          ),
                        ),
                        const SizedBox(height: 16),
                        Text(
                          '未找到智能体',
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
                      ref.read(agentListProvider.notifier).refresh(),
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
                            ref.read(agentListProvider.notifier).loadMore();
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
                                  final agent = state.agents[index];

                                  return EntityGridCard(
                                    icon: agent.icon,
                                    fallbackIcon: Icons.smart_toy_outlined,
                                    name: agent.name,
                                    description: [
                                      agent.runtimeModeLabel,
                                      if (agent.description != null &&
                                          agent.description!.trim().isNotEmpty)
                                        agent.description!.trim(),
                                    ].join(' · '),
                                    status: agent.status,
                                    date: _formatDate(agent.updatedAt),
                                    titleTrailing: ResourceSourceChip(
                                      sourceKind: agent.resourceSourceKind,
                                      compact: true,
                                    ),
                                    versionLabel: agent.version != null
                                        ? 'v${agent.version}'
                                        : null,
                                    onTap: () => context.pushNamed(
                                      RouteNames.agentDetail,
                                      pathParameters: {'agentId': agent.id},
                                    ),
                                    onSecondaryAction:
                                        agent.status == 'published'
                                        ? () => _startConversation(
                                            context,
                                            agent.id,
                                          )
                                        : null,
                                    secondaryActionIcon:
                                        agent.status == 'published'
                                        ? Icons.chat_bubble_outline
                                        : null,
                                  );
                                }, childCount: state.agents.length),
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

  Future<void> _startConversation(BuildContext context, String agentId) async {
    context.pushNamed(
      RouteNames.agentNewConversation,
      pathParameters: {'agentId': agentId},
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
