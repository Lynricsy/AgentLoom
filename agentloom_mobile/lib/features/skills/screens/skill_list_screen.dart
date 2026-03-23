import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../routes/route_names.dart';
import '../providers/skill_provider.dart';
import '../widgets/skill_card.dart';

/// Skill 列表页面（Marketplace 浏览）
class SkillListScreen extends ConsumerStatefulWidget {
  const SkillListScreen({super.key});

  @override
  ConsumerState<SkillListScreen> createState() => _SkillListScreenState();
}

class _SkillListScreenState extends ConsumerState<SkillListScreen> {
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
      ref.read(skillListProvider.notifier).setSearchQuery(query);
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final skillState = ref.watch(skillListProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Skills'),
        actions: [
          // 排序按钮
          PopupMenuButton<String>(
            icon: const Icon(Icons.sort),
            tooltip: 'Sort by',
            onSelected: (sort) {
              ref.read(skillListProvider.notifier).setSortBy(sort);
            },
            itemBuilder: (context) => [
              PopupMenuItem(
                value: 'popular',
                child: Row(
                  children: [
                    if (skillState.value?.sortBy == 'popular')
                      Icon(
                        Icons.check,
                        size: 18,
                        color: theme.colorScheme.primary,
                      ),
                    if (skillState.value?.sortBy == 'popular')
                      const SizedBox(width: 8),
                    const Text('Popular'),
                  ],
                ),
              ),
              PopupMenuItem(
                value: 'rating',
                child: Row(
                  children: [
                    if (skillState.value?.sortBy == 'rating')
                      Icon(
                        Icons.check,
                        size: 18,
                        color: theme.colorScheme.primary,
                      ),
                    if (skillState.value?.sortBy == 'rating')
                      const SizedBox(width: 8),
                    const Text('Highest Rated'),
                  ],
                ),
              ),
              PopupMenuItem(
                value: 'newest',
                child: Row(
                  children: [
                    if (skillState.value?.sortBy == 'newest')
                      Icon(
                        Icons.check,
                        size: 18,
                        color: theme.colorScheme.primary,
                      ),
                    if (skillState.value?.sortBy == 'newest')
                      const SizedBox(width: 8),
                    const Text('Newest'),
                  ],
                ),
              ),
            ],
          ),
        ],
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
                hintText: 'Search skills...',
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

          // 分类筛选 Chips
          SizedBox(
            height: 40,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              children: [
                _FilterChip(
                  label: 'All',
                  selected: skillState.value?.categoryFilter == null,
                  onSelected: (_) => ref
                      .read(skillListProvider.notifier)
                      .setCategoryFilter(null),
                ),
                const SizedBox(width: 8),
                _FilterChip(
                  label: 'Analysis',
                  selected: skillState.value?.categoryFilter == 'analysis',
                  onSelected: (_) => ref
                      .read(skillListProvider.notifier)
                      .setCategoryFilter('analysis'),
                ),
                const SizedBox(width: 8),
                _FilterChip(
                  label: 'Content',
                  selected: skillState.value?.categoryFilter == 'content',
                  onSelected: (_) => ref
                      .read(skillListProvider.notifier)
                      .setCategoryFilter('content'),
                ),
                const SizedBox(width: 8),
                _FilterChip(
                  label: 'Development',
                  selected: skillState.value?.categoryFilter == 'development',
                  onSelected: (_) => ref
                      .read(skillListProvider.notifier)
                      .setCategoryFilter('development'),
                ),
                const SizedBox(width: 8),
                _FilterChip(
                  label: 'Automation',
                  selected: skillState.value?.categoryFilter == 'automation',
                  onSelected: (_) => ref
                      .read(skillListProvider.notifier)
                      .setCategoryFilter('automation'),
                ),
                const SizedBox(width: 8),
                _FilterChip(
                  label: 'Reporting',
                  selected: skillState.value?.categoryFilter == 'reporting',
                  onSelected: (_) => ref
                      .read(skillListProvider.notifier)
                      .setCategoryFilter('reporting'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),

          // 列表
          Expanded(
            child: skillState.when(
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
                      'Failed to load skills',
                      style: theme.textTheme.titleMedium,
                    ),
                    const SizedBox(height: 8),
                    TextButton(
                      onPressed: () =>
                          ref.read(skillListProvider.notifier).refresh(),
                      child: const Text('Retry'),
                    ),
                  ],
                ),
              ),
              data: (state) {
                if (state.skills.isEmpty) {
                  return Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          Icons.extension_outlined,
                          size: 64,
                          color: theme.colorScheme.onSurfaceVariant.withValues(
                            alpha: 0.5,
                          ),
                        ),
                        const SizedBox(height: 16),
                        Text(
                          'No skills found',
                          style: theme.textTheme.titleMedium?.copyWith(
                            color: theme.colorScheme.onSurfaceVariant,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'Try adjusting your search or filters',
                          style: theme.textTheme.bodyMedium?.copyWith(
                            color: theme.colorScheme.onSurfaceVariant,
                          ),
                        ),
                      ],
                    ),
                  );
                }

                return RefreshIndicator(
                  onRefresh: () =>
                      ref.read(skillListProvider.notifier).refresh(),
                  child: NotificationListener<ScrollNotification>(
                    onNotification: (scrollInfo) {
                      if (scrollInfo.metrics.pixels >=
                          scrollInfo.metrics.maxScrollExtent - 200) {
                        ref.read(skillListProvider.notifier).loadMore();
                      }
                      return false;
                    },
                    child: ListView.builder(
                      itemCount:
                          state.skills.length + (state.isLoadingMore ? 1 : 0),
                      itemBuilder: (context, index) {
                        if (index == state.skills.length) {
                          return const Center(
                            child: Padding(
                              padding: EdgeInsets.all(16),
                              child: CircularProgressIndicator(),
                            ),
                          );
                        }

                        final skill = state.skills[index];
                        return SkillCard(
                          skill: skill,
                          onTap: () => context.pushNamed(
                            RouteNames.skillDetail,
                            pathParameters: {'skillId': skill.id},
                          ),
                        );
                      },
                    ),
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
