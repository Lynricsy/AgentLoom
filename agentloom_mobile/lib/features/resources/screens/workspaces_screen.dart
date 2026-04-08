import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/models/paginated_response.dart';
import '../api/resources_api.dart';
import '../models/resource_entities.dart';
import '../widgets/resource_shared.dart';

class WorkspacesScreen extends ConsumerStatefulWidget {
  const WorkspacesScreen({super.key});

  @override
  ConsumerState<WorkspacesScreen> createState() => _WorkspacesScreenState();
}

class _WorkspacesScreenState extends ConsumerState<WorkspacesScreen> {
  final _searchController = TextEditingController();
  bool _showExecutionArchives = false;
  late Future<PaginatedResponse<WorkspaceDto>> _future;

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

  Future<PaginatedResponse<WorkspaceDto>> _load() {
    return ref
        .read(resourcesApiProvider)
        .listWorkspaces(
          search: _searchController.text.trim().isEmpty
              ? null
              : _searchController.text.trim(),
          includeAutoArchived: _showExecutionArchives,
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
        title: const Text('工作区'),
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
              hintText: '搜索工作区名称',
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
            child: Align(
              alignment: Alignment.centerLeft,
              child: FilterChip(
                label: const Text('显示执行归档'),
                selected: _showExecutionArchives,
                onSelected: (selected) {
                  setState(() {
                    _showExecutionArchives = selected;
                    _future = _load();
                  });
                },
              ),
            ),
          ),
          Expanded(
            child: FutureBuilder<PaginatedResponse<WorkspaceDto>>(
              future: _future,
              builder: (context, snapshot) {
                if (snapshot.connectionState != ConnectionState.done) {
                  return const Center(child: CircularProgressIndicator());
                }
                if (snapshot.hasError) {
                  return ResourceErrorState(
                    message: '加载工作区失败：${snapshot.error}',
                    onRetry: () => unawaited(_reload()),
                  );
                }

                final items = snapshot.data?.data ?? const <WorkspaceDto>[];
                if (items.isEmpty) {
                  return RefreshIndicator(
                    onRefresh: _reload,
                    child: ListView(
                      children: [
                        const SizedBox(height: 80),
                        ResourceEmptyState(
                          icon: Icons.folder_open_outlined,
                          title: '还没有工作区',
                          description: _showExecutionArchives
                              ? '当前筛选下没有工作区。'
                              : '默认隐藏执行归档快照，可以先创建一个空工作区，后续再绑定到 Agent 或沙箱。',
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
                      final workspace = items[index];
                      return Card(
                        child: ListTile(
                          contentPadding: const EdgeInsets.all(16),
                          leading: const Icon(Icons.folder_copy_outlined),
                          title: Text(workspace.name),
                          subtitle: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const SizedBox(height: 4),
                              Text(workspace.description ?? '无描述'),
                              const SizedBox(height: 8),
                              Text(
                                '${workspace.sourceLabel} · ${workspace.status} · ${formatBytes(workspace.sizeBytes)} · ${formatDateTime(workspace.updatedAt)}',
                                style: Theme.of(context).textTheme.labelSmall,
                              ),
                            ],
                          ),
                          trailing: const Icon(Icons.chevron_right),
                          onTap: () => _showDetailSheet(workspace),
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

  Future<void> _showCreateDialog() async {
    final nameController = TextEditingController();
    final descriptionController = TextEditingController();

    try {
      final created = await showDialog<bool>(
        context: context,
        builder: (context) {
          return AlertDialog(
            title: const Text('新建工作区'),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: nameController,
                  decoration: const InputDecoration(labelText: '名称'),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: descriptionController,
                  minLines: 2,
                  maxLines: 4,
                  decoration: const InputDecoration(labelText: '描述'),
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
                      .createWorkspace(
                        name: nameController.text.trim(),
                        description: descriptionController.text.trim(),
                      );
                  if (!context.mounted) {
                    return;
                  }
                  Navigator.of(context).pop(true);
                },
                child: const Text('创建'),
              ),
            ],
          );
        },
      );

      if (created == true) {
        await _reload();
      }
    } finally {
      nameController.dispose();
      descriptionController.dispose();
    }
  }

  void _showDetailSheet(WorkspaceDto workspace) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (context) {
        return Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
          child: ListView(
            shrinkWrap: true,
            children: [
              Text(
                workspace.name,
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              const SizedBox(height: 12),
              if (workspace.description != null &&
                  workspace.description!.isNotEmpty)
                Text(workspace.description!),
              const SizedBox(height: 16),
              ResourceMetadataRow(label: '来源', value: workspace.sourceLabel),
              ResourceMetadataRow(label: '状态', value: workspace.status),
              ResourceMetadataRow(
                label: '大小',
                value: formatBytes(workspace.sizeBytes),
              ),
              ResourceMetadataRow(
                label: '创建时间',
                value: formatDateTime(workspace.createdAt),
              ),
              ResourceMetadataRow(
                label: '更新时间',
                value: formatDateTime(workspace.updatedAt),
              ),
              ResourceMetadataRow(label: '存储键', value: workspace.storageKey),
              if (workspace.config != null) ...[
                const SizedBox(height: 16),
                JsonCodePanel(label: '配置', data: workspace.config),
              ],
              const SizedBox(height: 24),
              OutlinedButton.icon(
                onPressed: () async {
                  await ref
                      .read(resourcesApiProvider)
                      .deleteWorkspace(workspace.id);
                  if (!context.mounted) {
                    return;
                  }
                  Navigator.of(context).pop();
                  await _reload();
                },
                icon: const Icon(Icons.delete_outline),
                label: const Text('删除工作区'),
              ),
            ],
          ),
        );
      },
    );
  }
}
