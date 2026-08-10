import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/resources_api.dart';
import '../models/resource_entities.dart';
import '../widgets/llm_provider_icon.dart';
import '../widgets/resource_shared.dart';
import 'llm_models/create_provider_sheet.dart';
import 'llm_models/provider_detail_screen.dart';

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
        builder: (_) => ProviderDetailScreen(providerId: provider.id),
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
      await ref
          .read(resourcesApiProvider)
          .updateLlmProvider(provider.id, isEnabled: value);
      await _reload();
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(describeResourceError(error))));
    }
  }

  Future<void> _openCreateProvider() async {
    final changed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => const CreateProviderSheet(),
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
                              description: '系统会自动同步内置提供商，也可以手动添加自定义提供商。',
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
                                leading: LlmProviderIcon(
                                  slug: provider.slug,
                                  iconUrl: provider.iconUrl,
                                ),
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
                                            backgroundColor: theme
                                                .colorScheme
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
                                            backgroundColor: theme
                                                .colorScheme
                                                .tertiaryContainer,
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
                                onTap: () =>
                                    _openProviderDetail(provider, data.models),
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

class _ProviderScreenData {
  const _ProviderScreenData({required this.providers, required this.models});

  final List<LlmProviderEntityDto> providers;
  final List<LlmModelConfigDto> models;
}
