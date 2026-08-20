import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/resources_api.dart';
import '../models/resource_dtos.dart';
import '../providers/sandbox_provider.dart';
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
  String? _search;

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  SandboxListQuery get _query => SandboxListQuery(
    search: _search,
    bindingType: _bindingType.isEmpty ? null : _bindingType,
  );

  void _submitSearch() {
    final value = _searchController.text.trim();
    setState(() => _search = value.isEmpty ? null : value);
  }

  Future<void> _refresh(SandboxListQuery query) async {
    final provider = sandboxListProvider(query);
    ref.invalidate(provider);
    await ref.read(provider.future);
  }

  @override
  Widget build(BuildContext context) {
    final query = _query;
    final sandboxes = ref.watch(sandboxListProvider(query));
    return Scaffold(
      appBar: AppBar(
        title: const Text('Sandbox'),
        actions: [
          IconButton(
            onPressed: () => unawaited(_refresh(query)),
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
                    _submitSearch();
                  },
                  icon: const Icon(Icons.close),
                ),
              ],
              onSubmitted: (_) => _submitSearch(),
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
                      setState(() => _bindingType = 'resource');
                    },
                  ),
                  ChoiceChip(
                    label: const Text('全部'),
                    selected: _bindingType.isEmpty,
                    onSelected: (_) {
                      setState(() => _bindingType = '');
                    },
                  ),
                  ChoiceChip(
                    label: const Text('对话'),
                    selected: _bindingType == 'conversation',
                    onSelected: (_) {
                      setState(() => _bindingType = 'conversation');
                    },
                  ),
                  ChoiceChip(
                    label: const Text('执行'),
                    selected: _bindingType == 'execution',
                    onSelected: (_) {
                      setState(() => _bindingType = 'execution');
                    },
                  ),
                ],
              ),
            ),
          ),
          Expanded(
            child: sandboxes.when(
              skipLoadingOnRefresh: false,
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (error, _) => ResourceErrorState(
                message: '加载沙箱失败：$error',
                onRetry: () => unawaited(_refresh(query)),
              ),
              data: (response) {
                final items = response.data;
                if (items.isEmpty) {
                  return RefreshIndicator(
                    onRefresh: () => _refresh(query),
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
                  onRefresh: () => _refresh(query),
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
    await _refresh(_query);
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
        await _refresh(_query);
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
      builder: (context) => _SandboxDetailSheet(sandbox: sandbox),
    );
  }
}

class _SandboxDetailSheet extends ConsumerWidget {
  const _SandboxDetailSheet({required this.sandbox});

  final SandboxSessionDto sandbox;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final logs = ref.watch(sandboxLogsProvider(sandbox.id));
    final shouldLoadStats = _liveSandboxStatuses.contains(sandbox.status);

    Widget runtimeContent(List<SandboxLogDto> loadedLogs) {
      if (!shouldLoadStats) {
        return _SandboxRuntimeContent(sandbox: sandbox, logs: loadedLogs);
      }
      return ref
          .watch(sandboxStatsProvider(sandbox.id))
          .when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (error, _) => ResourceErrorState(
              message: '加载沙箱统计失败：$error',
              onRetry: () => ref.invalidate(sandboxStatsProvider(sandbox.id)),
            ),
            data: (stats) => _SandboxRuntimeContent(
              sandbox: sandbox,
              stats: stats,
              logs: loadedLogs,
            ),
          );
    }

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
          logs.when(
            loading: () => const Padding(
              padding: EdgeInsets.symmetric(vertical: 24),
              child: Center(child: CircularProgressIndicator()),
            ),
            error: (error, _) => ResourceErrorState(
              message: '加载沙箱日志失败：$error',
              onRetry: () => ref.invalidate(sandboxLogsProvider(sandbox.id)),
            ),
            data: runtimeContent,
          ),
        ],
      ),
    );
  }
}

class _SandboxRuntimeContent extends StatelessWidget {
  const _SandboxRuntimeContent({
    required this.sandbox,
    required this.logs,
    this.stats,
  });

  final SandboxSessionDto sandbox;
  final SandboxStatsDto? stats;
  final List<SandboxLogDto> logs;

  @override
  Widget build(BuildContext context) {
    final currentStats = stats;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (currentStats != null) ...[
          const SizedBox(height: 16),
          _MetricChipRow(stats: currentStats),
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
        if (logs.isNotEmpty) ...[
          const SizedBox(height: 16),
          Text('最近日志', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 10),
          for (final log in logs.take(10)) ...[
            DecoratedBox(
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.surfaceContainerLow,
                borderRadius: BorderRadius.circular(16),
              ),
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: SelectableText(
                  '[${log.level}] ${log.message}',
                  style: Theme.of(
                    context,
                  ).textTheme.bodySmall?.copyWith(fontFamily: 'monospace'),
                ),
              ),
            ),
            const SizedBox(height: 8),
          ],
        ],
      ],
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
