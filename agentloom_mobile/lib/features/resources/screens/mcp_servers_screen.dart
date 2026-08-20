import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

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
  String? _search;

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  McpServerListQuery get _query => McpServerListQuery(
    search: _search,
    status: _statusFilter,
    transportType: _transportFilter,
    sourceKind: _sourceKindFilter,
  );

  void _submitSearch() {
    final value = _searchController.text.trim();
    setState(() => _search = value.isEmpty ? null : value);
  }

  Future<void> _refresh(McpServerListQuery query) async {
    final provider = mcpServerListProvider(query);
    ref.invalidate(provider);
    await ref.read(provider.future);
  }

  Future<void> _openImportSheet() async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (context) => const McpDiscoverySheet(),
    );
  }

  Future<void> _openDetailSheet(McpServerConfigSummaryDto summary) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (context) => McpServerDetailSheet(summary: summary),
    );
  }

  void _applyStatusFilter(String? value) {
    setState(() => _statusFilter = value);
  }

  void _applyTransportFilter(String? value) {
    setState(() => _transportFilter = value);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final query = _query;
    final servers = ref.watch(mcpServerListProvider(query));

    return Scaffold(
      appBar: AppBar(
        title: const Text('MCP 服务'),
        actions: [
          IconButton(
            onPressed: () => unawaited(_refresh(query)),
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
                    _submitSearch();
                  },
                  icon: const Icon(Icons.close),
                ),
              ],
              onSubmitted: (_) => _submitSearch(),
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
                        setState(() => _sourceKindFilter = null);
                      },
                    ),
                    _FilterChip(
                      label: '自己创建',
                      selected: _sourceKindFilter == 'manual',
                      onSelected: () {
                        setState(() => _sourceKindFilter = 'manual');
                      },
                    ),
                    _FilterChip(
                      label: '分享导入',
                      selected: _sourceKindFilter == 'share_imported',
                      onSelected: () {
                        setState(() => _sourceKindFilter = 'share_imported');
                      },
                    ),
                  ],
                ),
              ],
            ),
          ),
          Expanded(
            child: servers.when(
              skipLoadingOnRefresh: false,
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (error, _) => ResourceErrorState(
                message: '加载 MCP 配置失败：${describeResourceError(error)}',
                onRetry: () => unawaited(_refresh(query)),
              ),
              data: (response) {
                final items = response.data;
                if (items.isEmpty) {
                  return RefreshIndicator(
                    onRefresh: () => _refresh(query),
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
                  onRefresh: () => _refresh(query),
                  child: ListView.separated(
                    padding: const EdgeInsets.fromLTRB(20, 12, 20, 100),
                    itemCount: items.length,
                    separatorBuilder: (_, _) => const SizedBox(height: 12),
                    itemBuilder: (context, index) {
                      final config = items[index];
                      final lastTestedAt = config.lastTestedAt;
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
                                  if (lastTestedAt != null)
                                    Chip(
                                      label: Text(
                                        '已测 ${formatDateTime(lastTestedAt)}',
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
