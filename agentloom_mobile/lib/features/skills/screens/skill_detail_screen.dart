import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/skill_api.dart';
import '../models/skill_listing_dto.dart';
import '../models/skill_review_dto.dart';
import '../providers/skill_provider.dart';
import '../widgets/skill_rating_bar.dart';

/// Skill 详情页面
class SkillDetailScreen extends ConsumerWidget {
  final String skillId;

  const SkillDetailScreen({super.key, required this.skillId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final detailAsync = ref.watch(skillDetailProvider(skillId));

    return Scaffold(
      appBar: AppBar(title: const Text('Skill Detail')),
      body: detailAsync.when(
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
              Text('Failed to load skill', style: theme.textTheme.titleMedium),
              const SizedBox(height: 8),
              TextButton(
                onPressed: () => ref.invalidate(skillDetailProvider(skillId)),
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
        data: (skill) => _SkillDetailContent(skill: skill, skillId: skillId),
      ),
    );
  }
}

/// Skill 详情内容
class _SkillDetailContent extends ConsumerStatefulWidget {
  final SkillListingDto skill;
  final String skillId;

  const _SkillDetailContent({required this.skill, required this.skillId});

  @override
  ConsumerState<_SkillDetailContent> createState() =>
      _SkillDetailContentState();
}

class _SkillDetailContentState extends ConsumerState<_SkillDetailContent> {
  bool _isInstalling = false;
  List<SkillReviewDto>? _reviews;
  bool _isLoadingReviews = false;

  @override
  void initState() {
    super.initState();
    _loadReviews();
  }

  Future<void> _loadReviews() async {
    setState(() => _isLoadingReviews = true);
    try {
      final api = ref.read(skillApiProvider);
      final reviews = await api.getSkillReviews(widget.skillId);
      if (!mounted) return;
      setState(() {
        _reviews = reviews;
        _isLoadingReviews = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _isLoadingReviews = false);
    }
  }

  Future<void> _installSkill() async {
    setState(() => _isInstalling = true);
    try {
      final api = ref.read(skillApiProvider);
      final result = await api.installSkill(widget.skillId);
      if (!mounted) return;
      setState(() => _isInstalling = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(result.message ?? 'Skill installed successfully'),
          behavior: SnackBarBehavior.floating,
        ),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() => _isInstalling = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Install failed: $e'),
          behavior: SnackBarBehavior.floating,
          backgroundColor: Theme.of(context).colorScheme.error,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final skill = widget.skill;
    final rating = double.tryParse(skill.avgRating ?? '0') ?? 0.0;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // 头部信息
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 56,
                height: 56,
                decoration: BoxDecoration(
                  color: theme.colorScheme.tertiaryContainer,
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Icon(
                  Icons.extension,
                  color: theme.colorScheme.onTertiaryContainer,
                  size: 28,
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      skill.title,
                      style: theme.textTheme.headlineSmall?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 4),
                    if (skill.author?.displayName != null)
                      Text(
                        'by ${skill.author!.displayName}',
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                      ),
                    const SizedBox(height: 8),
                    SkillRatingBar(
                      rating: rating,
                      reviewCount: skill.reviewCount,
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),

          // 安装按钮
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: _isInstalling ? null : _installSkill,
              icon: _isInstalling
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Icon(Icons.download),
              label: Text(_isInstalling ? 'Installing...' : 'Install'),
            ),
          ),
          const SizedBox(height: 24),

          // 元数据卡片
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  _MetadataRow(
                    icon: Icons.category_outlined,
                    label: 'Category',
                    value: skill.category != null
                        ? skill.category![0].toUpperCase() +
                              skill.category!.substring(1)
                        : 'N/A',
                  ),
                  const SizedBox(height: 12),
                  _MetadataRow(
                    icon: Icons.attach_money,
                    label: 'Pricing',
                    value:
                        skill.pricingModel == 'free' ||
                            skill.pricingModel == null
                        ? 'Free'
                        : '\$${skill.pricePerExecution?.toStringAsFixed(2) ?? '0.00'} per execution',
                  ),
                  const SizedBox(height: 12),
                  _MetadataRow(
                    icon: Icons.download_outlined,
                    label: 'Installs',
                    value: '${skill.useCount}',
                  ),
                  if (skill.plugin?.version != null) ...[
                    const SizedBox(height: 12),
                    _MetadataRow(
                      icon: Icons.tag,
                      label: 'Version',
                      value: skill.plugin!.version!,
                    ),
                  ],
                  if (skill.plugin?.license != null) ...[
                    const SizedBox(height: 12),
                    _MetadataRow(
                      icon: Icons.gavel_outlined,
                      label: 'License',
                      value: skill.plugin!.license!,
                    ),
                  ],
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),

          // 描述
          if (skill.summary != null && skill.summary!.isNotEmpty) ...[
            Text(
              'Description',
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              skill.summary!,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 16),
          ],

          // 插件详细描述
          if (skill.plugin?.description != null &&
              skill.plugin!.description!.isNotEmpty) ...[
            Text(
              'About',
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              skill.plugin!.description!,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 16),
          ],

          // 标签
          if (skill.tags.isNotEmpty) ...[
            Text(
              'Tags',
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: skill.tags
                  .map(
                    (tag) => Chip(
                      label: Text(tag),
                      labelStyle: theme.textTheme.bodySmall,
                      materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      visualDensity: VisualDensity.compact,
                    ),
                  )
                  .toList(),
            ),
            const SizedBox(height: 16),
          ],

          // 评价区
          Text(
            'Reviews',
            style: theme.textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 8),
          if (_isLoadingReviews)
            const Center(
              child: Padding(
                padding: EdgeInsets.all(16),
                child: CircularProgressIndicator(),
              ),
            )
          else if (_reviews == null || _reviews!.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 16),
              child: Center(
                child: Text(
                  'No reviews yet',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
              ),
            )
          else
            ..._reviews!.map((review) => _ReviewCard(review: review)),
        ],
      ),
    );
  }
}

/// 元数据行
class _MetadataRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;

  const _MetadataRow({
    required this.icon,
    required this.label,
    required this.value,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      children: [
        Icon(icon, size: 18, color: theme.colorScheme.onSurfaceVariant),
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

/// 评价卡片
class _ReviewCard extends StatelessWidget {
  final SkillReviewDto review;

  const _ReviewCard({required this.review});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                SkillRatingBar(
                  rating: review.rating.toDouble(),
                  showCount: false,
                  starSize: 14,
                ),
                const Spacer(),
                if (review.createdAt != null)
                  Text(
                    _formatDate(review.createdAt!),
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
              ],
            ),
            if (review.content != null && review.content!.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(review.content!, style: theme.textTheme.bodyMedium),
            ],
          ],
        ),
      ),
    );
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
}
