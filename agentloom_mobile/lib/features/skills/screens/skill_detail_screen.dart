import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../routes/route_names.dart';
import '../../../shared/widgets/resource_source_chip.dart';
import '../api/skill_api.dart';
import '../models/skill_dto.dart';
import '../providers/skill_provider.dart';

/// Skill 详情页面 — 元数据 + 内容 + 文件列表 + 操作按钮
class SkillDetailScreen extends ConsumerWidget {
  final String skillId;

  const SkillDetailScreen({super.key, required this.skillId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final detailAsync = ref.watch(skillDetailProvider(skillId));

    // 兼容 Riverpod 3.x AsyncLoading(error:...) 中间状态
    if (detailAsync.hasError && !detailAsync.hasValue) {
      return Scaffold(
        appBar: AppBar(title: const Text('技能详情')),
        body: _ErrorView(
          theme: theme,
          onRetry: () => ref.invalidate(skillDetailProvider(skillId)),
        ),
      );
    }

    return detailAsync.when(
      loading: () => Scaffold(
        appBar: AppBar(title: const Text('技能详情')),
        body: const Center(child: CircularProgressIndicator()),
      ),
      error: (error, _) => Scaffold(
        appBar: AppBar(title: const Text('技能详情')),
        body: _ErrorView(
          theme: theme,
          onRetry: () => ref.invalidate(skillDetailProvider(skillId)),
        ),
      ),
      data: (skill) {
        final isCustom = !skill.isBuiltin;

        return Scaffold(
          appBar: AppBar(
            title: Text(skill.name),
            actions: [
              if (!skill.isBuiltin && skill.sourceKind == 'share_imported')
                IconButton(
                  tooltip: '转为自己创建',
                  onPressed: () =>
                      _convertSourceToManual(context, ref, skill.id),
                  icon: const Icon(Icons.drive_file_rename_outline),
                ),
              if (isCustom)
                PopupMenuButton<String>(
                  onSelected: (action) =>
                      _handleAction(context, ref, action, skill.id),
                  itemBuilder: (ctx) => [
                    const PopupMenuItem(
                      value: 'edit',
                      child: ListTile(
                        leading: Icon(Icons.edit_outlined),
                        title: Text('编辑'),
                        contentPadding: EdgeInsets.zero,
                        dense: true,
                      ),
                    ),
                    if (skill.status == 'active')
                      const PopupMenuItem(
                        value: 'archive',
                        child: ListTile(
                          leading: Icon(Icons.archive_outlined),
                          title: Text('归档'),
                          contentPadding: EdgeInsets.zero,
                          dense: true,
                        ),
                      ),
                    const PopupMenuItem(
                      value: 'delete',
                      child: ListTile(
                        leading: Icon(
                          Icons.delete_outline,
                          color: Colors.redAccent,
                        ),
                        title: Text(
                          '删除',
                          style: TextStyle(color: Colors.redAccent),
                        ),
                        contentPadding: EdgeInsets.zero,
                        dense: true,
                      ),
                    ),
                  ],
                ),
            ],
          ),
          body: CustomScrollView(
            slivers: [
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // 头部信息
                      _HeaderSection(skill: skill, theme: theme),
                      const SizedBox(height: 16),

                      // 元数据卡片
                      _MetadataCard(skill: skill, theme: theme),
                      const SizedBox(height: 16),

                      // 描述
                      if (skill.description != null &&
                          skill.description!.isNotEmpty) ...[
                        _SectionTitle(title: '描述', theme: theme),
                        const SizedBox(height: 8),
                        Text(
                          skill.description!,
                          style: theme.textTheme.bodyMedium?.copyWith(
                            color: theme.colorScheme.onSurfaceVariant,
                          ),
                        ),
                        const SizedBox(height: 16),
                      ],

                      // SKILL.md 内容 (纯文本回退，移动端不编辑)
                      if (skill.content != null &&
                          skill.content!.isNotEmpty) ...[
                        _SectionTitle(title: '技能内容', theme: theme),
                        const SizedBox(height: 8),
                        _ContentSection(content: skill.content!, theme: theme),
                        const SizedBox(height: 16),
                      ],

                      // 文件列表
                      _SectionTitle(
                        title: '文件',
                        theme: theme,
                        trailing: Text(
                          '${skill.fileCount} file${skill.fileCount == 1 ? '' : 's'}',
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: theme.colorScheme.onSurfaceVariant,
                          ),
                        ),
                      ),
                      const SizedBox(height: 8),
                      _FileInfoCard(skill: skill, theme: theme),

                      // 时间戳
                      const SizedBox(height: 24),
                      _TimestampSection(skill: skill, theme: theme),
                    ],
                  ),
                ),
              ),
            ],
          ),
          // 自定义 skill 的 FAB 快速编辑按钮
          floatingActionButton: isCustom
              ? FloatingActionButton(
                  onPressed: () => context.pushNamed(
                    RouteNames.skillEdit,
                    pathParameters: {'skillId': skillId},
                  ),
                  tooltip: 'Edit Skill',
                  child: const Icon(Icons.edit),
                )
              : null,
        );
      },
    );
  }

  void _handleAction(
    BuildContext context,
    WidgetRef ref,
    String action,
    String id,
  ) {
    switch (action) {
      case 'edit':
        context.pushNamed(
          RouteNames.skillEdit,
          pathParameters: {'skillId': id},
        );
      case 'archive':
        _showArchiveDialog(context, ref, id);
      case 'delete':
        _showDeleteDialog(context, ref, id);
    }
  }

  Future<void> _convertSourceToManual(
    BuildContext context,
    WidgetRef ref,
    String id,
  ) async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      await ref.read(skillApiProvider).convertSourceToManual(id);
      ref.invalidate(skillDetailProvider(id));
      await ref.read(skillListProvider.notifier).refresh();
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

  void _showArchiveDialog(BuildContext context, WidgetRef ref, String id) {
    showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('归档技能'),
        content: const Text(
          '确定要归档此技能吗？'
          '之后可以恢复。',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('归档'),
          ),
        ],
      ),
    ).then((confirmed) async {
      if (confirmed != true || !context.mounted) return;
      try {
        await ref.read(skillApiProvider).archiveSkill(id);
        ref.invalidate(skillDetailProvider(id));
        ref.invalidate(skillListProvider);
        if (context.mounted) {
          ScaffoldMessenger.of(
            context,
          ).showSnackBar(const SnackBar(content: Text('技能已归档')));
        }
      } catch (e) {
        if (context.mounted) {
          ScaffoldMessenger.of(
            context,
          ).showSnackBar(SnackBar(content: Text('归档失败: $e')));
        }
      }
    });
  }

  void _showDeleteDialog(BuildContext context, WidgetRef ref, String id) {
    showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('删除技能'),
        content: const Text(
          '此操作不可撤销。'
          '确定要删除此技能吗？',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('取消'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: Theme.of(ctx).colorScheme.error,
            ),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('删除'),
          ),
        ],
      ),
    ).then((confirmed) async {
      if (confirmed != true || !context.mounted) return;
      try {
        await ref.read(skillApiProvider).deleteSkill(id);
        ref.invalidate(skillListProvider);
        if (context.mounted) {
          ScaffoldMessenger.of(
            context,
          ).showSnackBar(const SnackBar(content: Text('技能已删除')));
          context.pop();
        }
      } catch (e) {
        if (context.mounted) {
          ScaffoldMessenger.of(
            context,
          ).showSnackBar(SnackBar(content: Text('删除失败: $e')));
        }
      }
    });
  }
}

// -- 私有子组件 --

class _HeaderSection extends StatelessWidget {
  final SkillDto skill;
  final ThemeData theme;

  const _HeaderSection({required this.skill, required this.theme});

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 56,
          height: 56,
          decoration: BoxDecoration(
            color: skill.isBuiltin
                ? theme.colorScheme.primaryContainer
                : theme.colorScheme.tertiaryContainer,
            borderRadius: BorderRadius.circular(14),
          ),
          child: Icon(
            skill.isBuiltin ? Icons.verified : Icons.auto_awesome,
            color: skill.isBuiltin
                ? theme.colorScheme.onPrimaryContainer
                : theme.colorScheme.onTertiaryContainer,
            size: 28,
          ),
        ),
        const SizedBox(width: 16),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                skill.name,
                style: theme.textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 4),
              Row(
                children: [
                  Text(
                    skill.slug,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                  if (skill.isBuiltin) ...[
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 2,
                      ),
                      decoration: BoxDecoration(
                        color: theme.colorScheme.primaryContainer,
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        '内置',
                        style: theme.textTheme.labelSmall?.copyWith(
                          color: theme.colorScheme.onPrimaryContainer,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _MetadataCard extends StatelessWidget {
  final SkillDto skill;
  final ThemeData theme;

  const _MetadataCard({required this.skill, required this.theme});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            _MetadataRow(
              icon: Icons.circle,
              iconColor: skill.status == 'active'
                  ? Colors.green
                  : theme.colorScheme.onSurfaceVariant,
              label: '状态',
              value:
                  skill.status[0].toUpperCase() + (skill.status).substring(1),
            ),
            const SizedBox(height: 12),
            _MetadataRow(
              icon: Icons.folder_outlined,
              label: '文件',
              value: '${skill.fileCount}',
            ),
            const SizedBox(height: 12),
            _MetadataRow(
              icon: Icons.storage_outlined,
              label: '大小',
              value: _formatSize(skill.totalSizeBytes),
            ),
            const SizedBox(height: 12),
            _MetadataRow(
              icon: Icons.tag,
              label: '版本',
              value: '${skill.version}',
            ),
            const SizedBox(height: 12),
            _MetadataRow(
              icon: skill.isBuiltin
                  ? Icons.verified_outlined
                  : Icons.auto_awesome_outlined,
              label: '类型',
              value: skill.isBuiltin ? '内置' : '自定义',
            ),
            const SizedBox(height: 12),
            _MetadataRow(
              icon: Icons.folder_shared_outlined,
              label: '来源',
              value: getResourceSourceLabel(skill.sourceKind),
            ),
          ],
        ),
      ),
    );
  }

  String _formatSize(int bytes) {
    if (bytes < 1024) return '$bytes B';
    if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(1)} KB';
    return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
  }
}

class _SectionTitle extends StatelessWidget {
  final String title;
  final ThemeData theme;
  final Widget? trailing;

  const _SectionTitle({
    required this.title,
    required this.theme,
    this.trailing,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Text(
          title,
          style: theme.textTheme.titleMedium?.copyWith(
            fontWeight: FontWeight.w600,
          ),
        ),
        if (trailing != null) ...[const Spacer(), trailing!],
      ],
    );
  }
}

class _ContentSection extends StatelessWidget {
  final String content;
  final ThemeData theme;

  const _ContentSection({required this.content, required this.theme});

  @override
  Widget build(BuildContext context) {
    // 纯文本回退渲染 (无 flutter_markdown 依赖)
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerLow,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: theme.colorScheme.outlineVariant),
      ),
      child: SelectableText(
        content,
        style: theme.textTheme.bodyMedium?.copyWith(
          fontFamily: 'monospace',
          height: 1.5,
        ),
      ),
    );
  }
}

class _FileInfoCard extends StatelessWidget {
  final SkillDto skill;
  final ThemeData theme;

  const _FileInfoCard({required this.skill, required this.theme});

  @override
  Widget build(BuildContext context) {
    if (skill.fileCount == 0) {
      return Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Icon(
                Icons.folder_off_outlined,
                color: theme.colorScheme.onSurfaceVariant,
              ),
              const SizedBox(width: 12),
              Text(
                '暂无附件',
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
            ],
          ),
        ),
      );
    }

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            Icon(Icons.folder_outlined, color: theme.colorScheme.primary),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '${skill.fileCount} file${skill.fileCount == 1 ? '' : 's'}',
                    style: theme.textTheme.bodyMedium?.copyWith(
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  Text(
                    'File management is available on desktop',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _TimestampSection extends StatelessWidget {
  final SkillDto skill;
  final ThemeData theme;

  const _TimestampSection({required this.skill, required this.theme});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        _TimestampRow(
          label: '创建时间',
          value: _formatDateTime(skill.createdAt),
          theme: theme,
        ),
        const SizedBox(height: 4),
        _TimestampRow(
          label: '更新时间',
          value: _formatDateTime(skill.updatedAt),
          theme: theme,
        ),
      ],
    );
  }

  String _formatDateTime(String dateStr) {
    try {
      final date = DateTime.parse(dateStr);
      final now = DateTime.now();
      final diff = now.difference(date);

      if (diff.inMinutes < 1) return '刚刚';
      if (diff.inHours < 1) return '${diff.inMinutes}分钟前';
      if (diff.inDays < 1) return '${diff.inHours}小时前';
      if (diff.inDays < 7) return '${diff.inDays}天前';

      return '${date.month}/${date.day}/${date.year}';
    } catch (_) {
      return dateStr;
    }
  }
}

class _TimestampRow extends StatelessWidget {
  final String label;
  final String value;
  final ThemeData theme;

  const _TimestampRow({
    required this.label,
    required this.value,
    required this.theme,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Text(
          label,
          style: theme.textTheme.bodySmall?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
          ),
        ),
        const Spacer(),
        Text(
          value,
          style: theme.textTheme.bodySmall?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
          ),
        ),
      ],
    );
  }
}

class _MetadataRow extends StatelessWidget {
  final IconData icon;
  final Color? iconColor;
  final String label;
  final String value;

  const _MetadataRow({
    required this.icon,
    this.iconColor,
    required this.label,
    required this.value,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      children: [
        Icon(
          icon,
          size: 18,
          color: iconColor ?? theme.colorScheme.onSurfaceVariant,
        ),
        const SizedBox(width: 8),
        Text(
          label,
          style: theme.textTheme.bodyMedium?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
          ),
        ),
        const Spacer(),
        Text(
          value,
          style: theme.textTheme.bodyMedium?.copyWith(
            fontWeight: FontWeight.w500,
          ),
        ),
      ],
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
          Text('加载技能失败', style: theme.textTheme.titleMedium),
          const SizedBox(height: 8),
          FilledButton.tonal(onPressed: onRetry, child: const Text('重试')),
        ],
      ),
    );
  }
}
