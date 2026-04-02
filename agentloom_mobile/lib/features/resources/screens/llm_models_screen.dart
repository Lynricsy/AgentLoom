import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/resources_api.dart';
import '../models/resource_entities.dart';
import '../widgets/resource_shared.dart';

// ==========================================================================
// 主屏: LLM 提供商列表
// ==========================================================================

class LlmModelsScreen extends ConsumerStatefulWidget {
  const LlmModelsScreen({super.key});

  @override
  ConsumerState<LlmModelsScreen> createState() => _LlmModelsScreenState();
}

class _LlmModelsScreenState extends ConsumerState<LlmModelsScreen> {
  final _searchController = TextEditingController();
  late Future<_ProviderScreenData> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<_ProviderScreenData> _load() async {
    final api = ref.read(resourcesApiProvider);
    final providersFuture = api.listLlmProviderEntities();
    final modelsFuture = api.listLlmModelConfigs();
    return _ProviderScreenData(
      providers: await providersFuture,
      models: await modelsFuture,
    );
  }

  Future<void> _reload() async {
    setState(() {
      _future = _load();
    });
    await _future;
  }

  List<LlmProviderEntityDto> _applyFilter(List<LlmProviderEntityDto> items) {
    final query = _searchController.text.trim().toLowerCase();
    if (query.isEmpty) {
      return items;
    }
    return items
        .where(
          (p) =>
              p.name.toLowerCase().contains(query) ||
              p.slug.toLowerCase().contains(query),
        )
        .toList(growable: false);
  }

  int _modelCountFor(String providerId, List<LlmModelConfigDto> models) {
    return models.where((m) => m.providerId == providerId).length;
  }

  Future<void> _openProviderDetail(
    LlmProviderEntityDto provider,
    List<LlmModelConfigDto> models,
  ) async {
    final changed = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => _ProviderDetailScreen(
          providerId: provider.id,
        ),
      ),
    );
    if (changed == true) {
      await _reload();
    }
  }

  Future<void> _toggleProviderEnabled(
    LlmProviderEntityDto provider,
    bool value,
  ) async {
    try {
      await ref.read(resourcesApiProvider).updateLlmProvider(
            provider.id,
            isEnabled: value,
          );
      await _reload();
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(describeResourceError(error))),
      );
    }
  }

  Future<void> _openCreateProvider() async {
    final changed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => const _CreateProviderSheet(),
    );
    if (changed == true) {
      await _reload();
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('LLM 提供商'),
        actions: [
          IconButton(
            onPressed: () => unawaited(_reload()),
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: FutureBuilder<_ProviderScreenData>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return ResourceErrorState(
              message: '加载提供商列表失败: ${describeResourceError(snapshot.error!)}',
              onRetry: () => unawaited(_reload()),
            );
          }

          final data = snapshot.data!;
          final filtered = _applyFilter(data.providers);

          return Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 12, 20, 8),
                child: SearchBar(
                  controller: _searchController,
                  hintText: '搜索提供商名称或标识',
                  leading: const Icon(Icons.search),
                  trailing: [
                    IconButton(
                      onPressed: () {
                        _searchController.clear();
                        setState(() {});
                      },
                      icon: const Icon(Icons.close),
                    ),
                  ],
                  onChanged: (_) => setState(() {}),
                ),
              ),
              Expanded(
                child: filtered.isEmpty
                    ? RefreshIndicator(
                        onRefresh: _reload,
                        child: ListView(
                          children: const [
                            SizedBox(height: 80),
                            ResourceEmptyState(
                              icon: Icons.hub_outlined,
                              title: '暂无 LLM 提供商',
                              description:
                                  '系统会自动同步内置提供商，也可以手动添加自定义提供商。',
                            ),
                          ],
                        ),
                      )
                    : RefreshIndicator(
                        onRefresh: _reload,
                        child: ListView.separated(
                          padding: const EdgeInsets.fromLTRB(20, 12, 20, 100),
                          itemCount: filtered.length,
                          separatorBuilder: (_, __) =>
                              const SizedBox(height: 12),
                          itemBuilder: (context, index) {
                            final provider = filtered[index];
                            final modelCount = _modelCountFor(
                              provider.id,
                              data.models,
                            );
                            return Card(
                              child: ListTile(
                                contentPadding: const EdgeInsets.all(16),
                                leading: _ProviderIcon(slug: provider.slug),
                                title: Text(provider.name),
                                subtitle: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    const SizedBox(height: 4),
                                    Text(provider.slug),
                                    const SizedBox(height: 8),
                                    Wrap(
                                      spacing: 8,
                                      runSpacing: 8,
                                      children: [
                                        Chip(
                                          label: Text(provider.apiProtocol),
                                          visualDensity: VisualDensity.compact,
                                        ),
                                        if (provider.isBuiltin)
                                          Chip(
                                            label: const Text('内置'),
                                            visualDensity:
                                                VisualDensity.compact,
                                            backgroundColor: theme.colorScheme
                                                .secondaryContainer,
                                          ),
                                        Chip(
                                          label: Text('$modelCount 个模型'),
                                          visualDensity: VisualDensity.compact,
                                        ),
                                        if (provider.apiKeyId != null)
                                          Chip(
                                            label: const Text('已绑定密钥'),
                                            visualDensity:
                                                VisualDensity.compact,
                                            backgroundColor:
                                                theme.colorScheme.tertiaryContainer,
                                          ),
                                      ],
                                    ),
                                  ],
                                ),
                                trailing: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Switch(
                                      value: provider.isEnabled,
                                      onChanged: (value) =>
                                          _toggleProviderEnabled(
                                        provider,
                                        value,
                                      ),
                                    ),
                                    const Icon(Icons.chevron_right_rounded),
                                  ],
                                ),
                                onTap: () => _openProviderDetail(
                                  provider,
                                  data.models,
                                ),
                              ),
                            );
                          },
                        ),
                      ),
              ),
            ],
          );
        },
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _openCreateProvider,
        icon: const Icon(Icons.add),
        label: const Text('添加提供商'),
      ),
    );
  }
}

// ==========================================================================
// 提供商详情页
// ==========================================================================

class _ProviderDetailScreen extends ConsumerStatefulWidget {
  const _ProviderDetailScreen({required this.providerId});

  final String providerId;

  @override
  ConsumerState<_ProviderDetailScreen> createState() =>
      _ProviderDetailScreenState();
}

class _ProviderDetailScreenState
    extends ConsumerState<_ProviderDetailScreen> {
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
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Base URL 已恢复默认值')),
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(describeResourceError(error))),
      );
    }
  }

  Future<void> _confirmDeleteProvider(LlmProviderEntityDto provider) async {
    if (provider.isBuiltin) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('内置提供商不可删除')),
      );
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
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(describeResourceError(error))),
      );
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
      builder: (_) => _ModelEditorSheet(
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
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('模型配置已删除')),
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(describeResourceError(error))),
      );
    }
  }

  Future<void> _toggleModelEnabled(LlmModelConfigDto model, bool value) async {
    try {
      await ref.read(resourcesApiProvider).updateLlmModelConfig(
            model.id,
            isEnabled: value,
          );
      _markChanged();
      await _reload();
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(describeResourceError(error))),
      );
    }
  }

  Future<void> _editProviderSettings(
    LlmProviderEntityDto provider,
    List<ApiKeyInfoDto> apiKeys,
  ) async {
    final changed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => _EditProviderSheet(
        provider: provider,
        apiKeys: apiKeys,
      ),
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
          final providerName =
              snapshot.data?.provider.name ?? '提供商详情';

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

  Widget _buildBody(ThemeData theme, AsyncSnapshot<_ProviderDetailData> snapshot) {
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
                    _ProviderIcon(slug: provider.slug, size: 32),
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
                  value: provider.baseUrl ??
                      provider.defaultBaseUrl ??
                      '未配置',
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
                              child:
                                  CircularProgressIndicator(strokeWidth: 2),
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
                              child:
                                  CircularProgressIndicator(strokeWidth: 2),
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
                      onPressed: () => _editProviderSettings(
                        provider,
                        data.apiKeys,
                      ),
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
                  Text(
                    _connectionMessage!,
                    style: theme.textTheme.bodySmall,
                  ),
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
                            label: Text('Vision'),
                            visualDensity: VisualDensity.compact,
                          ),
                        if (model.capabilities.functionCalling)
                          const Chip(
                            label: Text('Tool Call'),
                            visualDensity: VisualDensity.compact,
                          ),
                        if (model.capabilities.reasoning)
                          const Chip(
                            label: Text('Reasoning'),
                            visualDensity: VisualDensity.compact,
                          ),
                        if (model.capabilities.structuredOutput)
                          const Chip(
                            label: Text('Structured'),
                            visualDensity: VisualDensity.compact,
                          ),
                        if (model.pricing != null)
                          Chip(
                            label: Text(
                              '\$${model.pricing!.inputPer1MTokens.toStringAsFixed(2)} / 1M',
                            ),
                            visualDensity: VisualDensity.compact,
                          ),
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

// ==========================================================================
// 创建自定义提供商 Sheet
// ==========================================================================

class _CreateProviderSheet extends ConsumerStatefulWidget {
  const _CreateProviderSheet();

  @override
  ConsumerState<_CreateProviderSheet> createState() =>
      _CreateProviderSheetState();
}

class _CreateProviderSheetState extends ConsumerState<_CreateProviderSheet> {
  final _nameController = TextEditingController();
  final _slugController = TextEditingController();
  final _baseUrlController = TextEditingController();
  String _apiProtocol = 'openai_chat';
  bool _isSaving = false;
  String? _errorMessage;

  @override
  void dispose() {
    _nameController.dispose();
    _slugController.dispose();
    _baseUrlController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final name = _nameController.text.trim();
    final baseUrl = _baseUrlController.text.trim();
    if (name.isEmpty) {
      setState(() => _errorMessage = '请填写提供商名称');
      return;
    }
    if (baseUrl.isEmpty) {
      setState(() => _errorMessage = '请填写 Base URL');
      return;
    }

    setState(() {
      _isSaving = true;
      _errorMessage = null;
    });

    try {
      final slug = _slugController.text.trim();
      await ref.read(resourcesApiProvider).createLlmProvider(
            name: name,
            baseUrl: baseUrl,
            slug: slug.isNotEmpty ? slug : null,
            apiProtocol: _apiProtocol,
          );
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } catch (error) {
      if (!mounted) return;
      setState(() => _errorMessage = describeResourceError(error));
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final viewInsets = MediaQuery.of(context).viewInsets.bottom;

    return Padding(
      padding: EdgeInsets.fromLTRB(20, 12, 20, 24 + viewInsets),
      child: ListView(
        shrinkWrap: true,
        children: [
          Text('添加自定义提供商', style: theme.textTheme.headlineSmall),
          const SizedBox(height: 20),
          TextField(
            controller: _nameController,
            decoration: const InputDecoration(labelText: '提供商名称'),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _slugController,
            decoration: const InputDecoration(
              labelText: '标识 (slug)',
              helperText: '留空则自动生成, 仅小写字母/数字/连字符',
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _baseUrlController,
            decoration: const InputDecoration(
              labelText: 'Base URL',
              hintText: 'https://api.example.com',
            ),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: _apiProtocol,
            decoration: const InputDecoration(labelText: 'API 协议'),
            items: llmApiProtocols
                .map(
                  (p) => DropdownMenuItem(value: p, child: Text(p)),
                )
                .toList(growable: false),
            onChanged: (value) {
              setState(() {
                _apiProtocol = value ?? _apiProtocol;
              });
            },
          ),
          if (_errorMessage != null) ...[
            const SizedBox(height: 12),
            Text(
              _errorMessage!,
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.error,
              ),
            ),
          ],
          const SizedBox(height: 20),
          FilledButton.icon(
            onPressed: _isSaving ? null : _save,
            icon: _isSaving
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.save_outlined),
            label: const Text('创建'),
          ),
        ],
      ),
    );
  }
}

// ==========================================================================
// 编辑提供商设置 Sheet
// ==========================================================================

class _EditProviderSheet extends ConsumerStatefulWidget {
  const _EditProviderSheet({
    required this.provider,
    required this.apiKeys,
  });

  final LlmProviderEntityDto provider;
  final List<ApiKeyInfoDto> apiKeys;

  @override
  ConsumerState<_EditProviderSheet> createState() =>
      _EditProviderSheetState();
}

class _EditProviderSheetState extends ConsumerState<_EditProviderSheet> {
  late final TextEditingController _nameController;
  late final TextEditingController _baseUrlController;
  late String _apiProtocol;
  String? _selectedApiKeyId;
  late bool _isEnabled;
  bool _isSaving = false;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _nameController = TextEditingController(text: widget.provider.name);
    _baseUrlController = TextEditingController(
      text: widget.provider.baseUrl ?? widget.provider.defaultBaseUrl ?? '',
    );
    _apiProtocol = widget.provider.apiProtocol;
    _selectedApiKeyId = widget.provider.apiKeyId;
    _isEnabled = widget.provider.isEnabled;
  }

  @override
  void dispose() {
    _nameController.dispose();
    _baseUrlController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final name = _nameController.text.trim();
    if (name.isEmpty) {
      setState(() => _errorMessage = '请填写提供商名称');
      return;
    }

    setState(() {
      _isSaving = true;
      _errorMessage = null;
    });

    try {
      final baseUrlText = _baseUrlController.text.trim();
      await ref.read(resourcesApiProvider).updateLlmProvider(
            widget.provider.id,
            name: name,
            baseUrl: baseUrlText.isEmpty ? null : baseUrlText,
            clearBaseUrl: baseUrlText.isEmpty,
            apiProtocol: _apiProtocol,
            apiKeyId: _selectedApiKeyId,
            clearApiKeyId: _selectedApiKeyId == null,
            isEnabled: _isEnabled,
          );
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } catch (error) {
      if (!mounted) return;
      setState(() => _errorMessage = describeResourceError(error));
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final viewInsets = MediaQuery.of(context).viewInsets.bottom;

    return Padding(
      padding: EdgeInsets.fromLTRB(20, 12, 20, 24 + viewInsets),
      child: ListView(
        shrinkWrap: true,
        children: [
          Text('编辑提供商', style: theme.textTheme.headlineSmall),
          const SizedBox(height: 20),
          TextField(
            controller: _nameController,
            decoration: const InputDecoration(labelText: '提供商名称'),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _baseUrlController,
            decoration: InputDecoration(
              labelText: 'Base URL',
              helperText: widget.provider.defaultBaseUrl != null
                  ? '默认: ${widget.provider.defaultBaseUrl}'
                  : null,
            ),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: _apiProtocol,
            decoration: const InputDecoration(labelText: 'API 协议'),
            items: llmApiProtocols
                .map(
                  (p) => DropdownMenuItem(value: p, child: Text(p)),
                )
                .toList(growable: false),
            onChanged: (value) {
              setState(() {
                _apiProtocol = value ?? _apiProtocol;
              });
            },
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String?>(
            initialValue: _selectedApiKeyId,
            decoration: const InputDecoration(labelText: 'API Key'),
            items: [
              const DropdownMenuItem<String?>(
                value: null,
                child: Text('不绑定'),
              ),
              ...widget.apiKeys
                  .where((k) => k.status == 'active')
                  .map(
                    (k) => DropdownMenuItem<String?>(
                      value: k.id,
                      child: Text('${k.label} (${k.keyPreview})'),
                    ),
                  ),
            ],
            onChanged: (value) {
              setState(() => _selectedApiKeyId = value);
            },
          ),
          const SizedBox(height: 12),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('启用'),
            value: _isEnabled,
            onChanged: (value) => setState(() => _isEnabled = value),
          ),
          if (_errorMessage != null) ...[
            const SizedBox(height: 12),
            Text(
              _errorMessage!,
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.error,
              ),
            ),
          ],
          const SizedBox(height: 20),
          FilledButton.icon(
            onPressed: _isSaving ? null : _save,
            icon: _isSaving
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.save_outlined),
            label: const Text('保存'),
          ),
        ],
      ),
    );
  }
}

// ==========================================================================
// 模型编辑器 Sheet
// ==========================================================================

class _ModelEditorSheet extends ConsumerStatefulWidget {
  const _ModelEditorSheet({
    required this.provider,
    required this.apiKeys,
    this.initialModel,
  });

  final LlmProviderEntityDto provider;
  final List<ApiKeyInfoDto> apiKeys;
  final LlmModelConfigDto? initialModel;

  bool get isEditing => initialModel != null && initialModel!.id.isNotEmpty;

  @override
  ConsumerState<_ModelEditorSheet> createState() => _ModelEditorSheetState();
}

class _ModelEditorSheetState extends ConsumerState<_ModelEditorSheet> {
  late final TextEditingController _nameController;
  late final TextEditingController _modelIdController;
  late final TextEditingController _contextWindowController;
  late final TextEditingController _maxOutputTokensController;
  late final TextEditingController _inputPricingController;
  late final TextEditingController _outputPricingController;
  late final TextEditingController _temperatureController;
  late final TextEditingController _maxTokensController;
  late final TextEditingController _embeddingDimensionsController;
  late final TextEditingController _timeoutMsController;
  late String _modelType;
  late bool _isDefault;
  late bool _isEnabled;
  late bool _vision;
  late bool _functionCalling;
  late bool _reasoning;
  late bool _structuredOutput;
  bool _isSaving = false;
  bool _isLookingUp = false;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    final m = widget.initialModel;
    _nameController = TextEditingController(text: m?.name ?? '');
    _modelIdController = TextEditingController(text: m?.modelId ?? '');
    _contextWindowController = TextEditingController(
      text: m?.contextWindow?.toString() ?? '',
    );
    _maxOutputTokensController = TextEditingController(
      text: m?.maxOutputTokens?.toString() ?? '',
    );
    _inputPricingController = TextEditingController(
      text: m?.pricing?.inputPer1MTokens.toStringAsFixed(4) ?? '',
    );
    _outputPricingController = TextEditingController(
      text: m?.pricing?.outputPer1MTokens.toStringAsFixed(4) ?? '',
    );
    final params = m?.parameters ?? const <String, dynamic>{};
    _temperatureController = TextEditingController(
      text: params['temperature']?.toString() ?? '0.7',
    );
    _maxTokensController = TextEditingController(
      text: params['maxTokens']?.toString() ?? '',
    );
    _embeddingDimensionsController = TextEditingController(
      text: m?.embeddingDimensions?.toString() ?? '',
    );
    _timeoutMsController = TextEditingController(
      text: m?.timeoutMs?.toString() ?? '',
    );
    _modelType = m?.modelType ?? 'chat';
    _isDefault = m?.isDefault ?? false;
    _isEnabled = m?.isEnabled ?? true;
    _vision = m?.capabilities.vision ?? false;
    _functionCalling = m?.capabilities.functionCalling ?? false;
    _reasoning = m?.capabilities.reasoning ?? false;
    _structuredOutput = m?.capabilities.structuredOutput ?? false;
  }

  @override
  void dispose() {
    _nameController.dispose();
    _modelIdController.dispose();
    _contextWindowController.dispose();
    _maxOutputTokensController.dispose();
    _inputPricingController.dispose();
    _outputPricingController.dispose();
    _temperatureController.dispose();
    _maxTokensController.dispose();
    _embeddingDimensionsController.dispose();
    _timeoutMsController.dispose();
    super.dispose();
  }

  Future<void> _lookupMetadata() async {
    final modelId = _modelIdController.text.trim();
    if (modelId.isEmpty) return;

    setState(() {
      _isLookingUp = true;
      _errorMessage = null;
    });

    try {
      final info = await ref.read(resourcesApiProvider).lookupModelMetadata(
            widget.provider.slug,
            modelId,
          );
      if (!mounted) return;
      if (info == null) {
        setState(() => _errorMessage = '未找到该模型的元数据');
        return;
      }
      setState(() {
        if (info.contextWindow != null) {
          _contextWindowController.text = info.contextWindow.toString();
        }
        if (info.maxOutputTokens != null) {
          _maxOutputTokensController.text = info.maxOutputTokens.toString();
        }
        if (info.pricing != null) {
          _inputPricingController.text =
              info.pricing!.inputPer1MTokens.toStringAsFixed(4);
          _outputPricingController.text =
              info.pricing!.outputPer1MTokens.toStringAsFixed(4);
        }
        _vision = info.capabilities.vision;
        _functionCalling = info.capabilities.functionCalling;
        _reasoning = info.capabilities.reasoning;
        _structuredOutput = info.capabilities.structuredOutput;
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('已自动填充模型元数据')),
        );
      }
    } catch (error) {
      if (!mounted) return;
      setState(() => _errorMessage = describeResourceError(error));
    } finally {
      if (mounted) setState(() => _isLookingUp = false);
    }
  }

  Future<void> _save() async {
    final name = _nameController.text.trim();
    final modelId = _modelIdController.text.trim();
    if (name.isEmpty) {
      setState(() => _errorMessage = '请填写配置名称');
      return;
    }
    if (modelId.isEmpty) {
      setState(() => _errorMessage = '请填写模型 ID');
      return;
    }
    if (_modelType == 'embedding' &&
        int.tryParse(_embeddingDimensionsController.text.trim()) == null) {
      setState(() => _errorMessage = 'Embedding 模型必须填写向量维度');
      return;
    }

    setState(() {
      _isSaving = true;
      _errorMessage = null;
    });

    final capabilities = ModelCapabilitiesDto(
      vision: _vision,
      functionCalling: _functionCalling,
      reasoning: _reasoning,
      structuredOutput: _structuredOutput,
    );
    final inputPricing =
        double.tryParse(_inputPricingController.text.trim());
    final outputPricing =
        double.tryParse(_outputPricingController.text.trim());
    final pricing = inputPricing != null || outputPricing != null
        ? ModelPricingDto(
            inputPer1MTokens: inputPricing ?? 0,
            outputPer1MTokens: outputPricing ?? 0,
          )
        : null;
    final parameters = <String, dynamic>{};
    final temp = double.tryParse(_temperatureController.text.trim());
    if (temp != null) parameters['temperature'] = temp;
    final maxTokens = int.tryParse(_maxTokensController.text.trim());
    if (maxTokens != null) parameters['maxTokens'] = maxTokens;

    try {
      final api = ref.read(resourcesApiProvider);
      if (widget.isEditing) {
        await api.updateLlmModelConfig(
          widget.initialModel!.id,
          name: name,
          modelId: modelId,
          modelType: _modelType,
          isDefault: _isDefault,
          isEnabled: _isEnabled,
          capabilities: capabilities,
          contextWindow: int.tryParse(
            _contextWindowController.text.trim(),
          ),
          clearContextWindow:
              _contextWindowController.text.trim().isEmpty,
          maxOutputTokens: int.tryParse(
            _maxOutputTokensController.text.trim(),
          ),
          clearMaxOutputTokens:
              _maxOutputTokensController.text.trim().isEmpty,
          pricing: pricing,
          clearPricing: pricing == null,
          parameters: parameters,
          embeddingDimensions: _modelType == 'embedding'
              ? int.tryParse(_embeddingDimensionsController.text.trim())
              : null,
          clearEmbeddingDimensions: _modelType != 'embedding',
          timeoutMs: int.tryParse(_timeoutMsController.text.trim()),
          clearTimeoutMs: _timeoutMsController.text.trim().isEmpty,
        );
      } else {
        await api.createLlmModelConfig(
          name: name,
          providerId: widget.provider.id,
          modelId: modelId,
          modelType: _modelType,
          isDefault: _isDefault,
          isEnabled: _isEnabled,
          capabilities: capabilities,
          contextWindow: int.tryParse(
            _contextWindowController.text.trim(),
          ),
          maxOutputTokens: int.tryParse(
            _maxOutputTokensController.text.trim(),
          ),
          pricing: pricing,
          parameters: parameters.isNotEmpty ? parameters : null,
          embeddingDimensions: _modelType == 'embedding'
              ? int.tryParse(_embeddingDimensionsController.text.trim())
              : null,
          timeoutMs: int.tryParse(_timeoutMsController.text.trim()),
        );
      }
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } catch (error) {
      if (!mounted) return;
      setState(() => _errorMessage = describeResourceError(error));
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final viewInsets = MediaQuery.of(context).viewInsets.bottom;

    return Padding(
      padding: EdgeInsets.fromLTRB(20, 12, 20, 24 + viewInsets),
      child: ListView(
        shrinkWrap: true,
        children: [
          Text(
            widget.isEditing ? '编辑模型配置' : '新建模型配置',
            style: theme.textTheme.headlineSmall,
          ),
          const SizedBox(height: 4),
          Text(
            '提供商: ${widget.provider.name}',
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
          const SizedBox(height: 20),
          TextField(
            controller: _nameController,
            decoration: const InputDecoration(labelText: '配置名称'),
          ),
          const SizedBox(height: 12),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                child: TextField(
                  controller: _modelIdController,
                  decoration: const InputDecoration(
                    labelText: '模型 ID',
                    hintText: 'gpt-4o, claude-3-opus 等',
                  ),
                ),
              ),
              const SizedBox(width: 8),
              IconButton.filledTonal(
                onPressed: _isLookingUp ? null : _lookupMetadata,
                icon: _isLookingUp
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.auto_fix_high_rounded),
                tooltip: '自动填充元数据',
              ),
            ],
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: _modelType,
            decoration: const InputDecoration(labelText: '模型类型'),
            items: llmModelTypes
                .map(
                  (t) => DropdownMenuItem(value: t, child: Text(t)),
                )
                .toList(growable: false),
            onChanged: (value) {
              setState(() => _modelType = value ?? _modelType);
            },
          ),
          const SizedBox(height: 16),
          Text('模型能力', style: theme.textTheme.titleSmall),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 0,
            children: [
              FilterChip(
                label: const Text('Vision'),
                selected: _vision,
                onSelected: (v) => setState(() => _vision = v),
              ),
              FilterChip(
                label: const Text('Function Calling'),
                selected: _functionCalling,
                onSelected: (v) => setState(() => _functionCalling = v),
              ),
              FilterChip(
                label: const Text('Reasoning'),
                selected: _reasoning,
                onSelected: (v) => setState(() => _reasoning = v),
              ),
              FilterChip(
                label: const Text('Structured Output'),
                selected: _structuredOutput,
                onSelected: (v) => setState(() => _structuredOutput = v),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Text('上下文与输出', style: theme.textTheme.titleSmall),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _contextWindowController,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    labelText: '上下文窗口',
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: TextField(
                  controller: _maxOutputTokensController,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    labelText: '最大输出 tokens',
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Text('定价 (USD / 1M tokens)', style: theme.textTheme.titleSmall),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _inputPricingController,
                  keyboardType:
                      const TextInputType.numberWithOptions(decimal: true),
                  decoration: const InputDecoration(labelText: '输入'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: TextField(
                  controller: _outputPricingController,
                  keyboardType:
                      const TextInputType.numberWithOptions(decimal: true),
                  decoration: const InputDecoration(labelText: '输出'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Text('推理参数', style: theme.textTheme.titleSmall),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _temperatureController,
                  keyboardType:
                      const TextInputType.numberWithOptions(decimal: true),
                  decoration: const InputDecoration(
                    labelText: 'Temperature',
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: TextField(
                  controller: _maxTokensController,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    labelText: 'Max Tokens',
                  ),
                ),
              ),
            ],
          ),
          if (_modelType == 'embedding') ...[
            const SizedBox(height: 12),
            TextField(
              controller: _embeddingDimensionsController,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: '向量维度'),
            ),
          ],
          const SizedBox(height: 12),
          TextField(
            controller: _timeoutMsController,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(labelText: '超时 (ms)'),
          ),
          const SizedBox(height: 12),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('启用'),
            value: _isEnabled,
            onChanged: (v) => setState(() => _isEnabled = v),
          ),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('设为默认'),
            subtitle: const Text('同类型模型只能有一个默认'),
            value: _isDefault,
            onChanged: (v) => setState(() => _isDefault = v),
          ),
          if (_errorMessage != null) ...[
            const SizedBox(height: 12),
            Text(
              _errorMessage!,
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.error,
              ),
            ),
          ],
          const SizedBox(height: 20),
          FilledButton.icon(
            onPressed: _isSaving ? null : _save,
            icon: _isSaving
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.save_outlined),
            label: Text(widget.isEditing ? '保存修改' : '创建配置'),
          ),
        ],
      ),
    );
  }
}

// ==========================================================================
// 提供商图标组件 (Lobehub icons)
// ==========================================================================

class _ProviderIcon extends StatelessWidget {
  const _ProviderIcon({required this.slug, this.size = 24});

  final String slug;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Image.network(
      'https://icons.lobehub.com/icons/$slug/color.svg',
      width: size,
      height: size,
      errorBuilder: (_, __, ___) => Icon(
        _fallbackIcon(slug),
        size: size,
      ),
    );
  }

  static IconData _fallbackIcon(String slug) {
    switch (slug) {
      case 'openai':
        return Icons.auto_awesome_rounded;
      case 'anthropic':
        return Icons.psychology_alt_rounded;
      case 'google':
        return Icons.token_rounded;
      case 'deepseek':
        return Icons.explore_rounded;
      default:
        return Icons.hub_rounded;
    }
  }
}

// ==========================================================================
// 内部数据类
// ==========================================================================

class _ProviderScreenData {
  const _ProviderScreenData({
    required this.providers,
    required this.models,
  });

  final List<LlmProviderEntityDto> providers;
  final List<LlmModelConfigDto> models;
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
