import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/widgets/resource_source_chip.dart';
import '../api/resources_api.dart';
import '../models/resource_dtos.dart';
import '../providers/knowledge_base_provider.dart';
import '../widgets/resource_shared.dart';

class KnowledgeBasesScreen extends ConsumerStatefulWidget {
  const KnowledgeBasesScreen({super.key});

  @override
  ConsumerState<KnowledgeBasesScreen> createState() =>
      _KnowledgeBasesScreenState();
}

class _KnowledgeBasesScreenState extends ConsumerState<KnowledgeBasesScreen> {
  String? _sourceKindFilter;

  KnowledgeBaseListQuery get _query =>
      KnowledgeBaseListQuery(sourceKind: _sourceKindFilter);

  Future<void> _refresh(KnowledgeBaseListQuery query) async {
    final provider = knowledgeBaseListProvider(query);
    ref.invalidate(provider);
    await ref.read(provider.future);
  }

  @override
  Widget build(BuildContext context) {
    final query = _query;
    final knowledgeBases = ref.watch(knowledgeBaseListProvider(query));
    return Scaffold(
      appBar: AppBar(
        title: const Text('知识库'),
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
      body: knowledgeBases.when(
        skipLoadingOnRefresh: false,
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => ResourceErrorState(
          message: '加载知识库失败：$error',
          onRetry: () => unawaited(_refresh(query)),
        ),
        data: (response) {
          final items = response.data;
          if (items.isEmpty) {
            return RefreshIndicator(
              onRefresh: () => _refresh(query),
              child: ListView(
                padding: const EdgeInsets.fromLTRB(20, 12, 20, 100),
                children: [
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      _FilterChip(
                        label: '全部来源',
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
                  const SizedBox(height: 80),
                  const ResourceEmptyState(
                    icon: Icons.library_books_outlined,
                    title: '还没有知识库',
                    description: '可以先创建一个知识库，随后在 Web Studio 上传文档并参与检索。',
                  ),
                ],
              ),
            );
          }

          return RefreshIndicator(
            onRefresh: () => _refresh(query),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 100),
              children: [
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    _FilterChip(
                      label: '全部来源',
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
                const SizedBox(height: 12),
                ...List.generate(items.length, (index) {
                  final knowledgeBase = items[index];
                  return Padding(
                    padding: EdgeInsets.only(
                      bottom: index == items.length - 1 ? 0 : 12,
                    ),
                    child: Card(
                      child: ListTile(
                        contentPadding: const EdgeInsets.all(16),
                        leading: const Icon(Icons.menu_book_outlined),
                        title: Text(knowledgeBase.name),
                        subtitle: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const SizedBox(height: 4),
                            Text(knowledgeBase.description ?? '无描述'),
                            const SizedBox(height: 8),
                            Wrap(
                              spacing: 8,
                              runSpacing: 8,
                              children: [
                                Chip(
                                  label: Text(knowledgeBase.status),
                                  visualDensity: VisualDensity.compact,
                                ),
                                ResourceSourceChip(
                                  sourceKind: knowledgeBase.sourceKind,
                                  compact: true,
                                ),
                                Chip(
                                  label: Text(
                                    '${knowledgeBase.documentCount} 文档',
                                  ),
                                  visualDensity: VisualDensity.compact,
                                ),
                                Chip(
                                  label: Text(
                                    '${knowledgeBase.chunkCount} Chunk',
                                  ),
                                  visualDensity: VisualDensity.compact,
                                ),
                              ],
                            ),
                          ],
                        ),
                        trailing: const Icon(Icons.chevron_right),
                        onTap: () => _showDetailSheet(knowledgeBase),
                      ),
                    ),
                  );
                }),
              ],
            ),
          );
        },
      ),
    );
  }

  Future<void> _showCreateDialog() async {
    final nameController = TextEditingController();
    final descriptionController = TextEditingController();
    var visibility = 'private';

    try {
      final created = await showDialog<bool>(
        context: context,
        builder: (context) {
          return StatefulBuilder(
            builder: (context, setDialogState) {
              return AlertDialog(
                title: const Text('新建知识库'),
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
                    const SizedBox(height: 12),
                    DropdownButtonFormField<String>(
                      initialValue: visibility,
                      decoration: const InputDecoration(labelText: '可见性'),
                      items: const [
                        DropdownMenuItem(value: 'private', child: Text('私密')),
                        DropdownMenuItem(
                          value: 'organization',
                          child: Text('组织'),
                        ),
                      ],
                      onChanged: (value) {
                        setDialogState(() => visibility = value ?? 'private');
                      },
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
                          .createKnowledgeBase(
                            name: nameController.text.trim(),
                            description: descriptionController.text.trim(),
                            visibility: visibility,
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
        },
      );

      if (created == true) {
        await _refresh(_query);
      }
    } finally {
      nameController.dispose();
      descriptionController.dispose();
    }
  }

  void _showDetailSheet(KnowledgeBaseDto knowledgeBase) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (context) => _KnowledgeBaseDetailSheet(
        knowledgeBase: knowledgeBase,
        listQuery: _query,
      ),
    );
  }
}

class _KnowledgeBaseDetailSheet extends ConsumerWidget {
  const _KnowledgeBaseDetailSheet({
    required this.knowledgeBase,
    required this.listQuery,
  });

  final KnowledgeBaseDto knowledgeBase;
  final KnowledgeBaseListQuery listQuery;

  void _invalidate(WidgetRef ref) {
    ref.invalidate(knowledgeBaseListProvider(listQuery));
    ref.invalidate(knowledgeDocumentListProvider(knowledgeBase.id));
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final documents = ref.watch(
      knowledgeDocumentListProvider(knowledgeBase.id),
    );
    final description = knowledgeBase.description;
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
      child: ListView(
        shrinkWrap: true,
        children: [
          Text(
            knowledgeBase.name,
            style: Theme.of(context).textTheme.headlineSmall,
          ),
          const SizedBox(height: 12),
          if (description != null && description.isNotEmpty) Text(description),
          const SizedBox(height: 16),
          ResourceMetadataRow(label: '状态', value: knowledgeBase.status),
          ResourceMetadataRow(label: '可见性', value: knowledgeBase.visibility),
          ResourceMetadataRow(
            label: 'Embedding',
            value: knowledgeBase.embeddingModel,
          ),
          ResourceMetadataRow(
            label: '文档数',
            value: '${knowledgeBase.documentCount}',
          ),
          ResourceMetadataRow(
            label: 'Chunk 数',
            value: '${knowledgeBase.chunkCount}',
          ),
          ResourceMetadataRow(
            label: '来源',
            value: getResourceSourceLabel(knowledgeBase.sourceKind),
          ),
          ResourceMetadataRow(
            label: '更新时间',
            value: formatDateTime(knowledgeBase.updatedAt),
          ),
          const SizedBox(height: 20),
          Row(
            children: [
              Expanded(
                child: knowledgeBase.sourceKind == 'share_imported'
                    ? OutlinedButton.icon(
                        onPressed: () async {
                          final messenger = ScaffoldMessenger.of(context);
                          await ref
                              .read(resourcesApiProvider)
                              .convertKnowledgeBaseSourceToManual(
                                knowledgeBase.id,
                              );
                          if (!context.mounted) {
                            return;
                          }
                          _invalidate(ref);
                          Navigator.of(context).pop();
                          messenger.showSnackBar(
                            const SnackBar(content: Text('已转为自己创建')),
                          );
                        },
                        icon: const Icon(Icons.drive_file_rename_outline),
                        label: const Text('转为自己创建'),
                      )
                    : FilledButton.tonalIcon(
                        onPressed: () async {
                          await ref
                              .read(resourcesApiProvider)
                              .rebuildKnowledgeBase(knowledgeBase.id);
                          if (!context.mounted) {
                            return;
                          }
                          _invalidate(ref);
                          Navigator.of(context).pop();
                        },
                        icon: const Icon(Icons.restart_alt),
                        label: const Text('重建'),
                      ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () async {
                    await ref
                        .read(resourcesApiProvider)
                        .deleteKnowledgeBase(knowledgeBase.id);
                    if (!context.mounted) {
                      return;
                    }
                    _invalidate(ref);
                    Navigator.of(context).pop();
                  },
                  icon: const Icon(Icons.delete_outline),
                  label: const Text('删除'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 24),
          Text('文档', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 12),
          documents.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (error, _) => ResourceErrorState(
              message: '加载文档失败：$error',
              onRetry: () => ref.invalidate(
                knowledgeDocumentListProvider(knowledgeBase.id),
              ),
            ),
            data: (response) {
              if (response.data.isEmpty) {
                return const Text('暂无文档');
              }
              return Column(
                children: [
                  for (final document in response.data) ...[
                    Card(
                      child: ListTile(
                        title: Text(document.fileName),
                        subtitle: Text(
                          '${document.status} · ${formatBytes(document.sizeBytes)}',
                        ),
                        trailing: document.errorMessage != null
                            ? const Icon(Icons.error_outline)
                            : null,
                      ),
                    ),
                    const SizedBox(height: 8),
                  ],
                ],
              );
            },
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
      showCheckmark: false,
    );
  }
}
