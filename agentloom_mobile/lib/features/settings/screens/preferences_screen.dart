import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../resources/api/resources_api.dart';
import '../../resources/models/resource_entities.dart';
import '../api/settings_api.dart';

/// 个人偏好设置页面
class PreferencesScreen extends ConsumerStatefulWidget {
  const PreferencesScreen({super.key});

  @override
  ConsumerState<PreferencesScreen> createState() => _PreferencesScreenState();
}

class _PreferencesScreenState extends ConsumerState<PreferencesScreen> {
  bool _loading = true;
  String? _errorMessage;
  UserPreferenceDto? _preference;
  List<LlmModelInfoDto> _chatModels = [];
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() {
      _loading = true;
      _errorMessage = null;
    });
    try {
      final settingsApi = ref.read(settingsApiProvider);
      final resourcesApi = ref.read(resourcesApiProvider);

      final results = await Future.wait([
        settingsApi.getUserPreferences(),
        resourcesApi.listLlmModels(),
      ]);

      final pref = results[0] as UserPreferenceDto;
      final allModels = results[1] as List<LlmModelInfoDto>;
      final chatModels =
          allModels.where((m) => m.modelType == 'chat').toList();

      if (mounted) {
        setState(() {
          _preference = pref;
          _chatModels = chatModels;
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _errorMessage = e.toString();
          _loading = false;
        });
      }
    }
  }

  Future<void> _updateTitleModel(String? modelId) async {
    setState(() => _saving = true);
    try {
      final settingsApi = ref.read(settingsApiProvider);
      final updated = await settingsApi.updateUserPreferences(
        titleModelConfigId: modelId,
      );
      if (!mounted) return;
      setState(() {
        _preference = updated;
        _saving = false;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('偏好设置已保存')),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() => _saving = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('保存失败: $e')),
      );
    }
  }

  void _showModelPicker() {
    final defaultModel =
        _chatModels.where((m) => m.isDefault).firstOrNull;
    final defaultLabel =
        defaultModel != null ? '使用组织默认（${defaultModel.name}）' : '使用组织默认';

    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (sheetContext) {
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
                child: Row(
                  children: [
                    Text(
                      '选择标题生成模型',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                  ],
                ),
              ),
              const Divider(height: 1),
              ListTile(
                leading: const Icon(Icons.auto_awesome_outlined),
                title: Text(defaultLabel),
                trailing: _preference?.titleModelConfigId == null
                    ? const Icon(Icons.check_rounded)
                    : null,
                onTap: () {
                  Navigator.of(sheetContext).pop();
                  _updateTitleModel(null);
                },
              ),
              ..._chatModels.map((model) {
                final selected =
                    _preference?.titleModelConfigId == model.id;
                return ListTile(
                  leading: const Icon(Icons.smart_toy_outlined),
                  title: Text(model.name),
                  subtitle: Text(model.provider),
                  trailing: selected
                      ? const Icon(Icons.check_rounded)
                      : null,
                  onTap: () {
                    Navigator.of(sheetContext).pop();
                    _updateTitleModel(model.id);
                  },
                );
              }),
              const SizedBox(height: 8),
            ],
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('个人偏好'),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _errorMessage != null
              ? _buildErrorView(theme)
              : _buildContent(theme),
    );
  }

  Widget _buildErrorView(ThemeData theme) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.error_outline, size: 48, color: theme.colorScheme.error),
          const SizedBox(height: 16),
          Text('加载失败: $_errorMessage'),
          const SizedBox(height: 16),
          OutlinedButton(
            onPressed: _loadData,
            child: const Text('重试'),
          ),
        ],
      ),
    );
  }

  Widget _buildContent(ThemeData theme) {
    final selectedModel = _preference?.titleModelConfigId != null
        ? _chatModels
            .where((m) => m.id == _preference!.titleModelConfigId)
            .firstOrNull
        : null;
    final defaultModel =
        _chatModels.where((m) => m.isDefault).firstOrNull;
    final defaultLabel =
        defaultModel != null ? '使用组织默认（${defaultModel.name}）' : '使用组织默认';
    final currentLabel = selectedModel?.name ?? defaultLabel;

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
      children: [
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('AI 行为偏好', style: theme.textTheme.titleMedium),
            const SizedBox(height: 4),
            Text(
              '为特定 AI 功能单独指定模型。',
              style: theme.textTheme.bodySmall,
            ),
          ],
        ),
        const SizedBox(height: 12),
        Card(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4),
            child: ListTile(
              leading: const Icon(Icons.title_rounded),
              title: const Text('标题生成模型'),
              subtitle: Text(
                currentLabel,
                style: theme.textTheme.bodySmall,
              ),
              trailing: _saving
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.chevron_right_rounded),
              onTap: _saving ? null : _showModelPicker,
            ),
          ),
        ),
      ],
    );
  }
}
