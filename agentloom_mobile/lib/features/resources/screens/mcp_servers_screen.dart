import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/models/paginated_response.dart';
import '../../../shared/widgets/resource_source_chip.dart';
import '../models/resource_dtos.dart';
import '../widgets/resource_shared.dart';
import '../providers/mcp_provider.dart';
import 'mcp_discovery_sheet.dart';
import 'mcp_server_detail_sheet.dart';

class McpServersScreen extends ConsumerStatefulWidget {
  const McpServersScreen({super.key});

  @override
  ConsumerState<McpServersScreen> createState() => _McpServersScreenState();
}

class _McpServersScreenState extends ConsumerState<McpServersScreen> {
  final _searchController = TextEditingController();
  String? _statusFilter;
  String? _transportFilter;
  String? _sourceKindFilter;
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

  McpServerListParams get _params => (
    search: _searchController.text.trim().isEmpty
        ? null
        : _searchController.text.trim(),
    status: _statusFilter,
    transportType: _transportFilter,
    sourceKind: _sourceKindFilter,
  );

  Future<PaginatedResponse<McpServerConfigSummaryDto>> _load() =>
      ref.read(mcpServerListProvider(_params).future);

  Future<void> _reload() async {
    ref.invalidate(mcpServerListProvider);
    setState(() => _future = _load());
    await _future;
  }

  Future<void> _openImportSheet() async {
    final imported = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (context) => const McpDiscoverySheet(),
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
      builder: (context) => McpServerDetailSheet(summary: summary),
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
        title: const Text('MCP 服务'),
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
                        label: _mcpStatusLabel(status),
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
                const SizedBox(height: 12),
                Text('来源', style: theme.textTheme.labelLarge),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    _FilterChip(
                      label: '全部',
                      selected: _sourceKindFilter == null,
                      onSelected: () {
                        setState(() {
                          _sourceKindFilter = null;
                          _future = _load();
                        });
                      },
                    ),
                    _FilterChip(
                      label: '自己创建',
                      selected: _sourceKindFilter == 'manual',
                      onSelected: () {
                        setState(() {
                          _sourceKindFilter = 'manual';
                          _future = _load();
                        });
                      },
                    ),
                    _FilterChip(
                      label: '分享导入',
                      selected: _sourceKindFilter == 'share_imported',
                      onSelected: () {
                        setState(() {
                          _sourceKindFilter = 'share_imported';
                          _future = _load();
                        });
                      },
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
                                  ResourceSourceChip(
                                    sourceKind: config.sourceKind,
                                    compact: true,
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


String _mcpStatusLabel(String status) {
  return switch (status) {
    'active' => '活跃',
    'inactive' => '未激活',
    'error' => '异常',
    _ => status,
  };
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
