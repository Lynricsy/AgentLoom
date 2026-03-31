import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/resources_api.dart';
import '../models/resource_entities.dart';
import '../widgets/resource_shared.dart';

class LlmModelsScreen extends ConsumerStatefulWidget {
  const LlmModelsScreen({super.key});

  @override
  ConsumerState<LlmModelsScreen> createState() => _LlmModelsScreenState();
}

class _LlmModelsScreenState extends ConsumerState<LlmModelsScreen> {
  final _searchController = TextEditingController();
  String? _providerFilter;
  String? _modelTypeFilter;
  late Future<_LlmScreenData> _future;

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

  Future<_LlmScreenData> _load() async {
    final api = ref.read(resourcesApiProvider);
    final modelsFuture = api.listLlmModels();
    final providersFuture = api.listLlmProviders();
    List<ApiKeyInfoDto> apiKeys = const <ApiKeyInfoDto>[];

    try {
      apiKeys = await api.listApiKeys();
    } catch (_) {
      apiKeys = const <ApiKeyInfoDto>[];
    }

    return _LlmScreenData(
      models: await modelsFuture,
      providers: await providersFuture,
      apiKeys: apiKeys,
    );
  }

  Future<void> _reload() async {
    setState(() {
      _future = _load();
    });
    await _future;
  }

  Future<void> _openEditor(
    _LlmScreenData lookups, {
    LlmModelInfoDto? model,
  }) async {
    final changed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (context) {
        return _LlmEditorSheet(
          providers: lookups.providers,
          apiKeys: lookups.apiKeys,
          initialModel: model,
        );
      },
    );

    if (changed == true) {
      await _reload();
    }
  }

  Future<void> _openDetail(
    _LlmScreenData lookups,
    LlmModelInfoDto model,
  ) async {
    final changed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (context) {
        return _LlmModelDetailSheet(
          model: model,
          providers: lookups.providers,
          apiKeys: lookups.apiKeys,
          onChanged: _reload,
        );
      },
    );

    if (changed == true) {
      await _reload();
    }
  }

  List<LlmModelInfoDto> _applyFilters(List<LlmModelInfoDto> items) {
    final query = _searchController.text.trim().toLowerCase();

    return items
        .where((item) {
          final matchesQuery =
              query.isEmpty ||
              item.name.toLowerCase().contains(query) ||
              item.modelName.toLowerCase().contains(query) ||
              item.provider.toLowerCase().contains(query);
          final matchesProvider =
              _providerFilter == null || item.provider == _providerFilter;
          final matchesType =
              _modelTypeFilter == null || item.modelType == _modelTypeFilter;

          return matchesQuery && matchesProvider && matchesType;
        })
        .toList(growable: false);
  }

  void _applyProviderFilter(String? value) {
    setState(() {
      _providerFilter = value;
    });
  }

  void _applyModelTypeFilter(String? value) {
    setState(() {
      _modelTypeFilter = value;
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('LLM Models'),
        actions: [
          IconButton(
            onPressed: () => unawaited(_reload()),
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: FutureBuilder<_LlmScreenData>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return ResourceErrorState(
              message: '加载模型配置失败：${describeResourceError(snapshot.error!)}',
              onRetry: () => unawaited(_reload()),
            );
          }

          final lookups = snapshot.data!;
          final filteredItems = _applyFilters(lookups.models);

          return Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 12, 20, 8),
                child: SearchBar(
                  controller: _searchController,
                  hintText: '搜索模型名称、provider 或配置名',
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
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 4, 20, 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Provider', style: theme.textTheme.labelLarge),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        _FilterChip(
                          label: '全部',
                          selected: _providerFilter == null,
                          onSelected: () => _applyProviderFilter(null),
                        ),
                        for (final provider in lookups.providers)
                          _FilterChip(
                            label: provider.id,
                            selected: _providerFilter == provider.id,
                            onSelected: () => _applyProviderFilter(provider.id),
                          ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Text('类型', style: theme.textTheme.labelLarge),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        _FilterChip(
                          label: '全部',
                          selected: _modelTypeFilter == null,
                          onSelected: () => _applyModelTypeFilter(null),
                        ),
                        for (final modelType in llmModelTypes)
                          _FilterChip(
                            label: modelType,
                            selected: _modelTypeFilter == modelType,
                            onSelected: () => _applyModelTypeFilter(modelType),
                          ),
                      ],
                    ),
                  ],
                ),
              ),
              Expanded(
                child: filteredItems.isEmpty
                    ? RefreshIndicator(
                        onRefresh: _reload,
                        child: ListView(
                          children: const [
                            SizedBox(height: 80),
                            ResourceEmptyState(
                              icon: Icons.hub_outlined,
                              title: '还没有模型配置',
                              description:
                                  '可以先创建一个 Chat 或 Embedding 配置，后续供 Agent、Workflow 和知识库复用。',
                            ),
                          ],
                        ),
                      )
                    : RefreshIndicator(
                        onRefresh: _reload,
                        child: ListView.separated(
                          padding: const EdgeInsets.fromLTRB(20, 12, 20, 100),
                          itemCount: filteredItems.length,
                          separatorBuilder: (_, _) =>
                              const SizedBox(height: 12),
                          itemBuilder: (context, index) {
                            final model = filteredItems[index];
                            return Card(
                              child: ListTile(
                                contentPadding: const EdgeInsets.all(16),
                                leading: Icon(_providerIcon(model.provider)),
                                title: Text(model.name),
                                subtitle: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    const SizedBox(height: 4),
                                    Text(
                                      '${model.provider} · ${model.modelName}',
                                    ),
                                    const SizedBox(height: 8),
                                    Wrap(
                                      spacing: 8,
                                      runSpacing: 8,
                                      children: [
                                        Chip(
                                          label: Text(model.modelType),
                                          visualDensity: VisualDensity.compact,
                                        ),
                                        if (model.isDefault)
                                          const Chip(
                                            label: Text('默认'),
                                            visualDensity:
                                                VisualDensity.compact,
                                          ),
                                        if (model.apiKeyId != null)
                                          const Chip(
                                            label: Text('绑定 API Key'),
                                            visualDensity:
                                                VisualDensity.compact,
                                          ),
                                        if (model.provider == 'private_cloud')
                                          const Chip(
                                            label: Text('私有云'),
                                            visualDensity:
                                                VisualDensity.compact,
                                          ),
                                      ],
                                    ),
                                  ],
                                ),
                                trailing: const Icon(
                                  Icons.chevron_right_rounded,
                                ),
                                onTap: () => _openDetail(lookups, model),
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
      floatingActionButton: FutureBuilder<_LlmScreenData>(
        future: _future,
        builder: (context, snapshot) {
          return FloatingActionButton.extended(
            onPressed: snapshot.hasData
                ? () => _openEditor(snapshot.data!)
                : null,
            icon: const Icon(Icons.add),
            label: const Text('新建'),
          );
        },
      ),
    );
  }
}

class _LlmModelDetailSheet extends ConsumerStatefulWidget {
  const _LlmModelDetailSheet({
    required this.model,
    required this.providers,
    required this.apiKeys,
    required this.onChanged,
  });

  final LlmModelInfoDto model;
  final List<LlmProviderInfoDto> providers;
  final List<ApiKeyInfoDto> apiKeys;
  final Future<void> Function() onChanged;

  @override
  ConsumerState<_LlmModelDetailSheet> createState() =>
      _LlmModelDetailSheetState();
}

class _LlmModelDetailSheetState extends ConsumerState<_LlmModelDetailSheet> {
  late Future<LlmModelInfoDto> _future;
  bool _isTesting = false;
  bool _isFetchingModels = false;
  String? _remoteInfoMessage;
  List<PrivateCloudModelInfoDto> _remoteModels =
      const <PrivateCloudModelInfoDto>[];

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<LlmModelInfoDto> _load() {
    return ref.read(resourcesApiProvider).getLlmModel(widget.model.id);
  }

  Future<void> _reload() async {
    setState(() {
      _future = _load();
    });
    await _future;
    await widget.onChanged();
  }

  Future<void> _openEditor(LlmModelInfoDto detail) async {
    final changed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (context) {
        return _LlmEditorSheet(
          providers: widget.providers,
          apiKeys: widget.apiKeys,
          initialModel: detail,
        );
      },
    );

    if (changed == true) {
      await _reload();
    }
  }

  Future<void> _confirmDelete(LlmModelInfoDto detail) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('删除模型配置'),
        content: Text('确认删除 ${detail.name} 吗？'),
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

    if (confirmed != true) {
      return;
    }

    try {
      await ref.read(resourcesApiProvider).deleteLlmModel(detail.id);
      if (!mounted) {
        return;
      }
      Navigator.of(context).pop(true);
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('模型配置已删除')));
      await widget.onChanged();
    } catch (error) {
      if (!mounted) {
        return;
      }
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(describeResourceError(error))));
    }
  }

  Future<void> _testPrivateCloud(LlmModelInfoDto detail) async {
    if (detail.endpointUrl == null || detail.authMethod == null) {
      return;
    }

    setState(() {
      _isTesting = true;
      _remoteInfoMessage = null;
    });

    try {
      final result = await ref
          .read(resourcesApiProvider)
          .testPrivateCloudConnection(
            endpointUrl: detail.endpointUrl!,
            authMethod: detail.authMethod!,
            apiKeyId: detail.apiKeyId,
            timeoutMs: detail.timeoutMs,
          );
      if (!mounted) {
        return;
      }
      setState(() {
        final serverInfo = result.serverInfo;
        _remoteInfoMessage = serverInfo == null
            ? '连接成功，耗时 ${result.latencyMs}ms'
            : '连接成功，耗时 ${result.latencyMs}ms'
                  '${serverInfo.version == null ? '' : ' · 版本 ${serverInfo.version}'}'
                  '${serverInfo.status == null ? '' : ' · 状态 ${serverInfo.status}'}';
      });
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _remoteInfoMessage = describeResourceError(error);
      });
    } finally {
      if (mounted) {
        setState(() {
          _isTesting = false;
        });
      }
    }
  }

  Future<void> _fetchPrivateCloudModels(LlmModelInfoDto detail) async {
    if (detail.endpointUrl == null || detail.authMethod == null) {
      return;
    }

    setState(() {
      _isFetchingModels = true;
      _remoteInfoMessage = null;
    });

    try {
      final models = await ref
          .read(resourcesApiProvider)
          .fetchPrivateCloudModels(
            endpointUrl: detail.endpointUrl!,
            authMethod: detail.authMethod!,
            apiKeyId: detail.apiKeyId,
          );
      if (!mounted) {
        return;
      }
      setState(() {
        _remoteModels = models;
        _remoteInfoMessage = '拉取到 ${models.length} 个远端模型';
      });
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _remoteInfoMessage = describeResourceError(error);
      });
    } finally {
      if (mounted) {
        setState(() {
          _isFetchingModels = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return FutureBuilder<LlmModelInfoDto>(
      future: _future,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const Center(child: CircularProgressIndicator());
        }
        if (snapshot.hasError) {
          return Padding(
            padding: const EdgeInsets.fromLTRB(20, 24, 20, 24),
            child: ResourceErrorState(
              message: '加载模型详情失败：${describeResourceError(snapshot.error!)}',
              onRetry: () => unawaited(_reload()),
            ),
          );
        }

        final detail = snapshot.data!;
        final providerInfo = widget.providers
            .where((provider) => provider.id == detail.provider)
            .firstOrNull;
        final apiKey = widget.apiKeys
            .where((key) => key.id == detail.apiKeyId)
            .firstOrNull;

        return Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
          child: ListView(
            shrinkWrap: true,
            children: [
              Text(detail.name, style: theme.textTheme.headlineSmall),
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  Chip(label: Text(detail.provider)),
                  Chip(label: Text(detail.modelType)),
                  if (detail.isDefault) const Chip(label: Text('默认')),
                ],
              ),
              const SizedBox(height: 16),
              ResourceMetadataRow(label: '模型名', value: detail.modelName),
              ResourceMetadataRow(
                label: 'Provider',
                value: providerInfo?.name ?? detail.provider,
              ),
              ResourceMetadataRow(
                label: 'API Key',
                value: apiKey == null
                    ? '未绑定'
                    : '${apiKey.label} (${apiKey.keyPreview})',
              ),
              if (detail.embeddingDimensions != null)
                ResourceMetadataRow(
                  label: '向量维度',
                  value: '${detail.embeddingDimensions}',
                ),
              if (detail.endpointUrl != null)
                ResourceMetadataRow(label: '端点', value: detail.endpointUrl!),
              if (detail.authMethod != null)
                ResourceMetadataRow(label: '认证', value: detail.authMethod!),
              if (detail.timeoutMs != null)
                ResourceMetadataRow(
                  label: '超时',
                  value: '${detail.timeoutMs}ms',
                ),
              ResourceMetadataRow(
                label: '创建时间',
                value: formatDateTime(detail.createdAt),
              ),
              ResourceMetadataRow(
                label: '更新时间',
                value: formatDateTime(detail.updatedAt),
              ),
              const SizedBox(height: 16),
              JsonCodePanel(label: '参数', data: detail.parameters.toJson()),
              if (detail.authConfig != null) ...[
                const SizedBox(height: 16),
                JsonCodePanel(label: '认证配置', data: detail.authConfig),
              ],
              const SizedBox(height: 20),
              Wrap(
                spacing: 12,
                runSpacing: 12,
                children: [
                  if (detail.provider == 'private_cloud' &&
                      detail.endpointUrl != null &&
                      detail.authMethod != null)
                    FilledButton.tonalIcon(
                      onPressed: _isTesting
                          ? null
                          : () => _testPrivateCloud(detail),
                      icon: _isTesting
                          ? const SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.network_check_rounded),
                      label: const Text('测试连接'),
                    ),
                  if (detail.provider == 'private_cloud' &&
                      detail.endpointUrl != null &&
                      detail.authMethod != null)
                    FilledButton.tonalIcon(
                      onPressed: _isFetchingModels
                          ? null
                          : () => _fetchPrivateCloudModels(detail),
                      icon: _isFetchingModels
                          ? const SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.cloud_download_outlined),
                      label: const Text('拉取模型'),
                    ),
                  OutlinedButton.icon(
                    onPressed: () => _openEditor(detail),
                    icon: const Icon(Icons.edit_outlined),
                    label: const Text('编辑'),
                  ),
                  OutlinedButton.icon(
                    onPressed: () => _confirmDelete(detail),
                    icon: const Icon(Icons.delete_outline),
                    label: const Text('删除'),
                  ),
                ],
              ),
              if (_remoteInfoMessage != null) ...[
                const SizedBox(height: 16),
                Text(_remoteInfoMessage!, style: theme.textTheme.bodySmall),
              ],
              if (_remoteModels.isNotEmpty) ...[
                const SizedBox(height: 16),
                Text('远端模型', style: theme.textTheme.titleMedium),
                const SizedBox(height: 12),
                for (final remoteModel in _remoteModels) ...[
                  Card(
                    child: ListTile(
                      leading: const Icon(Icons.cloud_queue_rounded),
                      title: Text(remoteModel.name),
                      subtitle: Text(remoteModel.ownedBy ?? 'unknown'),
                    ),
                  ),
                  const SizedBox(height: 8),
                ],
              ],
            ],
          ),
        );
      },
    );
  }
}

class _LlmEditorSheet extends ConsumerStatefulWidget {
  const _LlmEditorSheet({
    required this.providers,
    required this.apiKeys,
    this.initialModel,
  });

  final List<LlmProviderInfoDto> providers;
  final List<ApiKeyInfoDto> apiKeys;
  final LlmModelInfoDto? initialModel;

  bool get isEditing => initialModel != null;

  @override
  ConsumerState<_LlmEditorSheet> createState() => _LlmEditorSheetState();
}

class _LlmEditorSheetState extends ConsumerState<_LlmEditorSheet> {
  late final TextEditingController _nameController;
  late final TextEditingController _modelNameController;
  late final TextEditingController _temperatureController;
  late final TextEditingController _maxTokensController;
  late final TextEditingController _topPController;
  late final TextEditingController _frequencyPenaltyController;
  late final TextEditingController _presencePenaltyController;
  late final TextEditingController _stopController;
  late final TextEditingController _embeddingDimensionsController;
  late final TextEditingController _endpointUrlController;
  late final TextEditingController _timeoutMsController;
  late String _provider;
  late String _modelType;
  late bool _isDefault;
  String? _authMethod;
  String? _selectedApiKeyId;
  Map<String, dynamic>? _authConfig;
  bool _isTestingPrivateCloud = false;
  bool _isFetchingRemoteModels = false;
  bool _isSaving = false;
  String? _errorMessage;
  List<PrivateCloudModelInfoDto> _remoteModels =
      const <PrivateCloudModelInfoDto>[];

  @override
  void initState() {
    super.initState();
    final initial = widget.initialModel;
    _nameController = TextEditingController(text: initial?.name ?? '');
    _modelNameController = TextEditingController(
      text: initial?.modelName ?? '',
    );
    _temperatureController = TextEditingController(
      text: '${initial?.parameters.temperature ?? 0.7}',
    );
    _maxTokensController = TextEditingController(
      text: initial?.parameters.maxTokens?.toString() ?? '',
    );
    _topPController = TextEditingController(
      text: '${initial?.parameters.topP ?? 1}',
    );
    _frequencyPenaltyController = TextEditingController(
      text: '${initial?.parameters.frequencyPenalty ?? 0}',
    );
    _presencePenaltyController = TextEditingController(
      text: '${initial?.parameters.presencePenalty ?? 0}',
    );
    _stopController = TextEditingController(
      text: initial?.parameters.stop.join(', ') ?? '',
    );
    _embeddingDimensionsController = TextEditingController(
      text: initial?.embeddingDimensions?.toString() ?? '',
    );
    _endpointUrlController = TextEditingController(
      text: initial?.endpointUrl ?? '',
    );
    _timeoutMsController = TextEditingController(
      text: initial?.timeoutMs?.toString() ?? '',
    );
    _provider =
        initial?.provider ?? widget.providers.firstOrNull?.id ?? 'openai';
    _modelType = initial?.modelType ?? 'chat';
    _isDefault = initial?.isDefault ?? false;
    _authMethod = initial?.authMethod;
    _selectedApiKeyId = initial?.apiKeyId;
    _authConfig = initial?.authConfig;
  }

  @override
  void dispose() {
    _nameController.dispose();
    _modelNameController.dispose();
    _temperatureController.dispose();
    _maxTokensController.dispose();
    _topPController.dispose();
    _frequencyPenaltyController.dispose();
    _presencePenaltyController.dispose();
    _stopController.dispose();
    _embeddingDimensionsController.dispose();
    _endpointUrlController.dispose();
    _timeoutMsController.dispose();
    super.dispose();
  }

  LlmProviderInfoDto? get _providerInfo {
    return widget.providers
        .where((provider) => provider.id == _provider)
        .firstOrNull;
  }

  List<ApiKeyInfoDto> get _candidateApiKeys {
    final activeKeys = widget.apiKeys.where((key) => key.status == 'active');
    if (_provider == 'private_cloud' || _provider == 'custom') {
      return activeKeys.toList(growable: false);
    }
    return activeKeys
        .where((key) => key.provider == _provider)
        .toList(growable: false);
  }

  LlmParametersDto _buildParameters() {
    return LlmParametersDto(
      temperature: double.tryParse(_temperatureController.text.trim()) ?? 0.7,
      maxTokens: int.tryParse(_maxTokensController.text.trim()),
      topP: double.tryParse(_topPController.text.trim()) ?? 1,
      frequencyPenalty:
          double.tryParse(_frequencyPenaltyController.text.trim()) ?? 0,
      presencePenalty:
          double.tryParse(_presencePenaltyController.text.trim()) ?? 0,
      stop: _stopController.text
          .split(',')
          .map((item) => item.trim())
          .where((item) => item.isNotEmpty)
          .toList(growable: false),
    );
  }

  int? get _embeddingDimensions {
    return int.tryParse(_embeddingDimensionsController.text.trim());
  }

  int? get _timeoutMs {
    return int.tryParse(_timeoutMsController.text.trim());
  }

  Future<void> _testPrivateCloud() async {
    if (_endpointUrlController.text.trim().isEmpty || _authMethod == null) {
      setState(() {
        _errorMessage = '请先填写端点 URL 和认证方式';
      });
      return;
    }

    setState(() {
      _isTestingPrivateCloud = true;
      _errorMessage = null;
    });

    try {
      final result = await ref
          .read(resourcesApiProvider)
          .testPrivateCloudConnection(
            endpointUrl: _endpointUrlController.text.trim(),
            authMethod: _authMethod!,
            apiKeyId: _selectedApiKeyId,
            timeoutMs: _timeoutMs,
          );
      if (!mounted) {
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            result.serverInfo == null
                ? '连接成功，耗时 ${result.latencyMs}ms'
                : '连接成功，耗时 ${result.latencyMs}ms'
                      '${result.serverInfo!.version == null ? '' : ' · 版本 ${result.serverInfo!.version}'}',
          ),
        ),
      );
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _errorMessage = describeResourceError(error);
      });
    } finally {
      if (mounted) {
        setState(() {
          _isTestingPrivateCloud = false;
        });
      }
    }
  }

  Future<void> _fetchRemoteModels() async {
    if (_endpointUrlController.text.trim().isEmpty || _authMethod == null) {
      setState(() {
        _errorMessage = '请先填写端点 URL 和认证方式';
      });
      return;
    }

    setState(() {
      _isFetchingRemoteModels = true;
      _errorMessage = null;
    });

    try {
      final models = await ref
          .read(resourcesApiProvider)
          .fetchPrivateCloudModels(
            endpointUrl: _endpointUrlController.text.trim(),
            authMethod: _authMethod!,
            apiKeyId: _selectedApiKeyId,
          );
      if (!mounted) {
        return;
      }
      setState(() {
        _remoteModels = models;
      });
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _errorMessage = describeResourceError(error);
      });
    } finally {
      if (mounted) {
        setState(() {
          _isFetchingRemoteModels = false;
        });
      }
    }
  }

  Future<void> _save() async {
    final name = _nameController.text.trim();
    final modelName = _modelNameController.text.trim();
    final parameters = _buildParameters();
    final embeddingDimensions = _embeddingDimensions;

    if (name.isEmpty) {
      setState(() {
        _errorMessage = '请填写配置名称';
      });
      return;
    }
    if (modelName.isEmpty) {
      setState(() {
        _errorMessage = '请填写模型名称';
      });
      return;
    }
    if (_modelType == 'embedding' &&
        _provider != 'openai' &&
        _provider != 'private_cloud') {
      setState(() {
        _errorMessage = 'Embedding 模型当前仅支持 openai 或 private_cloud';
      });
      return;
    }
    if (_modelType == 'embedding' && embeddingDimensions == null) {
      setState(() {
        _errorMessage = 'Embedding 模型必须填写向量维度';
      });
      return;
    }
    if (_provider == 'private_cloud') {
      if (_endpointUrlController.text.trim().isEmpty) {
        setState(() {
          _errorMessage = '私有云配置必须填写端点 URL';
        });
        return;
      }
      if (_authMethod == null || _authMethod!.isEmpty) {
        setState(() {
          _errorMessage = '私有云配置必须选择认证方式';
        });
        return;
      }
      if (_authMethod == 'api_key' && _selectedApiKeyId == null) {
        setState(() {
          _errorMessage = 'API Key 鉴权必须选择一个 API Key';
        });
        return;
      }
    }

    setState(() {
      _isSaving = true;
      _errorMessage = null;
    });

    try {
      final api = ref.read(resourcesApiProvider);
      if (widget.isEditing) {
        await api.updateLlmModel(
          widget.initialModel!.id,
          name: name,
          provider: _provider,
          modelType: _modelType,
          modelName: modelName,
          parameters: parameters,
          apiKeyId: _selectedApiKeyId,
          clearApiKey: _selectedApiKeyId == null,
          embeddingDimensions: embeddingDimensions,
          clearEmbeddingDimensions: _modelType != 'embedding',
          isDefault: _isDefault,
          endpointUrl: _provider == 'private_cloud'
              ? _endpointUrlController.text.trim()
              : null,
          clearEndpointUrl: _provider != 'private_cloud',
          authMethod: _provider == 'private_cloud' ? _authMethod : null,
          clearAuthMethod: _provider != 'private_cloud',
          authConfig: _provider == 'private_cloud' && _authMethod == 'mtls'
              ? _authConfig
              : null,
          clearAuthConfig:
              _provider != 'private_cloud' || _authMethod != 'mtls',
          timeoutMs: _provider == 'private_cloud' ? _timeoutMs : null,
          clearTimeoutMs: _provider != 'private_cloud',
        );
      } else {
        await api.createLlmModel(
          name: name,
          provider: _provider,
          modelType: _modelType,
          modelName: modelName,
          parameters: parameters,
          apiKeyId: _selectedApiKeyId,
          embeddingDimensions: _modelType == 'embedding'
              ? embeddingDimensions
              : null,
          isDefault: _isDefault,
          endpointUrl: _provider == 'private_cloud'
              ? _endpointUrlController.text.trim()
              : null,
          authMethod: _provider == 'private_cloud' ? _authMethod : null,
          authConfig: _provider == 'private_cloud' && _authMethod == 'mtls'
              ? _authConfig
              : null,
          timeoutMs: _provider == 'private_cloud' ? _timeoutMs : null,
        );
      }

      if (!mounted) {
        return;
      }
      Navigator.of(context).pop(true);
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _errorMessage = describeResourceError(error);
      });
    } finally {
      if (mounted) {
        setState(() {
          _isSaving = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final viewInsets = MediaQuery.of(context).viewInsets.bottom;
    final providerInfo = _providerInfo;

    return Padding(
      padding: EdgeInsets.fromLTRB(20, 12, 20, 24 + viewInsets),
      child: ListView(
        shrinkWrap: true,
        children: [
          Text(
            widget.isEditing ? '编辑模型配置' : '新建模型配置',
            style: theme.textTheme.headlineSmall,
          ),
          const SizedBox(height: 20),
          TextField(
            controller: _nameController,
            decoration: const InputDecoration(labelText: '配置名称'),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: _provider,
            decoration: const InputDecoration(labelText: 'Provider'),
            items: widget.providers
                .map(
                  (provider) => DropdownMenuItem(
                    value: provider.id,
                    child: Text('${provider.id} · ${provider.name}'),
                  ),
                )
                .toList(growable: false),
            onChanged: (value) {
              setState(() {
                _provider = value ?? _provider;
                if (_provider != 'private_cloud') {
                  _authMethod = null;
                  _remoteModels = const <PrivateCloudModelInfoDto>[];
                }
              });
            },
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: _modelType,
            decoration: const InputDecoration(labelText: '模型类型'),
            items: llmModelTypes
                .map(
                  (modelType) => DropdownMenuItem(
                    value: modelType,
                    child: Text(modelType),
                  ),
                )
                .toList(growable: false),
            onChanged: (value) {
              setState(() {
                _modelType = value ?? _modelType;
              });
            },
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _modelNameController,
            decoration: InputDecoration(
              labelText: '模型名称',
              helperText: providerInfo == null || providerInfo.models.isEmpty
                  ? null
                  : '可选：${providerInfo.models.take(4).join(' / ')}',
            ),
          ),
          if (providerInfo != null && providerInfo.models.isNotEmpty) ...[
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final model in providerInfo.models.take(8))
                  ActionChip(
                    label: Text(model),
                    onPressed: () {
                      _modelNameController.text = model;
                    },
                  ),
              ],
            ),
          ],
          if (_provider == 'private_cloud' && _remoteModels.isNotEmpty) ...[
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final model in _remoteModels.take(12))
                  ActionChip(
                    label: Text(model.name),
                    onPressed: () {
                      _modelNameController.text = model.name;
                    },
                  ),
              ],
            ),
          ],
          const SizedBox(height: 12),
          DropdownButtonFormField<String?>(
            initialValue: _selectedApiKeyId,
            decoration: const InputDecoration(labelText: 'API Key'),
            items: [
              const DropdownMenuItem<String?>(
                value: null,
                child: Text('使用默认 / 不绑定'),
              ),
              ..._candidateApiKeys.map(
                (key) => DropdownMenuItem<String?>(
                  value: key.id,
                  child: Text('${key.label} (${key.keyPreview})'),
                ),
              ),
            ],
            onChanged: (value) {
              setState(() {
                _selectedApiKeyId = value;
              });
            },
          ),
          const SizedBox(height: 16),
          Text('推理参数', style: theme.textTheme.titleMedium),
          const SizedBox(height: 12),
          TextField(
            controller: _temperatureController,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: const InputDecoration(labelText: 'Temperature'),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _topPController,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: const InputDecoration(labelText: 'Top P'),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _maxTokensController,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(labelText: 'Max Tokens'),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _frequencyPenaltyController,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: const InputDecoration(labelText: 'Frequency Penalty'),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _presencePenaltyController,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: const InputDecoration(labelText: 'Presence Penalty'),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _stopController,
            decoration: const InputDecoration(labelText: 'Stop（逗号分隔）'),
          ),
          if (_modelType == 'embedding') ...[
            const SizedBox(height: 12),
            TextField(
              controller: _embeddingDimensionsController,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: '向量维度'),
            ),
          ],
          if (_provider == 'private_cloud') ...[
            const SizedBox(height: 20),
            Text('私有云连接', style: theme.textTheme.titleMedium),
            const SizedBox(height: 12),
            TextField(
              controller: _endpointUrlController,
              decoration: const InputDecoration(labelText: '端点 URL'),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: _authMethod,
              decoration: const InputDecoration(labelText: '认证方式'),
              items: llmAuthMethods
                  .map(
                    (method) =>
                        DropdownMenuItem(value: method, child: Text(method)),
                  )
                  .toList(growable: false),
              onChanged: (value) {
                setState(() {
                  _authMethod = value;
                });
              },
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _timeoutMsController,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: '超时（毫秒）'),
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 12,
              runSpacing: 12,
              children: [
                FilledButton.tonalIcon(
                  onPressed: _isTestingPrivateCloud ? null : _testPrivateCloud,
                  icon: _isTestingPrivateCloud
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.network_check_rounded),
                  label: const Text('测试连接'),
                ),
                FilledButton.tonalIcon(
                  onPressed: _isFetchingRemoteModels
                      ? null
                      : _fetchRemoteModels,
                  icon: _isFetchingRemoteModels
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.cloud_download_outlined),
                  label: const Text('拉取模型'),
                ),
              ],
            ),
          ],
          const SizedBox(height: 16),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('设为默认'),
            subtitle: const Text('同类型模型只允许有一个默认项'),
            value: _isDefault,
            onChanged: (value) {
              setState(() {
                _isDefault = value;
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
            label: Text(widget.isEditing ? '保存修改' : '创建配置'),
          ),
        ],
      ),
    );
  }
}

class _LlmScreenData {
  const _LlmScreenData({
    required this.models,
    required this.providers,
    required this.apiKeys,
  });

  final List<LlmModelInfoDto> models;
  final List<LlmProviderInfoDto> providers;
  final List<ApiKeyInfoDto> apiKeys;
}

class _FilterChip extends StatelessWidget {
  const _FilterChip({
    required this.label,
    required this.selected,
    required this.onSelected,
  });

  final String label;
  final bool selected;
  final VoidCallback onSelected;

  @override
  Widget build(BuildContext context) {
    return FilterChip(
      label: Text(label),
      selected: selected,
      onSelected: (_) => onSelected(),
    );
  }
}

IconData _providerIcon(String provider) {
  switch (provider) {
    case 'openai':
      return Icons.auto_awesome_rounded;
    case 'anthropic':
      return Icons.psychology_alt_rounded;
    case 'google':
      return Icons.token_rounded;
    case 'deepseek':
      return Icons.explore_rounded;
    case 'private_cloud':
      return Icons.cloud_done_rounded;
    default:
      return Icons.hub_rounded;
  }
}
