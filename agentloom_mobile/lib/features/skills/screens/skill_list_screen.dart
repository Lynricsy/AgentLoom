import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../routes/route_names.dart';
import '../providers/skill_provider.dart';
import '../widgets/skill_card.dart';

/// Skill 列表页面 — 搜索 + 类型筛选 + 状态筛选 + 下拉刷新 + 无限滚动
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
      appBar: AppBar(title: const Text('Skills')),
      body: Column(
        children: [
          // 搜索栏
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
            child: TextField(
              controller: _searchController,
              onChanged: _onSearchChanged,
              decoration: InputDecoration(
                hintText: 'Search skills...',
                prefixIcon: const Icon(Icons.search),
                suffixIcon: _searchController.text.isNotEmpty
                    ? IconButton(
                        icon: const Icon(Icons.clear),
                        onPressed: () {
                          _searchController.clear();
                          ref
                              .read(skillListProvider.notifier)
                              .setSearchQuery('');
                        },
                      )
                    : null,
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

          // 类型筛选 Chips (全部 / 内置 / 自定义)
          SizedBox(
            height: 40,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              children: [
                _FilterChip(
                  label: '全部',
                  selected: skillState.value?.isBuiltinFilter == null,
                  onSelected: (_) => ref
                      .read(skillListProvider.notifier)
                      .setIsBuiltinFilter(null),
                ),
                const SizedBox(width: 8),
                _FilterChip(
                  label: '内置',
                  selected: skillState.value?.isBuiltinFilter == true,
                  onSelected: (_) => ref
                      .read(skillListProvider.notifier)
                      .setIsBuiltinFilter(true),
                ),
                const SizedBox(width: 8),
                _FilterChip(
                  label: '自定义',
                  selected: skillState.value?.isBuiltinFilter == false,
                  onSelected: (_) => ref
                      .read(skillListProvider.notifier)
                      .setIsBuiltinFilter(false),
                ),
              ],
            ),
          ),
          const SizedBox(height: 4),

          // 状态筛选 Chips (All / Active / Archived)
          SizedBox(
            height: 40,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              children: [
                _FilterChip(
                  label: 'All',
                  selected: skillState.value?.statusFilter == null,
                  onSelected: (_) => ref
                      .read(skillListProvider.notifier)
                      .setStatusFilter(null),
                ),
                const SizedBox(width: 8),
                _FilterChip(
                  label: 'Active',
                  selected: skillState.value?.statusFilter == 'active',
                  onSelected: (_) => ref
                      .read(skillListProvider.notifier)
                      .setStatusFilter('active'),
                ),
                const SizedBox(width: 8),
                _FilterChip(
                  label: 'Archived',
                  selected: skillState.value?.statusFilter == 'archived',
                  onSelected: (_) => ref
                      .read(skillListProvider.notifier)
                      .setStatusFilter('archived'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),

          // 列表区域
          Expanded(
            child: skillState.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (error, _) => _ErrorView(
                theme: theme,
                onRetry: () => ref.read(skillListProvider.notifier).refresh(),
              ),
              data: (state) {
                if (state.skills.isEmpty) {
                  return _EmptyView(theme: theme);
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
                      padding: const EdgeInsets.only(bottom: 16),
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

// -- 私有子组件 --

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

class _ErrorView extends StatelessWidget {
  final ThemeData theme;
  final VoidCallback onRetry;

  const _ErrorView({required this.theme, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.error_outline, size: 48, color: theme.colorScheme.error),
          const SizedBox(height: 16),
          Text('Failed to load skills', style: theme.textTheme.titleMedium),
          const SizedBox(height: 8),
          FilledButton.tonal(onPressed: onRetry, child: const Text('Retry')),
        ],
      ),
    );
  }
}

class _EmptyView extends StatelessWidget {
  final ThemeData theme;

  const _EmptyView({required this.theme});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.auto_awesome_outlined,
            size: 64,
            color: theme.colorScheme.onSurfaceVariant.withValues(alpha: 0.5),
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
}
