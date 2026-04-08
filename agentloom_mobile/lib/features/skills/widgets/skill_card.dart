import 'package:flutter/material.dart';

import '../../../shared/widgets/resource_source_chip.dart';
import '../models/skill_dto.dart';

/// Skill 卡片（列表页用）
class SkillCard extends StatelessWidget {
  final SkillDto skill;
  final VoidCallback? onTap;

  const SkillCard({super.key, required this.skill, this.onTap});

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

    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(
                      color: skill.isBuiltin
                          ? theme.colorScheme.secondaryContainer
                          : theme.colorScheme.tertiaryContainer,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Icon(
                      skill.isBuiltin ? Icons.verified : Icons.auto_awesome,
                      color: skill.isBuiltin
                          ? theme.colorScheme.onSecondaryContainer
                          : theme.colorScheme.onTertiaryContainer,
                      size: 22,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          skill.name,
                          style: theme.textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.w600,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 4),
                        Row(
                          children: [
                            _StatusBadge(
                              label: skill.status,
                              color: skill.status == 'active'
                                  ? theme.colorScheme.primaryContainer
                                  : theme.colorScheme.surfaceContainerHighest,
                              textColor: skill.status == 'active'
                                  ? theme.colorScheme.onPrimaryContainer
                                  : theme.colorScheme.onSurfaceVariant,
                            ),
                            if (skill.isBuiltin) ...[
                              const SizedBox(width: 6),
                              _StatusBadge(
                                label: '内置',
                                color: theme.colorScheme.secondaryContainer,
                                textColor:
                                    theme.colorScheme.onSecondaryContainer,
                              ),
                            ],
                            const SizedBox(width: 6),
                            ResourceSourceChip(
                              sourceKind: skill.sourceKind,
                              compact: true,
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  Icon(
                    Icons.chevron_right,
                    color: theme.colorScheme.onSurfaceVariant.withValues(
                      alpha: 0.5,
                    ),
                    size: 20,
                  ),
                ],
              ),
              if (skill.description != null &&
                  skill.description!.isNotEmpty) ...[
                const SizedBox(height: 8),
                Text(
                  skill.description!,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
              const SizedBox(height: 8),
              Row(
                children: [
                  Icon(
                    Icons.schedule,
                    size: 14,
                    color: theme.colorScheme.onSurfaceVariant.withValues(
                      alpha: 0.6,
                    ),
                  ),
                  const SizedBox(width: 4),
                  Text(
                    _formatDate(skill.createdAt),
                    style: theme.textTheme.labelSmall?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant.withValues(
                        alpha: 0.6,
                      ),
                    ),
                  ),
                  if (skill.fileCount > 0) ...[
                    const SizedBox(width: 12),
                    Icon(
                      Icons.folder_outlined,
                      size: 14,
                      color: theme.colorScheme.onSurfaceVariant.withValues(
                        alpha: 0.6,
                      ),
                    ),
                    const SizedBox(width: 4),
                    Text(
                      '${skill.fileCount} 个文件',
                      style: theme.textTheme.labelSmall?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant.withValues(
                          alpha: 0.6,
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
  final String label;
  final Color color;
  final Color textColor;

  const _StatusBadge({
    required this.label,
    required this.color,
    required this.textColor,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        label,
        style: Theme.of(
          context,
        ).textTheme.labelSmall?.copyWith(color: textColor),
      ),
    );
  }
}
