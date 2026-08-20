import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/models/paginated_response.dart';
import '../api/resources_api.dart';
import '../models/resource_dtos.dart';
import '../widgets/resource_shared.dart';

const _liveSandboxStatuses = {'ready', 'busy'};

class SandboxesScreen extends ConsumerStatefulWidget {
  const SandboxesScreen({super.key});

  @override
  ConsumerState<SandboxesScreen> createState() => _SandboxesScreenState();
}

class _SandboxesScreenState extends ConsumerState<SandboxesScreen> {
  final _searchController = TextEditingController();
  String _bindingType = 'resource';
  late Future<PaginatedResponse<SandboxSessionDto>> _future;

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

  Future<PaginatedResponse<SandboxSessionDto>> _load() {
    return ref
        .read(resourcesApiProvider)
        .listSandboxes(
          search: _searchController.text.trim().isEmpty
              ? null
              : _searchController.text.trim(),
          bindingType: _bindingType.isEmpty ? null : _bindingType,
        );
  }

  Future<void> _reload() async {
    setState(() {
      _future = _load();
    });
    await _future;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Sandbox'),
        actions: [
          IconButton(
            onPressed: () => unawaited(_reload()),
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _showCreateDialog,
        icon: const Icon(Icons.add),
        label: const Text('新建'),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 8),
            child: SearchBar(
              controller: _searchController,
              hintText: '搜索沙箱名称或 ID',
              leading: const Icon(Icons.search),
              trailing: [
                IconButton(
                  onPressed: () {
                    _searchController.clear();
                    unawaited(_reload());
                  },
                  icon: const Icon(Icons.close),
                ),
              ],
              onSubmitted: (_) => unawaited(_reload()),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Wrap(
                spacing: 8,
                children: [
                  ChoiceChip(
                    label: const Text('资源'),
                    selected: _bindingType == 'resource',
                    onSelected: (_) {
                      setState(() {
                        _bindingType = 'resource';
                        _future = _load();
                      });
                    },
                  ),
                  ChoiceChip(
                    label: const Text('全部'),
                    selected: _bindingType.isEmpty,
                    onSelected: (_) {
                      setState(() {
                        _bindingType = '';
                        _future = _load();
                      });
                    },
                  ),
                  ChoiceChip(
                    label: const Text('对话'),
                    selected: _bindingType == 'conversation',
                    onSelected: (_) {
                      setState(() {
                        _bindingType = 'conversation';
                        _future = _load();
                      });
                    },
                  ),
                  ChoiceChip(
                    label: const Text('执行'),
                    selected: _bindingType == 'execution',
                    onSelected: (_) {
                      setState(() {
                        _bindingType = 'execution';
                        _future = _load();
                      });
                    },
                  ),
                ],
              ),
            ),
          ),
          Expanded(
            child: FutureBuilder<PaginatedResponse<SandboxSessionDto>>(
              future: _future,
              builder: (context, snapshot) {
                if (snapshot.connectionState != ConnectionState.done) {
                  return const Center(child: CircularProgressIndicator());
                }
                if (snapshot.hasError) {
                  return ResourceErrorState(
                    message: '加载沙箱失败：${snapshot.error}',
                    onRetry: () => unawaited(_reload()),
                  );
                }

                final items =
                    snapshot.data?.data ?? const <SandboxSessionDto>[];
                if (items.isEmpty) {
                  return RefreshIndicator(
                    onRefresh: _reload,
                    child: ListView(
                      children: [
                        const SizedBox(height: 80),
                        ResourceEmptyState(
                          icon: Icons.computer_outlined,
                          title: '还没有沙箱',
                          description: _bindingType == 'resource'
                              ? '默认只展示可复用的资源沙箱，可以创建持久沙箱后在 Agent 对话或工作流里复用。'
                              : '当前筛选下没有沙箱。',
                        ),
                      ],
                    ),
                  );
                }

                return RefreshIndicator(
                  onRefresh: _reload,
                  child: ListView.separated(
                    padding: const EdgeInsets.fromLTRB(20, 12, 20, 100),
                    itemCount: items.length,
                    separatorBuilder: (_, _) => const SizedBox(height: 12),
                    itemBuilder: (context, index) {
                      final sandbox = items[index];
                      return Card(
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  const Icon(Icons.computer_outlined),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          sandbox.config.name ?? sandbox.id,
                                          style: Theme.of(
                                            context,
                                          ).textTheme.titleMedium,
                                        ),
                                        Text(
                                          '${sandbox.bindingLabel} · ${sandbox.status} · ${sandbox.config.lifecycleMode}',
                                          style: Theme.of(
                                            context,
                                          ).textTheme.labelSmall,
                                        ),
                                      ],
                                    ),
                                  ),
                                  PopupMenuButton<String>(
                                    onSelected: (value) {
                                      switch (value) {
                                        case 'detail':
                                          _showDetailSheet(sandbox);
                                        case 'start':
                                          unawaited(
                                            _executeAction(() async {
                                              await ref
                                                  .read(resourcesApiProvider)
                                                  .startSandbox(sandbox.id);
                                            }),
                                          );
                                        case 'stop':
                                          unawaited(
                                            _executeAction(() async {
                                              await ref
                                                  .read(resourcesApiProvider)
                                                  .stopSandbox(sandbox.id);
                                            }),
                                          );
                                        case 'delete':
                                          unawaited(
                                            _executeAction(() async {
                                              await ref
                                                  .read(resourcesApiProvider)
                                                  .deleteSandbox(sandbox.id);
                                            }),
                                          );
                                      }
                                    },
                                    itemBuilder: (context) => [
                                      const PopupMenuItem(
                                        value: 'detail',
                                        child: Text('查看详情'),
                                      ),
                                      if (sandbox.status == 'stopped')
                                        const PopupMenuItem(
                                          value: 'start',
                                          child: Text('启动'),
                                        ),
                                      if (_liveSandboxStatuses.contains(
                                        sandbox.status,
                                      ))
                                        const PopupMenuItem(
                                          value: 'stop',
                                          child: Text('停止'),
                                        ),
                                      const PopupMenuItem(
                                        value: 'delete',
                                        child: Text('删除'),
                                      ),
                                    ],
                                  ),
                                ],
                              ),
                              const SizedBox(height: 12),
                              Wrap(
                                spacing: 8,
                                runSpacing: 8,
                                children: [
                                  _MetricChip(
                                    label: 'CPU',
                                    value: '${sandbox.config.cpu}',
                                  ),
                                  _MetricChip(
                                    label: '内存',
                                    value: '${sandbox.config.memory} MB',
                                  ),
                                  _MetricChip(
                                    label: '磁盘',
                                    value: '${sandbox.config.disk} GB',
                                  ),
                                  _MetricChip(
                                    label: '超时',
                                    value: sandbox.config.timeoutLabel,
                                  ),
                                ],
                              ),
                              const SizedBox(height: 12),
                              Text(
                                sandbox.id,
                                style: Theme.of(context).textTheme.bodySmall
                                    ?.copyWith(fontFamily: 'monospace'),
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _executeAction(Future<void> Function() action) async {
    await action();
    await _reload();
  }

  Future<void> _showCreateDialog() async {
    final nameController = TextEditingController();
    final cpuController = TextEditingController(text: '1');
    final memoryController = TextEditingController(text: '512');
    final diskController = TextEditingController(text: '2');

    try {
      final created = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('新建持久沙箱'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: nameController,
                decoration: const InputDecoration(labelText: '名称'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: cpuController,
                keyboardType: const TextInputType.numberWithOptions(
                  decimal: true,
                ),
                decoration: const InputDecoration(labelText: 'CPU'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: memoryController,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: '内存 MB'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: diskController,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: '磁盘 GB'),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(false),
              child: const Text('取消'),
            ),
            FilledButton(
              onPressed: () async {
                await ref
                    .read(resourcesApiProvider)
                    .createSandbox(
                      name: nameController.text.trim(),
                      cpu: double.tryParse(cpuController.text.trim()) ?? 1,
                      memory: int.tryParse(memoryController.text.trim()) ?? 512,
                      disk: int.tryParse(diskController.text.trim()) ?? 2,
                    );
                if (!context.mounted) {
                  return;
                }
                Navigator.of(context).pop(true);
              },
              child: const Text('创建'),
            ),
          ],
        ),
      );

      if (created == true) {
        await _reload();
      }
    } finally {
      nameController.dispose();
      cpuController.dispose();
      memoryController.dispose();
      diskController.dispose();
    }
  }

  void _showDetailSheet(SandboxSessionDto sandbox) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (context) {
        return FutureBuilder<(SandboxStatsDto?, List<SandboxLogDto>)>(
          future: () async {
            final api = ref.read(resourcesApiProvider);
            final shouldLoadStats = _liveSandboxStatuses.contains(
              sandbox.status,
            );
            final stats = shouldLoadStats
                ? await api.getSandboxStats(sandbox.id)
                : null;
            final logs = await api.getSandboxLogs(sandbox.id);
            return (stats, logs);
          }(),
          builder: (context, snapshot) {
            return Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
              child: ListView(
                shrinkWrap: true,
                children: [
                  Text(
                    sandbox.config.name ?? sandbox.id,
                    style: Theme.of(context).textTheme.headlineSmall,
                  ),
                  const SizedBox(height: 16),
                  ResourceMetadataRow(label: '绑定', value: sandbox.bindingLabel),
                  ResourceMetadataRow(label: '状态', value: sandbox.status),
                  ResourceMetadataRow(
                    label: '生命周期',
                    value: sandbox.config.lifecycleMode,
                  ),
                  ResourceMetadataRow(
                    label: '工作区',
                    value: sandbox.workspacePath ?? '未挂载',
                  ),
                  ResourceMetadataRow(
                    label: '创建时间',
                    value: formatDateTime(sandbox.createdAt),
                  ),
                  if (snapshot.connectionState != ConnectionState.done)
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 24),
                      child: Center(child: CircularProgressIndicator()),
                    )
                  else if (snapshot.hasData) ...[
                    if (snapshot.data!.$1 != null) ...[
                      const SizedBox(height: 16),
                      _MetricChipRow(stats: snapshot.data!.$1!),
                    ] else ...[
                      const SizedBox(height: 16),
                      Text(
                        '实时资源统计仅在运行中的沙箱可用。',
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ],
                    const SizedBox(height: 16),
                    JsonCodePanel(
                      label: '沙箱配置',
                      data: {
                        'cpu': sandbox.config.cpu,
                        'memory': sandbox.config.memory,
                        'disk': sandbox.config.disk,
                        'timeout': sandbox.config.timeout,
                        'timeoutSeconds': sandbox.config.timeoutSeconds,
                        'lifecycleMode': sandbox.config.lifecycleMode,
                        'restoreWorkspaceId': sandbox.config.restoreWorkspaceId,
                      },
                    ),
                    if (snapshot.data!.$2.isNotEmpty) ...[
                      const SizedBox(height: 16),
                      Text(
                        '最近日志',
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      const SizedBox(height: 10),
                      for (final log in snapshot.data!.$2.take(10)) ...[
                        DecoratedBox(
                          decoration: BoxDecoration(
                            color: Theme.of(
                              context,
                            ).colorScheme.surfaceContainerLow,
                            borderRadius: BorderRadius.circular(16),
                          ),
                          child: Padding(
                            padding: const EdgeInsets.all(12),
                            child: SelectableText(
                              '[${log.level}] ${log.message}',
                              style: Theme.of(context).textTheme.bodySmall
                                  ?.copyWith(fontFamily: 'monospace'),
                            ),
                          ),
                        ),
                        const SizedBox(height: 8),
                      ],
                    ],
                  ],
                ],
              ),
            );
          },
        );
      },
    );
  }
}

class _MetricChip extends StatelessWidget {
  const _MetricChip({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Chip(
      label: Text('$label $value'),
      visualDensity: VisualDensity.compact,
    );
  }
}

class _MetricChipRow extends StatelessWidget {
  const _MetricChipRow({required this.stats});

  final SandboxStatsDto stats;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        _MetricChip(
          label: 'CPU',
          value: '${stats.cpuPercent.toStringAsFixed(1)}%',
        ),
        _MetricChip(
          label: '内存',
          value:
              '${stats.memoryUsageMb.toStringAsFixed(0)} / ${stats.memoryLimitMb.toStringAsFixed(0)} MB',
        ),
        if (stats.hasDiskStats)
          _MetricChip(
            label: '磁盘',
            value:
                '${formatBytes(stats.diskUsage)} / ${formatBytes(stats.diskTotal)}',
          ),
      ],
    );
  }
}
