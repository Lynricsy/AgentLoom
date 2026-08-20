import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/widgets/resource_source_chip.dart';
import '../api/resources_api.dart';
import '../models/resource_dtos.dart';
import '../providers/mcp_provider.dart';
import '../widgets/resource_shared.dart';
import 'mcp_discovery_sheet.dart';
import 'mcp_edit_sheet.dart';

class McpServerDetailSheet extends ConsumerStatefulWidget {
  const McpServerDetailSheet({super.key, required this.summary});

  final McpServerConfigSummaryDto summary;

  @override
  ConsumerState<McpServerDetailSheet> createState() =>
      _McpServerDetailSheetState();
}

class _McpServerDetailSheetState extends ConsumerState<McpServerDetailSheet> {
  late Future<McpServerConfigDetailDto> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<McpServerConfigDetailDto> _load() =>
      ref.read(mcpServerDetailProvider(widget.summary.id).future);

  Future<void> _reload() async {
    ref.invalidate(mcpServerDetailProvider(widget.summary.id));
    ref.invalidate(mcpServerListProvider);
    setState(() => _future = _load());
    await _future;
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
      builder: (context) => McpEditSheet(detail: detail),
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
      builder: (context) => McpDiscoverySheet(existingDetail: detail),
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
              ResourceMetadataRow(
                label: '来源',
                value: getResourceSourceLabel(detail.sourceKind),
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
                  if (detail.sourceKind == 'share_imported')
                    OutlinedButton.icon(
                      onPressed: () async {
                        final messenger = ScaffoldMessenger.of(context);
                        final navigator = Navigator.of(context);
                        await ref
                            .read(resourcesApiProvider)
                            .convertMcpServerConfigSourceToManual(detail.id);
                        if (!mounted) {
                          return;
                        }
                        navigator.pop(true);
                        messenger.showSnackBar(
                          const SnackBar(content: Text('已转为自己创建')),
                        );
                      },
                      icon: const Icon(Icons.drive_file_rename_outline),
                      label: const Text('转为自己创建'),
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
