import 'package:flutter/material.dart';

import '../models/skill_listing_dto.dart';
import 'skill_rating_bar.dart';

/// Skill 卡片（列表页用）
class SkillCard extends StatelessWidget {
  final SkillListingDto skill;
  final VoidCallback? onTap;

  const SkillCard({super.key, required this.skill, this.onTap});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final rating = double.tryParse(skill.avgRating ?? '0') ?? 0.0;

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
                  // 图标容器
                  Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(
                      color: theme.colorScheme.tertiaryContainer,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Icon(
                      Icons.extension,
                      color: theme.colorScheme.onTertiaryContainer,
                      size: 22,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          skill.title,
                          style: theme.textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.w600,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 2),
                        Row(
                          children: [
                            if (skill.category != null)
                              _SkillCategoryChip(category: skill.category!),
                            if (skill.category != null)
                              const SizedBox(width: 6),
                            _SkillPricingChip(
                              pricingModel: skill.pricingModel,
                              price: skill.pricePerExecution,
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              if (skill.summary != null && skill.summary!.isNotEmpty) ...[
                const SizedBox(height: 8),
                Text(
                  skill.summary!,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ],

              // 标签
              if (skill.tags.isNotEmpty) ...[
                const SizedBox(height: 8),
                Wrap(
                  spacing: 4,
                  runSpacing: 4,
                  children: skill.tags
                      .take(3)
                      .map(
                        (tag) => Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 6,
                            vertical: 2,
                          ),
                          decoration: BoxDecoration(
                            color: theme.colorScheme.surfaceContainerHighest,
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Text(
                            tag,
                            style: theme.textTheme.labelSmall?.copyWith(
                              color: theme.colorScheme.onSurfaceVariant,
                            ),
                          ),
                        ),
                      )
                      .toList(),
                ),
              ],

              const SizedBox(height: 12),
              // 底部元数据行
              Row(
                children: [
                  SkillRatingBar(
                    rating: rating,
                    reviewCount: skill.reviewCount,
                    starSize: 14,
                  ),
                  const Spacer(),
                  Icon(
                    Icons.download_outlined,
                    size: 14,
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                  const SizedBox(width: 4),
                  Text(
                    _formatUseCount(skill.useCount),
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                  if (skill.author?.displayName != null) ...[
                    const SizedBox(width: 12),
                    Icon(
                      Icons.person_outline,
                      size: 14,
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                    const SizedBox(width: 4),
                    Flexible(
                      child: Text(
                        skill.author!.displayName!,
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
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

  String _formatUseCount(int count) {
    if (count >= 1000000) return '${(count / 1000000).toStringAsFixed(1)}M';
    if (count >= 1000) return '${(count / 1000).toStringAsFixed(1)}K';
    return '$count';
  }
}

/// 分类标签
class _SkillCategoryChip extends StatelessWidget {
  final String category;

  const _SkillCategoryChip({required this.category});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: theme.colorScheme.secondaryContainer,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        category[0].toUpperCase() + category.substring(1),
        style: theme.textTheme.labelSmall?.copyWith(
          color: theme.colorScheme.onSecondaryContainer,
        ),
      ),
    );
  }
}

/// 定价标签
class _SkillPricingChip extends StatelessWidget {
  final String? pricingModel;
  final double? price;

  const _SkillPricingChip({this.pricingModel, this.price});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isFree = pricingModel == null || pricingModel == 'free';

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: isFree
            ? theme.colorScheme.primaryContainer
            : theme.colorScheme.tertiaryContainer,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        isFree ? 'Free' : '\$${price?.toStringAsFixed(2) ?? '0.00'}/run',
        style: theme.textTheme.labelSmall?.copyWith(
          color: isFree
              ? theme.colorScheme.onPrimaryContainer
              : theme.colorScheme.onTertiaryContainer,
        ),
      ),
    );
  }
}
