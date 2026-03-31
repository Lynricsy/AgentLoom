import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/models/paginated_response.dart';
import '../api/resources_api.dart';
import '../models/resource_entities.dart';
import '../widgets/resource_shared.dart';

class McpServersScreen extends ConsumerStatefulWidget {
  const McpServersScreen({super.key});

  @override
  ConsumerState<McpServersScreen> createState() => _McpServersScreenState();
}

class _McpServersScreenState extends ConsumerState<McpServersScreen> {
  final _searchController = TextEditingController();
  String? _statusFilter;
  String? _transportFilter;
  late Future<PaginatedResponse<McpServerConfigSummaryDto>> _future;

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

  Future<PaginatedResponse<McpServerConfigSummaryDto>> _load() {
    return ref
        .read(resourcesApiProvider)
        .listMcpServerConfigs(
          search: _searchController.text.trim().isEmpty
              ? null
              : _searchController.text.trim(),
          status: _statusFilter,
          transportType: _transportFilter,
        );
  }

  Future<void> _reload() async {
    setState(() {
      _future = _load();
    });
    await _future;
  }

  Future<void> _openImportSheet() async {
    final imported = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (context) => const _McpDiscoverySheet(),
    );

    if (imported == true) {
      await _reload();
    }
  }

  Future<void> _openDetailSheet(McpServerConfigSummaryDto summary) async {
    final changed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (context) {
        return _McpServerDetailSheet(summary: summary, onChanged: _reload);
      },
    );

    if (changed == true) {
      await _reload();
    }
  }

  void _applyStatusFilter(String? value) {
    setState(() {
      _statusFilter = value;
      _future = _load();
    });
  }

  void _applyTransportFilter(String? value) {
    setState(() {
      _transportFilter = value;
      _future = _load();
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('MCP Servers'),
        actions: [
          IconButton(
            onPressed: () => unawaited(_reload()),
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _openImportSheet,
        icon: const Icon(Icons.add_link_rounded),
        label: const Text('导入工具'),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 8),
            child: SearchBar(
              controller: _searchController,
              hintText: '搜索 MCP 服务名称',
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
            padding: const EdgeInsets.fromLTRB(20, 4, 20, 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('状态', style: theme.textTheme.labelLarge),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    _FilterChip(
                      label: '全部',
                      selected: _statusFilter == null,
                      onSelected: () => _applyStatusFilter(null),
                    ),
                    for (final status in const ['active', 'inactive', 'error'])
                      _FilterChip(
                        label: status,
                        selected: _statusFilter == status,
                        onSelected: () => _applyStatusFilter(status),
                      ),
                  ],
                ),
                const SizedBox(height: 12),
                Text('传输协议', style: theme.textTheme.labelLarge),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    _FilterChip(
                      label: '全部',
                      selected: _transportFilter == null,
                      onSelected: () => _applyTransportFilter(null),
                    ),
                    for (final transport in mcpTransportTypes)
                      _FilterChip(
                        label: transport,
                        selected: _transportFilter == transport,
                        onSelected: () => _applyTransportFilter(transport),
                      ),
                  ],
                ),
              ],
            ),
          ),
          Expanded(
            child: FutureBuilder<PaginatedResponse<McpServerConfigSummaryDto>>(
              future: _future,
              builder: (context, snapshot) {
                if (snapshot.connectionState != ConnectionState.done) {
                  return const Center(child: CircularProgressIndicator());
                }
                if (snapshot.hasError) {
                  return ResourceErrorState(
                    message:
                        '加载 MCP 配置失败：${describeResourceError(snapshot.error!)}',
                    onRetry: () => unawaited(_reload()),
                  );
                }

                final items =
                    snapshot.data?.data ?? const <McpServerConfigSummaryDto>[];
                if (items.isEmpty) {
                  return RefreshIndicator(
                    onRefresh: _reload,
                    child: ListView(
                      children: const [
                        SizedBox(height: 80),
                        ResourceEmptyState(
                          icon: Icons.extension_off_outlined,
                          title: '还没有 MCP 服务',
                          description: '先导入一个 MCP 服务，之后就可以测试连接、查看工具和重新导入。',
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
                      final config = items[index];
                      return Card(
                        child: ListTile(
                          contentPadding: const EdgeInsets.all(16),
                          leading: Icon(_transportIcon(config.transportType)),
                          title: Text(config.name),
                          subtitle: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const SizedBox(height: 4),
                              Text(config.description ?? '无描述'),
                              const SizedBox(height: 10),
                              Wrap(
                                spacing: 8,
                                runSpacing: 8,
                                children: [
                                  Chip(
                                    label: Text(config.status),
                                    visualDensity: VisualDensity.compact,
                                  ),
                                  Chip(
                                    label: Text(config.transportType),
                                    visualDensity: VisualDensity.compact,
                                  ),
                                  Chip(
                                    label: Text('${config.toolCount} 工具'),
                                    visualDensity: VisualDensity.compact,
                                  ),
                                  if (config.lastTestedAt != null)
                                    Chip(
                                      label: Text(
                                        '已测 ${formatDateTime(config.lastTestedAt!)}',
                                      ),
                                      visualDensity: VisualDensity.compact,
                                    ),
                                ],
                              ),
                            ],
                          ),
                          trailing: const Icon(Icons.chevron_right_rounded),
                          onTap: () => _openDetailSheet(config),
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
}

class _McpServerDetailSheet extends ConsumerStatefulWidget {
  const _McpServerDetailSheet({required this.summary, required this.onChanged});

  final McpServerConfigSummaryDto summary;
  final Future<void> Function() onChanged;

  @override
  ConsumerState<_McpServerDetailSheet> createState() =>
      _McpServerDetailSheetState();
}

class _McpServerDetailSheetState extends ConsumerState<_McpServerDetailSheet> {
  late Future<McpServerConfigDetailDto> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<McpServerConfigDetailDto> _load() {
    return ref.read(resourcesApiProvider).getMcpServerConfig(widget.summary.id);
  }

  Future<void> _reload() async {
    setState(() {
      _future = _load();
    });
    await _future;
    await widget.onChanged();
  }

  Future<void> _testSavedConnection() async {
    try {
      final result = await ref
          .read(resourcesApiProvider)
          .testSavedMcpConfigConnection(widget.summary.id);
      if (!mounted) {
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            result.serverInfo == null
                ? '连接测试成功'
                : '连接成功：${result.serverInfo!.name} ${result.serverInfo!.version}',
          ),
        ),
      );
      await _reload();
    } catch (error) {
      if (!mounted) {
        return;
      }
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(describeResourceError(error))));
    }
  }

  Future<void> _openEditSheet(McpServerConfigDetailDto detail) async {
    final changed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (context) => _McpEditSheet(detail: detail),
    );

    if (changed == true) {
      await _reload();
    }
  }

  Future<void> _openReimportSheet(McpServerConfigDetailDto detail) async {
    final changed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (context) => _McpDiscoverySheet(existingDetail: detail),
    );

    if (changed == true) {
      await _reload();
    }
  }

  Future<void> _confirmDelete() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('删除 MCP 服务'),
        content: Text('确认删除 ${widget.summary.name} 吗？已导入的工具也会一起失效。'),
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
      await ref
          .read(resourcesApiProvider)
          .deleteMcpServerConfig(widget.summary.id);
      if (!mounted) {
        return;
      }
      Navigator.of(context).pop(true);
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('MCP 服务已删除')));
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

  Future<void> _openToolDetail(McpToolDefinitionDto tool) async {
    final messenger = ScaffoldMessenger.of(context);
    final changed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (context) {
        return _McpToolDetailSheet(
          tool: tool,
          onDeactivate: () async {
            await ref.read(resourcesApiProvider).deactivateMcpTool(tool.id);
            if (!mounted) {
              return;
            }
            messenger.showSnackBar(
              SnackBar(content: Text('${tool.title ?? tool.name} 已停用')),
            );
          },
        );
      },
    );

    if (changed == true) {
      await _reload();
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return FutureBuilder<McpServerConfigDetailDto>(
      future: _future,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const Center(child: CircularProgressIndicator());
        }
        if (snapshot.hasError) {
          return Padding(
            padding: const EdgeInsets.fromLTRB(20, 24, 20, 24),
            child: ResourceErrorState(
              message: '加载详情失败：${describeResourceError(snapshot.error!)}',
              onRetry: () => unawaited(_reload()),
            ),
          );
        }

        final detail = snapshot.data!;
        return Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
          child: ListView(
            shrinkWrap: true,
            children: [
              Text(detail.name, style: theme.textTheme.headlineSmall),
              const SizedBox(height: 8),
              if (detail.description != null && detail.description!.isNotEmpty)
                Text(detail.description!),
              const SizedBox(height: 16),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  Chip(label: Text(detail.status)),
                  Chip(label: Text(detail.transportType)),
                  Chip(label: Text('${detail.tools.length} 工具')),
                ],
              ),
              const SizedBox(height: 16),
              ResourceMetadataRow(
                label: '创建时间',
                value: formatDateTime(detail.createdAt),
              ),
              ResourceMetadataRow(
                label: '更新时间',
                value: formatDateTime(detail.updatedAt),
              ),
              ResourceMetadataRow(
                label: '最近测试',
                value: detail.lastTestedAt == null
                    ? '未测试'
                    : formatDateTime(detail.lastTestedAt!),
              ),
              const SizedBox(height: 16),
              JsonCodePanel(
                label: '连接信息',
                data: {
                  'transportType': detail.connection.transportType,
                  if (detail.connection.command != null)
                    'command': detail.connection.command,
                  if (detail.connection.args.isNotEmpty)
                    'args': detail.connection.args,
                  if (detail.connection.url != null)
                    'url': detail.connection.url,
                  'credentialKeys': detail.credentialKeys,
                },
              ),
              const SizedBox(height: 20),
              Wrap(
                spacing: 12,
                runSpacing: 12,
                children: [
                  FilledButton.tonalIcon(
                    onPressed: _testSavedConnection,
                    icon: const Icon(Icons.wifi_tethering_rounded),
                    label: const Text('测试连接'),
                  ),
                  FilledButton.tonalIcon(
                    onPressed: () => _openReimportSheet(detail),
                    icon: const Icon(Icons.download_for_offline_rounded),
                    label: const Text('重新导入'),
                  ),
                  OutlinedButton.icon(
                    onPressed: () => _openEditSheet(detail),
                    icon: const Icon(Icons.edit_outlined),
                    label: const Text('编辑'),
                  ),
                  OutlinedButton.icon(
                    onPressed: _confirmDelete,
                    icon: const Icon(Icons.delete_outline),
                    label: const Text('删除'),
                  ),
                ],
              ),
              const SizedBox(height: 24),
              Text('工具', style: theme.textTheme.titleMedium),
              const SizedBox(height: 12),
              if (detail.tools.isEmpty)
                const Text('当前没有活跃工具')
              else
                for (final tool in detail.tools) ...[
                  Card(
                    child: ListTile(
                      contentPadding: const EdgeInsets.all(16),
                      leading: const Icon(Icons.extension_rounded),
                      title: Text(tool.title ?? tool.name),
                      subtitle: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const SizedBox(height: 4),
                          Text(tool.description ?? '无描述'),
                          const SizedBox(height: 8),
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: [
                              Chip(
                                label: Text(
                                  '${tool.portMappingMetadata?.inputs.length ?? 0} 输入',
                                ),
                                visualDensity: VisualDensity.compact,
                              ),
                              Chip(
                                label: Text(
                                  '${tool.portMappingMetadata?.outputs.length ?? 0} 输出',
                                ),
                                visualDensity: VisualDensity.compact,
                              ),
                              if (tool.importedAt != null)
                                Chip(
                                  label: Text(formatDateTime(tool.importedAt!)),
                                  visualDensity: VisualDensity.compact,
                                ),
                            ],
                          ),
                        ],
                      ),
                      trailing: const Icon(Icons.chevron_right_rounded),
                      onTap: () => _openToolDetail(tool),
                    ),
                  ),
                  const SizedBox(height: 8),
                ],
            ],
          ),
        );
      },
    );
  }
}

class _McpToolDetailSheet extends ConsumerWidget {
  const _McpToolDetailSheet({required this.tool, required this.onDeactivate});

  final McpToolDefinitionDto tool;
  final Future<void> Function() onDeactivate;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
      child: ListView(
        shrinkWrap: true,
        children: [
          Text(tool.title ?? tool.name, style: theme.textTheme.headlineSmall),
          const SizedBox(height: 8),
          Text(tool.description ?? '无描述'),
          const SizedBox(height: 16),
          ResourceMetadataRow(label: '工具名', value: tool.name),
          if (tool.source != null)
            ResourceMetadataRow(label: '来源', value: tool.source!),
          if (tool.importedAt != null)
            ResourceMetadataRow(
              label: '导入时间',
              value: formatDateTime(tool.importedAt!),
            ),
          if (tool.createdAt != null)
            ResourceMetadataRow(
              label: '创建时间',
              value: formatDateTime(tool.createdAt!),
            ),
          if (tool.updatedAt != null)
            ResourceMetadataRow(
              label: '更新时间',
              value: formatDateTime(tool.updatedAt!),
            ),
          if (tool.portMappingMetadata != null) ...[
            const SizedBox(height: 16),
            JsonCodePanel(
              label: '端口映射',
              data: {
                'inputs': tool.portMappingMetadata!.inputs
                    .map(
                      (item) => {
                        'name': item.name,
                        'dataType': item.dataType,
                        'description': item.description,
                        'required': item.required,
                      },
                    )
                    .toList(growable: false),
                'outputs': tool.portMappingMetadata!.outputs
                    .map(
                      (item) => {
                        'name': item.name,
                        'dataType': item.dataType,
                        'description': item.description,
                        'required': item.required,
                      },
                    )
                    .toList(growable: false),
              },
            ),
          ],
          if (tool.inputSchema != null) ...[
            const SizedBox(height: 16),
            JsonCodePanel(label: '输入 Schema', data: tool.inputSchema),
          ],
          if (tool.annotations != null) ...[
            const SizedBox(height: 16),
            JsonCodePanel(label: '注解', data: tool.annotations),
          ],
          const SizedBox(height: 24),
          OutlinedButton.icon(
            onPressed: () async {
              try {
                await onDeactivate();
                if (!context.mounted) {
                  return;
                }
                Navigator.of(context).pop(true);
              } catch (error) {
                if (!context.mounted) {
                  return;
                }
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(content: Text(describeResourceError(error))),
                );
              }
            },
            icon: const Icon(Icons.pause_circle_outline_rounded),
            label: const Text('停用工具'),
          ),
        ],
      ),
    );
  }
}

class _McpDiscoverySheet extends ConsumerStatefulWidget {
  const _McpDiscoverySheet({this.existingDetail});

  final McpServerConfigDetailDto? existingDetail;

  bool get isReimport => existingDetail != null;

  @override
  ConsumerState<_McpDiscoverySheet> createState() => _McpDiscoverySheetState();
}

class _McpDiscoverySheetState extends ConsumerState<_McpDiscoverySheet> {
  late final TextEditingController _nameController;
  late final TextEditingController _descriptionController;
  late final TextEditingController _commandController;
  late final TextEditingController _argsController;
  late final TextEditingController _urlController;
  late final TextEditingController _credentialsController;
  late String _transportType;
  String _conflictStrategy = 'skip';
  bool _isTesting = false;
  bool _isDiscovering = false;
  bool _isSubmitting = false;
  String? _errorMessage;
  DiscoverMcpToolsResultDto? _discoveryResult;
  final Set<String> _selectedToolNames = <String>{};

  @override
  void initState() {
    super.initState();
    final existing = widget.existingDetail;
    _nameController = TextEditingController(text: existing?.name ?? '');
    _descriptionController = TextEditingController(
      text: existing?.description ?? '',
    );
    _commandController = TextEditingController(
      text: existing?.connection.command ?? '',
    );
    _argsController = TextEditingController(
      text: existing?.connection.args.join('\n') ?? '',
    );
    _urlController = TextEditingController(
      text: existing?.connection.url ?? '',
    );
    _credentialsController = TextEditingController();
    _transportType = existing?.transportType ?? 'stdio';

    if (widget.isReimport) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        unawaited(_discoverTools());
      });
    }
  }

  @override
  void dispose() {
    _nameController.dispose();
    _descriptionController.dispose();
    _commandController.dispose();
    _argsController.dispose();
    _urlController.dispose();
    _credentialsController.dispose();
    super.dispose();
  }

  McpConnectionConfigDto _buildConnection() {
    final credentials = _parseKeyValueLines(_credentialsController.text);
    if (_transportType == 'stdio') {
      return McpConnectionConfigDto(
        transportType: _transportType,
        command: _commandController.text.trim(),
        args: _parseLines(_argsController.text),
        env: credentials.isEmpty ? null : credentials,
      );
    }

    return McpConnectionConfigDto(
      transportType: _transportType,
      url: _urlController.text.trim(),
      headers: credentials.isEmpty ? null : credentials,
    );
  }

  Future<void> _testConnection() async {
    setState(() {
      _isTesting = true;
      _errorMessage = null;
    });

    try {
      final result = await ref
          .read(resourcesApiProvider)
          .testMcpConnection(_buildConnection());
      if (!mounted) {
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            result.serverInfo == null
                ? '连接测试成功'
                : '连接成功：${result.serverInfo!.name} ${result.serverInfo!.version}',
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
          _isTesting = false;
        });
      }
    }
  }

  Future<void> _discoverTools() async {
    if (!widget.isReimport && _nameController.text.trim().isEmpty) {
      setState(() {
        _errorMessage = '请先填写服务名称';
      });
      return;
    }

    setState(() {
      _isDiscovering = true;
      _errorMessage = null;
    });

    try {
      final api = ref.read(resourcesApiProvider);
      final result = widget.isReimport
          ? await api.rediscoverMcpTools(widget.existingDetail!.id)
          : await api.discoverMcpTools(_buildConnection());
      if (!mounted) {
        return;
      }
      setState(() {
        _discoveryResult = result;
        _selectedToolNames
          ..clear()
          ..addAll(result.tools.map((tool) => tool.name));
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
          _isDiscovering = false;
        });
      }
    }
  }

  Future<void> _submit() async {
    if (_selectedToolNames.isEmpty) {
      setState(() {
        _errorMessage = '至少选择一个工具';
      });
      return;
    }

    setState(() {
      _isSubmitting = true;
      _errorMessage = null;
    });

    try {
      final api = ref.read(resourcesApiProvider);
      final result = widget.isReimport
          ? await api.reimportMcpTools(
              configId: widget.existingDetail!.id,
              toolNames: _selectedToolNames.toList(growable: false),
              conflictStrategy: _conflictStrategy,
            )
          : await api.importMcpTools(
              serverName: _nameController.text.trim(),
              serverDescription: _descriptionController.text.trim(),
              connection: _buildConnection(),
              toolNames: _selectedToolNames.toList(growable: false),
              conflictStrategy: _conflictStrategy,
            );

      if (!mounted) {
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            '完成导入：新增 ${result.summary.imported}，覆盖 ${result.summary.overwritten}，跳过 ${result.summary.skipped}',
          ),
        ),
      );
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
          _isSubmitting = false;
        });
      }
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
            widget.isReimport ? '重新导入 MCP 工具' : '导入 MCP 工具',
            style: theme.textTheme.headlineSmall,
          ),
          const SizedBox(height: 8),
          Text(
            widget.isReimport
                ? '重新发现当前服务暴露的工具，并按冲突策略导入。'
                : '先填写连接信息，再发现并选择需要导入的工具。',
            style: theme.textTheme.bodySmall,
          ),
          const SizedBox(height: 20),
          if (!widget.isReimport) ...[
            TextField(
              controller: _nameController,
              decoration: const InputDecoration(labelText: '服务名称'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _descriptionController,
              minLines: 2,
              maxLines: 4,
              decoration: const InputDecoration(labelText: '描述'),
            ),
            const SizedBox(height: 16),
            Text('传输协议', style: theme.textTheme.labelLarge),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final transport in mcpTransportTypes)
                  ChoiceChip(
                    label: Text(transport),
                    selected: _transportType == transport,
                    onSelected: (_) {
                      setState(() {
                        _transportType = transport;
                      });
                    },
                  ),
              ],
            ),
            const SizedBox(height: 16),
            if (_transportType == 'stdio') ...[
              TextField(
                controller: _commandController,
                decoration: const InputDecoration(
                  labelText: '命令',
                  hintText: '例如 npx 或 node',
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _argsController,
                minLines: 2,
                maxLines: 4,
                decoration: const InputDecoration(
                  labelText: '参数（每行一个）',
                  hintText: '-y\n@modelcontextprotocol/server-filesystem',
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _credentialsController,
                minLines: 2,
                maxLines: 5,
                decoration: const InputDecoration(
                  labelText: '环境变量（每行 KEY=value）',
                  hintText: 'API_KEY=sk-xxxx',
                ),
              ),
            ] else ...[
              TextField(
                controller: _urlController,
                decoration: const InputDecoration(
                  labelText: '服务 URL',
                  hintText: 'https://example.com/mcp',
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _credentialsController,
                minLines: 2,
                maxLines: 5,
                decoration: const InputDecoration(
                  labelText: '请求头（每行 KEY=value）',
                  hintText: 'Authorization=Bearer token',
                ),
              ),
            ],
            const SizedBox(height: 20),
            Wrap(
              spacing: 12,
              runSpacing: 12,
              children: [
                FilledButton.tonalIcon(
                  onPressed: _isTesting ? null : _testConnection,
                  icon: _isTesting
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.wifi_tethering_rounded),
                  label: const Text('测试连接'),
                ),
                FilledButton.icon(
                  onPressed: _isDiscovering ? null : _discoverTools,
                  icon: _isDiscovering
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.travel_explore_rounded),
                  label: const Text('发现工具'),
                ),
              ],
            ),
          ] else if (_isDiscovering) ...[
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 24),
              child: Center(child: CircularProgressIndicator()),
            ),
          ] else
            FilledButton.icon(
              onPressed: _discoverTools,
              icon: const Icon(Icons.travel_explore_rounded),
              label: const Text('重新发现工具'),
            ),
          if (_errorMessage != null) ...[
            const SizedBox(height: 16),
            Text(
              _errorMessage!,
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.error,
              ),
            ),
          ],
          if (_discoveryResult != null) ...[
            const SizedBox(height: 24),
            if (_discoveryResult!.serverInfo != null)
              Card(
                child: ListTile(
                  contentPadding: const EdgeInsets.all(16),
                  leading: const Icon(Icons.dns_rounded),
                  title: Text(_discoveryResult!.serverInfo!.name),
                  subtitle: Text(
                    '版本 ${_discoveryResult!.serverInfo!.version}'
                    '${_discoveryResult!.serverInfo!.protocolVersion == null ? '' : ' · 协议 ${_discoveryResult!.serverInfo!.protocolVersion}'}',
                  ),
                ),
              ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: _conflictStrategy,
              decoration: const InputDecoration(labelText: '冲突策略'),
              items: const [
                DropdownMenuItem(value: 'skip', child: Text('skip')),
                DropdownMenuItem(value: 'overwrite', child: Text('overwrite')),
              ],
              onChanged: (value) {
                setState(() {
                  _conflictStrategy = value ?? 'skip';
                });
              },
            ),
            const SizedBox(height: 16),
            Text(
              '发现到 ${_discoveryResult!.tools.length} 个工具，已选 ${_selectedToolNames.length} 个',
              style: theme.textTheme.labelLarge,
            ),
            const SizedBox(height: 12),
            if (_discoveryResult!.tools.isEmpty)
              const Text('当前服务没有返回可导入工具')
            else
              for (final tool in _discoveryResult!.tools) ...[
                Card(
                  child: CheckboxListTile(
                    value: _selectedToolNames.contains(tool.name),
                    onChanged: (value) {
                      setState(() {
                        if (value == true) {
                          _selectedToolNames.add(tool.name);
                        } else {
                          _selectedToolNames.remove(tool.name);
                        }
                      });
                    },
                    title: Text(tool.title ?? tool.name),
                    subtitle: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const SizedBox(height: 4),
                        Text(tool.description ?? '无描述'),
                        if (tool.inputSchema != null) ...[
                          const SizedBox(height: 8),
                          Text(
                            '已提供输入 Schema',
                            style: theme.textTheme.labelSmall,
                          ),
                        ],
                      ],
                    ),
                    controlAffinity: ListTileControlAffinity.leading,
                  ),
                ),
                const SizedBox(height: 8),
              ],
            const SizedBox(height: 20),
            FilledButton.icon(
              onPressed: _isSubmitting ? null : _submit,
              icon: _isSubmitting
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.download_done_rounded),
              label: Text(widget.isReimport ? '重新导入所选工具' : '导入所选工具'),
            ),
          ],
        ],
      ),
    );
  }
}

class _McpEditSheet extends ConsumerStatefulWidget {
  const _McpEditSheet({required this.detail});

  final McpServerConfigDetailDto detail;

  @override
  ConsumerState<_McpEditSheet> createState() => _McpEditSheetState();
}

class _McpEditSheetState extends ConsumerState<_McpEditSheet> {
  late final TextEditingController _nameController;
  late final TextEditingController _descriptionController;
  late final TextEditingController _commandController;
  late final TextEditingController _argsController;
  late final TextEditingController _urlController;
  late final TextEditingController _credentialsController;
  late String _status;
  late String _transportType;
  bool _replaceConnection = false;
  bool _isTesting = false;
  bool _isSaving = false;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _nameController = TextEditingController(text: widget.detail.name);
    _descriptionController = TextEditingController(
      text: widget.detail.description ?? '',
    );
    _commandController = TextEditingController(
      text: widget.detail.connection.command ?? '',
    );
    _argsController = TextEditingController(
      text: widget.detail.connection.args.join('\n'),
    );
    _urlController = TextEditingController(
      text: widget.detail.connection.url ?? '',
    );
    _credentialsController = TextEditingController();
    _status = widget.detail.status;
    _transportType = widget.detail.transportType;
  }

  @override
  void dispose() {
    _nameController.dispose();
    _descriptionController.dispose();
    _commandController.dispose();
    _argsController.dispose();
    _urlController.dispose();
    _credentialsController.dispose();
    super.dispose();
  }

  McpConnectionConfigDto _buildConnection() {
    final credentials = _parseKeyValueLines(_credentialsController.text);
    if (_transportType == 'stdio') {
      return McpConnectionConfigDto(
        transportType: _transportType,
        command: _commandController.text.trim(),
        args: _parseLines(_argsController.text),
        env: credentials.isEmpty ? null : credentials,
      );
    }

    return McpConnectionConfigDto(
      transportType: _transportType,
      url: _urlController.text.trim(),
      headers: credentials.isEmpty ? null : credentials,
    );
  }

  Future<void> _testConnection() async {
    setState(() {
      _isTesting = true;
      _errorMessage = null;
    });

    try {
      final result = await ref
          .read(resourcesApiProvider)
          .testMcpConnection(_buildConnection());
      if (!mounted) {
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            result.serverInfo == null
                ? '连接测试成功'
                : '连接成功：${result.serverInfo!.name} ${result.serverInfo!.version}',
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
          _isTesting = false;
        });
      }
    }
  }

  Future<void> _save() async {
    setState(() {
      _isSaving = true;
      _errorMessage = null;
    });

    try {
      await ref
          .read(resourcesApiProvider)
          .updateMcpServerConfig(
            widget.detail.id,
            name: _nameController.text,
            description: _descriptionController.text,
            status: _status,
            connection: _replaceConnection ? _buildConnection() : null,
          );
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

    return Padding(
      padding: EdgeInsets.fromLTRB(20, 12, 20, 24 + viewInsets),
      child: ListView(
        shrinkWrap: true,
        children: [
          Text('编辑 MCP 服务', style: theme.textTheme.headlineSmall),
          const SizedBox(height: 20),
          TextField(
            controller: _nameController,
            decoration: const InputDecoration(labelText: '服务名称'),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _descriptionController,
            minLines: 2,
            maxLines: 4,
            decoration: const InputDecoration(labelText: '描述'),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: _status,
            decoration: const InputDecoration(labelText: '状态'),
            items: const [
              DropdownMenuItem(value: 'active', child: Text('active')),
              DropdownMenuItem(value: 'inactive', child: Text('inactive')),
            ],
            onChanged: (value) {
              setState(() {
                _status = value ?? 'active';
              });
            },
          ),
          const SizedBox(height: 16),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('替换连接配置'),
            subtitle: Text(
              widget.detail.credentialKeys.isEmpty
                  ? '关闭时仅更新名称、描述和状态'
                  : '关闭时保留当前凭证键：${widget.detail.credentialKeys.join(', ')}',
            ),
            value: _replaceConnection,
            onChanged: (value) {
              setState(() {
                _replaceConnection = value;
              });
            },
          ),
          if (_replaceConnection) ...[
            const SizedBox(height: 8),
            Text('传输协议', style: theme.textTheme.labelLarge),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final transport in mcpTransportTypes)
                  ChoiceChip(
                    label: Text(transport),
                    selected: _transportType == transport,
                    onSelected: (_) {
                      setState(() {
                        _transportType = transport;
                      });
                    },
                  ),
              ],
            ),
            const SizedBox(height: 16),
            if (_transportType == 'stdio') ...[
              TextField(
                controller: _commandController,
                decoration: const InputDecoration(labelText: '命令'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _argsController,
                minLines: 2,
                maxLines: 4,
                decoration: const InputDecoration(labelText: '参数（每行一个）'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _credentialsController,
                minLines: 2,
                maxLines: 5,
                decoration: const InputDecoration(
                  labelText: '环境变量（每行 KEY=value）',
                ),
              ),
            ] else ...[
              TextField(
                controller: _urlController,
                decoration: const InputDecoration(labelText: '服务 URL'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _credentialsController,
                minLines: 2,
                maxLines: 5,
                decoration: const InputDecoration(
                  labelText: '请求头（每行 KEY=value）',
                ),
              ),
            ],
            const SizedBox(height: 12),
            FilledButton.tonalIcon(
              onPressed: _isTesting ? null : _testConnection,
              icon: _isTesting
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.wifi_tethering_rounded),
              label: const Text('测试新连接'),
            ),
          ],
          if (_errorMessage != null) ...[
            const SizedBox(height: 16),
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
            label: const Text('保存修改'),
          ),
        ],
      ),
    );
  }
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

List<String> _parseLines(String raw) {
  return raw
      .split('\n')
      .map((line) => line.trim())
      .where((line) => line.isNotEmpty)
      .toList(growable: false);
}

Map<String, String> _parseKeyValueLines(String raw) {
  final result = <String, String>{};

  for (final line in raw.split('\n')) {
    final trimmed = line.trim();
    if (trimmed.isEmpty) {
      continue;
    }

    final separatorIndex = trimmed.contains('=')
        ? trimmed.indexOf('=')
        : trimmed.indexOf(':');
    if (separatorIndex <= 0) {
      continue;
    }

    final key = trimmed.substring(0, separatorIndex).trim();
    final value = trimmed.substring(separatorIndex + 1).trim();
    if (key.isEmpty) {
      continue;
    }
    result[key] = value;
  }

  return result;
}

IconData _transportIcon(String transportType) {
  switch (transportType) {
    case 'stdio':
      return Icons.terminal_rounded;
    case 'sse':
      return Icons.podcasts_rounded;
    case 'streamable_http':
      return Icons.swap_horiz_rounded;
    default:
      return Icons.extension_rounded;
  }
}
