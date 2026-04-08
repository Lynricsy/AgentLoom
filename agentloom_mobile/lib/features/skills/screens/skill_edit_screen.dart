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
        ).showSnackBar(const SnackBar(content: Text('技能已更新')));
        context.pop();
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isLoading = false);
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('更新失败: $e')));
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
        appBar: AppBar(title: const Text('编辑技能')),
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
              Text('加载技能失败', style: theme.textTheme.titleMedium),
              const SizedBox(height: 8),
              FilledButton.tonal(
                onPressed: () =>
                    ref.invalidate(skillDetailProvider(widget.skillId)),
                child: const Text('重试'),
              ),
            ],
          ),
        ),
      );
    }

    return detailAsync.when(
      loading: () => Scaffold(
        appBar: AppBar(title: const Text('编辑技能')),
        body: const Center(child: CircularProgressIndicator()),
      ),
      error: (error, _) => Scaffold(
        appBar: AppBar(title: const Text('编辑技能')),
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
              Text('加载技能失败', style: theme.textTheme.titleMedium),
              const SizedBox(height: 8),
              FilledButton.tonal(
                onPressed: () =>
                    ref.invalidate(skillDetailProvider(widget.skillId)),
                child: const Text('重试'),
              ),
            ],
          ),
        ),
      ),
      data: (skill) {
        _initFromSkill(skill);

        return Scaffold(
          appBar: AppBar(
            title: const Text('编辑技能'),
            actions: [
              TextButton(
                onPressed: _isLoading ? null : _submit,
                child: _isLoading
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Text('保存'),
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
                            '内置技能不可编辑',
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
                    labelText: '名称',
                    hintText: '输入技能名称',
                    border: OutlineInputBorder(),
                  ),
                  validator: (value) {
                    if (value == null || value.trim().isEmpty) {
                      return '名称为必填项';
                    }
                    if (value.trim().length < 2) {
                      return '名称至少需要2个字符';
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
                    labelText: '描述',
                    hintText: '输入技能描述',
                    border: OutlineInputBorder(),
                    alignLabelWithHint: true,
                  ),
                ),
                const SizedBox(height: 24),

                // 元数据信息 (只读)
                Text(
                  '元数据',
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
                          label: '状态',
                          value:
                              skill.status[0].toUpperCase() +
                              skill.status.substring(1),
                        ),
                        const Divider(height: 16),
                        _InfoRow(label: '版本', value: '${skill.version}'),
                        const Divider(height: 16),
                        _InfoRow(
                          label: '类型',
                          value: skill.isBuiltin ? '内置' : '自定义',
                        ),
                      ],
                    ),
                  ),
                ),

                const SizedBox(height: 16),
                Text(
                  'SKILL.md 内容与文件上传仅可在桌面端管理。',
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
