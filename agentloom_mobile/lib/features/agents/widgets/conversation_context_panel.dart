import 'package:flutter/material.dart';

import '../models/conversation_message_dto.dart';

class ConversationContextPanel extends StatelessWidget {
  const ConversationContextPanel({
    super.key,
    required this.state,
    required this.onRefreshWorkspace,
    required this.onOpenFile,
    this.compact = false,
  });

  final ConversationState state;
  final Future<void> Function() onRefreshWorkspace;
  final Future<void> Function(String path) onOpenFile;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerLowest,
        border: compact
            ? null
            : Border(
                left: BorderSide(
                  color: Theme.of(context).colorScheme.outlineVariant,
                ),
              ),
      ),
      child: DefaultTabController(
        length: 3,
        child: Column(
          children: [
            const SizedBox(height: 8),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      '运行上下文',
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  IconButton(
                    tooltip: '刷新工作区',
                    onPressed: state.isLoadingWorkspace
                        ? null
                        : () => onRefreshWorkspace(),
                    icon: state.isLoadingWorkspace
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.refresh),
                  ),
                ],
              ),
            ),
            const TabBar(
              tabs: [
                Tab(text: '终端'),
                Tab(text: '工作区'),
                Tab(text: '变更'),
              ],
            ),
            Expanded(
              child: TabBarView(
                children: [
                  _TerminalTab(entries: state.terminalEntries),
                  _WorkspaceTab(
                    state: state,
                    onOpenFile: onOpenFile,
                  ),
                  _FileChangesTab(changes: state.fileChanges),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _TerminalTab extends StatelessWidget {
  const _TerminalTab({required this.entries});

  final List<TerminalEntry> entries;

  @override
  Widget build(BuildContext context) {
    if (entries.isEmpty) {
      return const _EmptyPanelState(
        icon: Icons.terminal,
        title: '还没有终端输出',
        description: 'Agent 开始调用 bash / pty 工具后，这里会展示完整输出。',
      );
    }

    return ListView.separated(
      padding: const EdgeInsets.all(12),
      itemCount: entries.length,
      separatorBuilder: (_, _) => const SizedBox(height: 12),
      itemBuilder: (context, index) {
        final entry = entries[index];
        return _ConsoleCard(entry: entry);
      },
    );
  }
}

class _WorkspaceTab extends StatelessWidget {
  const _WorkspaceTab({
    required this.state,
    required this.onOpenFile,
  });

  final ConversationState state;
  final Future<void> Function(String path) onOpenFile;

  @override
  Widget build(BuildContext context) {
    if (state.fileTree.isEmpty && state.selectedFileContent == null) {
      return const _EmptyPanelState(
        icon: Icons.folder_open_outlined,
        title: '工作区暂不可见',
        description: '沙箱建立后，文件树和文件预览会显示在这里。',
      );
    }

    return LayoutBuilder(
      builder: (context, constraints) {
        final vertical = constraints.maxWidth < 720;
        if (vertical) {
          return Column(
            children: [
              Expanded(
                child: _WorkspaceTree(
                  nodes: state.fileTree,
                  selectedFilePath: state.selectedFilePath,
                  onOpenFile: onOpenFile,
                ),
              ),
              const Divider(height: 1),
              Expanded(
                child: _WorkspacePreview(
                  selectedFilePath: state.selectedFilePath,
                  selectedFileContent: state.selectedFileContent,
                ),
              ),
            ],
          );
        }

        return Row(
          children: [
            SizedBox(
              width: 300,
              child: _WorkspaceTree(
                nodes: state.fileTree,
                selectedFilePath: state.selectedFilePath,
                onOpenFile: onOpenFile,
              ),
            ),
            const VerticalDivider(width: 1),
            Expanded(
              child: _WorkspacePreview(
                selectedFilePath: state.selectedFilePath,
                selectedFileContent: state.selectedFileContent,
              ),
            ),
          ],
        );
      },
    );
  }
}

class _WorkspaceTree extends StatelessWidget {
  const _WorkspaceTree({
    required this.nodes,
    required this.selectedFilePath,
    required this.onOpenFile,
  });

  final List<WorkspaceFileNode> nodes;
  final String? selectedFilePath;
  final Future<void> Function(String path) onOpenFile;

  @override
  Widget build(BuildContext context) {
    if (nodes.isEmpty) {
      return const _EmptyPanelState(
        icon: Icons.folder_open_outlined,
        title: '没有文件树',
        description: '等工具对工作区产生操作后再刷新即可。',
      );
    }

    return ListView(
      padding: const EdgeInsets.all(8),
      children: nodes.map((node) {
        return _WorkspaceTreeNode(
          node: node,
          selectedFilePath: selectedFilePath,
          onOpenFile: onOpenFile,
        );
      }).toList(growable: false),
    );
  }
}

class _WorkspaceTreeNode extends StatelessWidget {
  const _WorkspaceTreeNode({
    required this.node,
    required this.selectedFilePath,
    required this.onOpenFile,
  });

  final WorkspaceFileNode node;
  final String? selectedFilePath;
  final Future<void> Function(String path) onOpenFile;

  @override
  Widget build(BuildContext context) {
    if (node.isDirectory) {
      return ExpansionTile(
        tilePadding: const EdgeInsets.symmetric(horizontal: 8),
        childrenPadding: const EdgeInsets.only(left: 12),
        leading: const Icon(Icons.folder_outlined, size: 18),
        title: Text(
          node.name,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        children: node.children
            .map(
              (child) => _WorkspaceTreeNode(
                node: child,
                selectedFilePath: selectedFilePath,
                onOpenFile: onOpenFile,
              ),
            )
            .toList(growable: false),
      );
    }

    final selected = selectedFilePath == node.path;
    return ListTile(
      dense: true,
      selected: selected,
      leading: const Icon(Icons.insert_drive_file_outlined, size: 18),
      title: Text(
        node.name,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
      ),
      subtitle: Text(
        node.path,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
          fontFamily: 'monospace',
        ),
      ),
      onTap: () => onOpenFile(node.path),
    );
  }
}

class _WorkspacePreview extends StatelessWidget {
  const _WorkspacePreview({
    required this.selectedFilePath,
    required this.selectedFileContent,
  });

  final String? selectedFilePath;
  final WorkspaceFileContent? selectedFileContent;

  @override
  Widget build(BuildContext context) {
    if (selectedFilePath == null) {
      return const _EmptyPanelState(
        icon: Icons.description_outlined,
        title: '选择一个文件',
        description: '点击左侧文件树中的文件后，这里会展示内容预览。',
      );
    }

    if (selectedFileContent == null) {
      return _EmptyPanelState(
        icon: Icons.hourglass_bottom_outlined,
        title: '正在加载文件',
        description: selectedFilePath!,
      );
    }

    return Padding(
      padding: const EdgeInsets.all(12),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(20),
        ),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                selectedFileContent!.path,
                style: Theme.of(context).textTheme.labelLarge?.copyWith(
                  fontFamily: 'monospace',
                ),
              ),
              const SizedBox(height: 10),
              Expanded(
                child: SingleChildScrollView(
                  child: SelectableText(
                    selectedFileContent!.content,
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      fontFamily: 'monospace',
                      height: 1.45,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _FileChangesTab extends StatelessWidget {
  const _FileChangesTab({required this.changes});

  final List<WorkspaceFileChange> changes;

  @override
  Widget build(BuildContext context) {
    if (changes.isEmpty) {
      return const _EmptyPanelState(
        icon: Icons.auto_awesome_motion_outlined,
        title: '还没有文件变更',
        description: '当 Agent 修改工作区文件时，这里会保留最近的变更记录。',
      );
    }

    return ListView.separated(
      padding: const EdgeInsets.all(12),
      itemCount: changes.length,
      separatorBuilder: (_, _) => const SizedBox(height: 12),
      itemBuilder: (context, index) {
        final change = changes[index];
        return _FileChangeCard(change: change);
      },
    );
  }
}

class _ConsoleCard extends StatelessWidget {
  const _ConsoleCard({required this.entry});

  final TerminalEntry entry;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: const Color(0xFF0F172A),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (entry.command != null && entry.command!.isNotEmpty) ...[
              Text(
                '\$ ${entry.command}',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: const Color(0xFF89DDFF),
                  fontFamily: 'monospace',
                ),
              ),
              const SizedBox(height: 8),
            ],
            SelectableText(
              entry.output,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: const Color(0xFFE2E8F0),
                fontFamily: 'monospace',
                height: 1.45,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _FileChangeCard extends StatelessWidget {
  const _FileChangeCard({required this.change});

  final WorkspaceFileChange change;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerLow,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: theme.colorScheme.outlineVariant),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text(
                  _changeLabel(change.changeType),
                  style: theme.textTheme.labelLarge?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    change.path,
                    style: theme.textTheme.bodySmall?.copyWith(
                      fontFamily: 'monospace',
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
            if (change.diff != null && change.diff!.isNotEmpty) ...[
              const SizedBox(height: 10),
              _MonospacePanel(label: 'Diff', content: change.diff!),
            ],
            if (change.content != null && change.content!.isNotEmpty) ...[
              const SizedBox(height: 10),
              _MonospacePanel(label: '内容', content: change.content!),
            ],
          ],
        ),
      ),
    );
  }
}

class _MonospacePanel extends StatelessWidget {
  const _MonospacePanel({
    required this.label,
    required this.content,
  });

  final String label;
  final String content;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: Theme.of(context).textTheme.labelMedium?.copyWith(
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 8),
        DecoratedBox(
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.surfaceContainerHighest,
            borderRadius: BorderRadius.circular(14),
          ),
          child: Padding(
            padding: const EdgeInsets.all(10),
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: SelectableText(
                content,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  fontFamily: 'monospace',
                  height: 1.45,
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _EmptyPanelState extends StatelessWidget {
  const _EmptyPanelState({
    required this.icon,
    required this.title,
    required this.description,
  });

  final IconData icon;
  final String title;
  final String description;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              icon,
              size: 28,
              color: theme.colorScheme.onSurfaceVariant,
            ),
            const SizedBox(height: 12),
            Text(
              title,
              style: theme.textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.w700,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text(
              description,
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}

String _changeLabel(String changeType) {
  return switch (changeType) {
    'created' => '新增',
    'deleted' => '删除',
    _ => '修改',
  };
}
