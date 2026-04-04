import 'package:flutter/material.dart';

import 'entity_icon.dart';

/// 统一网格卡片组件
///
/// 用于 Workflow 和 Agent 列表页的响应式网格布局。
/// 卡片内容：图标 + 名称 + 状态徽章 + 描述 + 底部日期/版本。
class EntityGridCard extends StatelessWidget {
  const EntityGridCard({
    super.key,
    required this.icon,
    required this.fallbackIcon,
    required this.name,
    this.description,
    required this.status,
    required this.date,
    this.versionLabel,
    this.onTap,
    this.onSecondaryAction,
    this.secondaryActionIcon,
    this.titleTrailing,
  });

  /// 图标值，传给 [EntityIcon]
  final String? icon;

  /// 默认图标
  final IconData fallbackIcon;

  /// 实体名称
  final String name;

  /// 描述文本（2 行截断）
  final String? description;

  /// 状态字符串，决定徽章颜色
  final String status;

  /// 格式化的日期字符串
  final String date;

  /// 可选版本标签（如 "v3"）
  final String? versionLabel;

  /// 点击回调
  final VoidCallback? onTap;

  /// 次要操作回调（如 Agent 的 Chat 按钮）
  final VoidCallback? onSecondaryAction;

  /// 次要操作图标
  final IconData? secondaryActionIcon;

  /// 标题后的附加标记
  final Widget? titleTrailing;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Card(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(24),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // 顶部：图标 + 状态徽章 + 次要操作
              Row(
                children: [
                  // 图标容器
                  Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(
                      color: theme.colorScheme.primaryContainer,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Center(
                      child: EntityIcon(
                        icon: icon,
                        fallbackIcon: fallbackIcon,
                        size: 22,
                        color: theme.colorScheme.onPrimaryContainer,
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  _StatusBadge(status: status),
                  const Spacer(),
                  if (onSecondaryAction != null && secondaryActionIcon != null)
                    SizedBox(
                      width: 32,
                      height: 32,
                      child: IconButton(
                        onPressed: onSecondaryAction,
                        icon: Icon(secondaryActionIcon, size: 18),
                        padding: EdgeInsets.zero,
                        color: theme.colorScheme.primary,
                        tooltip: 'Action',
                      ),
                    ),
                ],
              ),

              const SizedBox(height: 10),

              // 名称（1 行截断）
              Row(
                children: [
                  Expanded(
                    child: Text(
                      name,
                      style: theme.textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  if (titleTrailing != null) ...[
                    const SizedBox(width: 8),
                    titleTrailing!,
                  ],
                ],
              ),

              const SizedBox(height: 4),

              // 描述（2 行截断）
              Expanded(
                child: Text(
                  description ?? '',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                    height: 1.3,
                  ),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ),

              const SizedBox(height: 8),

              // 底部：日期 + 版本
              Row(
                children: [
                  Icon(
                    Icons.access_time,
                    size: 12,
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                  const SizedBox(width: 4),
                  Expanded(
                    child: Text(
                      date,
                      style: theme.textTheme.labelSmall?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  if (versionLabel != null) ...[
                    const SizedBox(width: 6),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 6,
                        vertical: 2,
                      ),
                      decoration: BoxDecoration(
                        color: theme.colorScheme.surfaceContainerHigh,
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        versionLabel!,
                        style: theme.textTheme.labelSmall?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// 状态徽章
class _StatusBadge extends StatelessWidget {
  const _StatusBadge({required this.status});

  final String status;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final (Color color, String label) = switch (status) {
      'published' => (Colors.green, 'Published'),
      'archived' => (Colors.grey, 'Archived'),
      _ => (Colors.orange, 'Draft'),
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        label,
        style: theme.textTheme.labelSmall?.copyWith(
          color: color,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}
