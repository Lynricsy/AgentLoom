import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../api/skill_api.dart';
import '../models/skill_dto.dart';
import '../providers/skill_provider.dart';

/// Skill 编辑页面 — 仅编辑 name + description (移动端不支持 SKILL.md 编辑)
class SkillEditScreen extends ConsumerStatefulWidget {
  final String skillId;

  const SkillEditScreen({super.key, required this.skillId});

  @override
  ConsumerState<SkillEditScreen> createState() => _SkillEditScreenState();
}

class _SkillEditScreenState extends ConsumerState<SkillEditScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _descriptionController = TextEditingController();

  bool _isLoading = false;
  bool _isInitialized = false;
  int _occVersion = 0;

  @override
  void dispose() {
    _nameController.dispose();
    _descriptionController.dispose();
    super.dispose();
  }

  void _initFromSkill(SkillDto skill) {
    if (_isInitialized) return;
    _nameController.text = skill.name;
    _descriptionController.text = skill.description ?? '';
    _occVersion = skill.version;
    _isInitialized = true;
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_isLoading) return;

    setState(() => _isLoading = true);

    try {
      await ref
          .read(skillApiProvider)
          .updateSkill(
            widget.skillId,
            name: _nameController.text.trim(),
            description: _descriptionController.text.trim(),
            occVersion: _occVersion,
          );

      // 刷新详情和列表缓存
      ref.invalidate(skillDetailProvider(widget.skillId));
      ref.invalidate(skillListProvider);

      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Skill updated')));
        context.pop();
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isLoading = false);
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Failed to update: $e')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final detailAsync = ref.watch(skillDetailProvider(widget.skillId));

    // 兼容 Riverpod 3.x AsyncLoading(error:...) 中间状态
    if (detailAsync.hasError && !detailAsync.hasValue) {
      return Scaffold(
        appBar: AppBar(title: const Text('Edit Skill')),
        body: Center(
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
              FilledButton.tonal(
                onPressed: () =>
                    ref.invalidate(skillDetailProvider(widget.skillId)),
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
      );
    }

    return detailAsync.when(
      loading: () => Scaffold(
        appBar: AppBar(title: const Text('Edit Skill')),
        body: const Center(child: CircularProgressIndicator()),
      ),
      error: (error, _) => Scaffold(
        appBar: AppBar(title: const Text('Edit Skill')),
        body: Center(
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
              FilledButton.tonal(
                onPressed: () =>
                    ref.invalidate(skillDetailProvider(widget.skillId)),
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
      ),
      data: (skill) {
        _initFromSkill(skill);

        return Scaffold(
          appBar: AppBar(
            title: const Text('Edit Skill'),
            actions: [
              TextButton(
                onPressed: _isLoading ? null : _submit,
                child: _isLoading
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Text('Save'),
              ),
            ],
          ),
          body: Form(
            key: _formKey,
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                // 只读提示
                if (skill.isBuiltin)
                  Container(
                    padding: const EdgeInsets.all(12),
                    margin: const EdgeInsets.only(bottom: 16),
                    decoration: BoxDecoration(
                      color: theme.colorScheme.errorContainer,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Row(
                      children: [
                        Icon(
                          Icons.warning_amber_rounded,
                          color: theme.colorScheme.onErrorContainer,
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            'Built-in skills cannot be edited',
                            style: theme.textTheme.bodyMedium?.copyWith(
                              color: theme.colorScheme.onErrorContainer,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),

                // Name 字段
                TextFormField(
                  controller: _nameController,
                  enabled: !skill.isBuiltin && !_isLoading,
                  decoration: const InputDecoration(
                    labelText: 'Name',
                    hintText: 'Enter skill name',
                    border: OutlineInputBorder(),
                  ),
                  validator: (value) {
                    if (value == null || value.trim().isEmpty) {
                      return 'Name is required';
                    }
                    if (value.trim().length < 2) {
                      return 'Name must be at least 2 characters';
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 16),

                // Description 字段
                TextFormField(
                  controller: _descriptionController,
                  enabled: !skill.isBuiltin && !_isLoading,
                  maxLines: 4,
                  decoration: const InputDecoration(
                    labelText: 'Description',
                    hintText: 'Enter skill description',
                    border: OutlineInputBorder(),
                    alignLabelWithHint: true,
                  ),
                ),
                const SizedBox(height: 24),

                // 元数据信息 (只读)
                Text(
                  'Metadata',
                  style: theme.textTheme.titleSmall?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
                const SizedBox(height: 8),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      children: [
                        _InfoRow(label: 'Slug', value: skill.slug),
                        const Divider(height: 16),
                        _InfoRow(
                          label: 'Status',
                          value:
                              skill.status[0].toUpperCase() +
                              skill.status.substring(1),
                        ),
                        const Divider(height: 16),
                        _InfoRow(label: 'Version', value: '${skill.version}'),
                        const Divider(height: 16),
                        _InfoRow(
                          label: 'Type',
                          value: skill.isBuiltin ? 'Built-in' : 'Custom',
                        ),
                      ],
                    ),
                  ),
                ),

                const SizedBox(height: 16),
                Text(
                  'Note: SKILL.md content and file uploads can only be managed on desktop.',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                    fontStyle: FontStyle.italic,
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _InfoRow extends StatelessWidget {
  final String label;
  final String value;

  const _InfoRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      children: [
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
