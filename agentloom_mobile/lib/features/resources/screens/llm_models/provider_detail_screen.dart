import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/resources_api.dart';
import '../../models/resource_entities.dart';
import '../../widgets/llm_provider_icon.dart';
import '../../widgets/resource_shared.dart';
import 'edit_provider_sheet.dart';
import 'model_editor_sheet.dart';
import 'pricing_chips.dart';

class ProviderDetailScreen extends ConsumerStatefulWidget {
  const ProviderDetailScreen({super.key, required this.providerId});

  final String providerId;

  @override
  ConsumerState<ProviderDetailScreen> createState() =>
      _ProviderDetailScreenState();
}

class _ProviderDetailScreenState extends ConsumerState<ProviderDetailScreen> {
  late Future<_ProviderDetailData> _future;
  bool _isTesting = false;
  bool _isDiscovering = false;
  String? _connectionMessage;
  List<PrivateCloudModelInfoDto> _discoveredModels =
      const <PrivateCloudModelInfoDto>[];
  bool _changed = false;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<_ProviderDetailData> _load() async {
    final api = ref.read(resourcesApiProvider);
    final providerFuture = api.getLlmProviderEntity(widget.providerId);
    final modelsFuture = api.listLlmModelConfigs();
    List<ApiKeyInfoDto> apiKeys = const <ApiKeyInfoDto>[];
    try {
      apiKeys = await api.listApiKeys();
    } catch (_) {}
    final provider = await providerFuture;
    final allModels = await modelsFuture;
    final models = allModels
        .where((m) => m.providerId == provider.id)
        .toList(growable: false);
    return _ProviderDetailData(
      provider: provider,
      models: models,
      apiKeys: apiKeys,
    );
  }

  Future<void> _reload() async {
    setState(() {
      _future = _load();
    });
    await _future;
  }

  void _markChanged() {
    _changed = true;
  }

  Future<void> _testConnection(LlmProviderEntityDto provider) async {
    setState(() {
      _isTesting = true;
      _connectionMessage = null;
    });
    try {
      final result = await ref
          .read(resourcesApiProvider)
          .testLlmProviderConnection(provider.id);
      if (!mounted) return;
      final info = result.serverInfo;
      setState(() {
        _connectionMessage = info == null
            ? '连接成功, 耗时 ${result.latencyMs}ms'
            : '连接成功, 耗时 ${result.latencyMs}ms'
                  '${info.version == null ? '' : ' - 版本 ${info.version}'}'
                  '${info.status == null ? '' : ' - 状态 ${info.status}'}';
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _connectionMessage = describeResourceError(error);
      });
    } finally {
      if (mounted) setState(() => _isTesting = false);
    }
  }

  Future<void> _discoverModels(LlmProviderEntityDto provider) async {
    setState(() {
      _isDiscovering = true;
      _connectionMessage = null;
    });
    try {
      final models = await ref
          .read(resourcesApiProvider)
          .discoverLlmProviderModels(provider.id);
      if (!mounted) return;
      setState(() {
        _discoveredModels = models;
        _connectionMessage = '发现 ${models.length} 个模型';
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _connectionMessage = describeResourceError(error);
      });
    } finally {
      if (mounted) setState(() => _isDiscovering = false);
    }
  }

  Future<void> _resetBaseUrl(LlmProviderEntityDto provider) async {
    try {
      await ref.read(resourcesApiProvider).resetLlmProviderBaseUrl(provider.id);
      _markChanged();
      await _reload();
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Base URL 已恢复默认值')));
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(describeResourceError(error))));
    }
  }

  Future<void> _confirmDeleteProvider(LlmProviderEntityDto provider) async {
    if (provider.isBuiltin) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('内置提供商不可删除')));
      return;
    }
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('删除提供商'),
        content: Text('确认删除 ${provider.name} 吗? 其下所有模型配置也将被删除。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('删除'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await ref.read(resourcesApiProvider).deleteLlmProvider(provider.id);
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(describeResourceError(error))));
    }
  }

  Future<void> _openModelEditor(
    LlmProviderEntityDto provider,
    List<ApiKeyInfoDto> apiKeys, {
    LlmModelConfigDto? model,
  }) async {
    final changed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => ModelEditorSheet(
        provider: provider,
        apiKeys: apiKeys,
        initialModel: model,
      ),
    );
    if (changed == true) {
      _markChanged();
      await _reload();
    }
  }

  Future<void> _confirmDeleteModel(LlmModelConfigDto model) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('删除模型配置'),
        content: Text('确认删除 ${model.name} 吗?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('删除'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await ref.read(resourcesApiProvider).deleteLlmModelConfig(model.id);
      _markChanged();
      await _reload();
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('模型配置已删除')));
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(describeResourceError(error))));
    }
  }

  Future<void> _toggleModelEnabled(LlmModelConfigDto model, bool value) async {
    try {
      await ref
          .read(resourcesApiProvider)
          .updateLlmModelConfig(model.id, isEnabled: value);
      _markChanged();
      await _reload();
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(describeResourceError(error))));
    }
  }

  Future<void> _editProviderSettings(LlmProviderEntityDto provider) async {
    final changed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => EditProviderSheet(provider: provider),
    );
    if (changed == true) {
      _markChanged();
      await _reload();
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return PopScope(
      canPop: true,
      onPopInvokedWithResult: (didPop, _) {
        if (didPop && _changed) {
          Navigator.of(context).pop(true);
        }
      },
      child: FutureBuilder<_ProviderDetailData>(
        future: _future,
        builder: (context, snapshot) {
          final providerName = snapshot.data?.provider.name ?? '提供商详情';

          return Scaffold(
            appBar: AppBar(
              title: Text(providerName),
              leading: IconButton(
                icon: const Icon(Icons.arrow_back),
                onPressed: () => Navigator.of(context).pop(_changed),
              ),
              actions: [
                IconButton(
                  onPressed: () => unawaited(_reload()),
                  icon: const Icon(Icons.refresh),
                ),
              ],
            ),
            body: _buildBody(theme, snapshot),
            floatingActionButton: snapshot.hasData
                ? FloatingActionButton.extended(
                    onPressed: () => _openModelEditor(
                      snapshot.data!.provider,
                      snapshot.data!.apiKeys,
                    ),
                    icon: const Icon(Icons.add),
                    label: const Text('添加模型'),
                  )
                : null,
          );
        },
      ),
    );
  }

  Widget _buildBody(
    ThemeData theme,
    AsyncSnapshot<_ProviderDetailData> snapshot,
  ) {
    if (snapshot.connectionState != ConnectionState.done) {
      return const Center(child: CircularProgressIndicator());
    }
    if (snapshot.hasError) {
      return ResourceErrorState(
        message: '加载提供商详情失败: ${describeResourceError(snapshot.error!)}',
        onRetry: () => unawaited(_reload()),
      );
    }

    final data = snapshot.data!;
    final provider = data.provider;
    final models = data.models;

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 100),
      children: [
        // 提供商信息卡
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    LlmProviderIcon(
                      slug: provider.slug,
                      iconUrl: provider.iconUrl,
                      size: 32,
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            provider.name,
                            style: theme.textTheme.titleLarge,
                          ),
                          Text(
                            provider.slug,
                            style: theme.textTheme.bodySmall?.copyWith(
                              color: theme.colorScheme.onSurfaceVariant,
                            ),
                          ),
                        ],
                      ),
                    ),
                    if (provider.isBuiltin)
                      Chip(
                        label: const Text('内置'),
                        backgroundColor: theme.colorScheme.secondaryContainer,
                        visualDensity: VisualDensity.compact,
                      ),
                  ],
                ),
                const Divider(height: 24),
                ResourceMetadataRow(
                  label: 'API 协议',
                  value: provider.apiProtocol,
                ),
                ResourceMetadataRow(
                  label: 'Base URL',
                  value: provider.baseUrl ?? provider.defaultBaseUrl ?? '未配置',
                ),
                if (provider.defaultBaseUrl != null &&
                    provider.baseUrl != null &&
                    provider.baseUrl != provider.defaultBaseUrl)
                  ResourceMetadataRow(
                    label: '默认 URL',
                    value: provider.defaultBaseUrl!,
                  ),
                ResourceMetadataRow(
                  label: 'API Key',
                  value: provider.apiKeyId != null ? '已绑定' : '未配置',
                ),
                ResourceMetadataRow(
                  label: '创建时间',
                  value: formatDateTime(provider.createdAt),
                ),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 12,
                  runSpacing: 12,
                  children: [
                    FilledButton.tonalIcon(
                      onPressed: _isTesting
                          ? null
                          : () => _testConnection(provider),
                      icon: _isTesting
                          ? const SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.network_check_rounded),
                      label: const Text('测试连接'),
                    ),
                    FilledButton.tonalIcon(
                      onPressed: _isDiscovering
                          ? null
                          : () => _discoverModels(provider),
                      icon: _isDiscovering
                          ? const SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.cloud_download_outlined),
                      label: const Text('发现模型'),
                    ),
                    if (provider.baseUrl != null &&
                        provider.defaultBaseUrl != null &&
                        provider.baseUrl != provider.defaultBaseUrl)
                      OutlinedButton.icon(
                        onPressed: () => _resetBaseUrl(provider),
                        icon: const Icon(Icons.restore_rounded),
                        label: const Text('恢复默认 URL'),
                      ),
                    OutlinedButton.icon(
                      onPressed: () => _editProviderSettings(provider),
                      icon: const Icon(Icons.edit_outlined),
                      label: const Text('编辑'),
                    ),
                    if (!provider.isBuiltin)
                      OutlinedButton.icon(
                        onPressed: () => _confirmDeleteProvider(provider),
                        icon: const Icon(Icons.delete_outline),
                        label: const Text('删除'),
                      ),
                  ],
                ),
                if (_connectionMessage != null) ...[
                  const SizedBox(height: 12),
                  Text(_connectionMessage!, style: theme.textTheme.bodySmall),
                ],
              ],
            ),
          ),
        ),

        // 发现的远端模型
        if (_discoveredModels.isNotEmpty) ...[
          const SizedBox(height: 16),
          Text('远端可用模型', style: theme.textTheme.titleMedium),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final dm in _discoveredModels.take(20))
                ActionChip(
                  label: Text(dm.name),
                  onPressed: () => _openModelEditor(
                    provider,
                    data.apiKeys,
                    model: LlmModelConfigDto(
                      id: '',
                      orgId: '',
                      tenantId: '',
                      providerId: provider.id,
                      name: dm.name,
                      modelId: dm.id,
                      modelType: 'chat',
                      isEnabled: true,
                      isDefault: false,
                      capabilities: const ModelCapabilitiesDto(),
                      parameters: const <String, dynamic>{},
                      createdAt: '',
                      updatedAt: '',
                    ),
                  ),
                ),
            ],
          ),
        ],

        // 模型列表
        const SizedBox(height: 24),
        Row(
          children: [
            Text('模型配置', style: theme.textTheme.titleMedium),
            const SizedBox(width: 8),
            Text(
              '${models.length}',
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),

        if (models.isEmpty)
          const ResourceEmptyState(
            icon: Icons.hub_outlined,
            title: '暂无模型配置',
            description: '点击下方按钮添加模型配置，或通过「发现模型」自动获取。',
          )
        else
          for (final model in models) ...[
            Card(
              child: ListTile(
                contentPadding: const EdgeInsets.all(12),
                title: Row(
                  children: [
                    Expanded(child: Text(model.name)),
                    if (model.isDefault)
                      Icon(
                        Icons.star_rounded,
                        size: 18,
                        color: theme.colorScheme.primary,
                      ),
                  ],
                ),
                subtitle: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const SizedBox(height: 4),
                    Text(
                      model.modelId,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: [
                        Chip(
                          label: Text(model.modelType),
                          visualDensity: VisualDensity.compact,
                        ),
                        if (model.capabilities.vision)
                          const Chip(
                            label: Text('视觉'),
                            visualDensity: VisualDensity.compact,
                          ),
                        if (model.capabilities.functionCalling)
                          const Chip(
                            label: Text('工具调用'),
                            visualDensity: VisualDensity.compact,
                          ),
                        if (model.capabilities.reasoning)
                          const Chip(
                            label: Text('推理'),
                            visualDensity: VisualDensity.compact,
                          ),
                        if (model.capabilities.structuredOutput)
                          const Chip(
                            label: Text('结构化输出'),
                            visualDensity: VisualDensity.compact,
                          ),
                        if (model.pricing != null)
                          ...buildPricingChips(model.pricing!),
                      ],
                    ),
                  ],
                ),
                trailing: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Switch(
                      value: model.isEnabled,
                      onChanged: (value) => _toggleModelEnabled(model, value),
                    ),
                    PopupMenuButton<String>(
                      onSelected: (action) {
                        switch (action) {
                          case 'edit':
                            _openModelEditor(
                              provider,
                              data.apiKeys,
                              model: model,
                            );
                          case 'delete':
                            _confirmDeleteModel(model);
                        }
                      },
                      itemBuilder: (_) => [
                        const PopupMenuItem(
                          value: 'edit',
                          child: ListTile(
                            leading: Icon(Icons.edit_outlined),
                            title: Text('编辑'),
                            dense: true,
                          ),
                        ),
                        const PopupMenuItem(
                          value: 'delete',
                          child: ListTile(
                            leading: Icon(Icons.delete_outline),
                            title: Text('删除'),
                            dense: true,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 8),
          ],
      ],
    );
  }
}

class _ProviderDetailData {
  const _ProviderDetailData({
    required this.provider,
    required this.models,
    required this.apiKeys,
  });

  final LlmProviderEntityDto provider;
  final List<LlmModelConfigDto> models;
  final List<ApiKeyInfoDto> apiKeys;
}
