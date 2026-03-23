import 'package:flutter/material.dart';

/// 星级评分展示组件
class SkillRatingBar extends StatelessWidget {
  final double rating;
  final int reviewCount;
  final double starSize;
  final bool showCount;

  const SkillRatingBar({
    super.key,
    required this.rating,
    this.reviewCount = 0,
    this.starSize = 16,
    this.showCount = true,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        ...List.generate(5, (index) {
          final starValue = index + 1;
          if (rating >= starValue) {
            return Icon(Icons.star, size: starSize, color: Colors.amber);
          } else if (rating >= starValue - 0.5) {
            return Icon(Icons.star_half, size: starSize, color: Colors.amber);
          } else {
            return Icon(
              Icons.star_border,
              size: starSize,
              color: Colors.amber.withValues(alpha: 0.5),
            );
          }
        }),
        if (showCount) ...[
          const SizedBox(width: 4),
          Text(
            rating.toStringAsFixed(1),
            style: theme.textTheme.bodySmall?.copyWith(
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(width: 2),
          Text(
            '($reviewCount)',
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
        ],
      ],
    );
  }
}
