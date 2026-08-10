import 'dart:async';

import 'package:agentloom_mobile/features/agents/models/conversation_message_dto.dart';
import 'package:agentloom_mobile/features/agents/widgets/conversation_context_panel.dart';
import 'package:agentloom_mobile/features/agents/widgets/message_bubble.dart';
import 'package:agentloom_mobile/features/execution/lib/workflow_agent_runtime.dart';
import 'package:agentloom_mobile/features/execution/models/execution_runtime.dart';
import 'package:agentloom_mobile/features/execution/models/execution_state.dart';
import 'package:agentloom_mobile/features/execution/providers/execution_monitor_provider.dart';
import 'package:agentloom_mobile/features/execution/providers/execution_monitor_state.dart';
import 'package:agentloom_mobile/features/workflows/api/workflow_api.dart';
import 'package:agentloom_mobile/shared/utils/scrolling.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

class WorkflowAgentViewerScreen extends ConsumerStatefulWidget {
  const WorkflowAgentViewerScreen({
    super.key,
    required this.executionId,
    required this.stepId,
  });

  final String executionId;
  final String stepId;

  @override
  ConsumerState<WorkflowAgentViewerScreen> createState() =>
      _WorkflowAgentViewerScreenState();
}

class _WorkflowAgentViewerScreenState
    extends ConsumerState<WorkflowAgentViewerScreen> {
  final ScrollController _scrollController = ScrollController();
  String? _lastScrollSignature;
  String? _workspaceBoundStepId;
  int _lastFileChangeCount = 0;

  List<WorkspaceFileNode> _fileTree = const <WorkspaceFileNode>[];
  String? _selectedFilePath;
  WorkspaceFileContent? _selectedFileContent;
  bool _isLoadingWorkspace = false;
  String? _workspaceError;

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final monitorAsync = ref.watch(
      executionMonitorProvider(widget.executionId),
    );

    ref.listen<AsyncValue<ExecutionMonitorState>>(
      executionMonitorProvider(widget.executionId),
      (_, next) {
        final state = next.value;
        final snapshot = extractMonitorSnapshot(state);
        final runtime = extractMonitorRuntime(state);
        final step = snapshot?.steps
            .where((item) => item.stepId == widget.stepId)
            .cast<StepSnapshot?>()
            .firstWhere((item) => item != null, orElse: () => null);
        if (step == null) {
          return;
        }

        final runtimeStep = runtime.stepById(step.stepId);
        final conversationState = buildWorkflowAgentConversationState(
          step: step,
          runtime: runtimeStep,
          fileTree: _fileTree,
          fileChanges: runtimeStep?.fileChanges,
          selectedFilePath: _selectedFilePath,
          selectedFileContent: _selectedFileContent,
          isLoadingWorkspace: _isLoadingWorkspace,
          error: _workspaceError,
        );

        final nextSignature = _buildScrollSignature(conversationState);
        if (nextSignature != _lastScrollSignature) {
          _lastScrollSignature = nextSignature;
          _scrollToBottom();
        }

        final nextFileChangeCount = runtimeStep?.fileChanges.length ?? 0;
        if (nextFileChangeCount > _lastFileChangeCount) {
          _lastFileChangeCount = nextFileChangeCount;
          unawaited(_refreshWorkspaceTree(silent: true));
        } else {
          _lastFileChangeCount = nextFileChangeCount;
        }
      },
    );

    return Scaffold(
      appBar: AppBar(
        title: const Text('Agent 运行视图'),
        actions: [
          IconButton(
            tooltip: '打开运行上下文',
            onPressed: () => _openContextSheet(context),
            icon: const Icon(Icons.dock_outlined),
          ),
        ],
      ),
      body: monitorAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => _buildErrorState('加载执行详情失败：$error'),
        data: (state) {
          final snapshot = extractMonitorSnapshot(state);
          if (snapshot == null) {
            return _buildErrorState('当前执行尚未生成可读取的快照。');
          }

          final runtime = extractMonitorRuntime(state);
          final step = snapshot.steps
              .where((item) => item.stepId == widget.stepId)
              .cast<StepSnapshot?>()
              .firstWhere((item) => item != null, orElse: () => null);
          if (step == null || !isWorkflowAgentNodeType(step.nodeType)) {
            return _buildErrorState('该节点不是可查看的 Agent 运行步骤。');
          }

          if (_workspaceBoundStepId != step.stepId) {
            _workspaceBoundStepId = step.stepId;
            WidgetsBinding.instance.addPostFrameCallback((_) {
              unawaited(_refreshWorkspaceTree(silent: true));
            });
          }

          final runtimeStep = runtime.stepById(step.stepId);
          final conversationState = buildWorkflowAgentConversationState(
            step: step,
            runtime: runtimeStep,
            fileTree: _fileTree,
            fileChanges: runtimeStep?.fileChanges,
            selectedFilePath: _selectedFilePath,
            selectedFileContent: _selectedFileContent,
            isLoadingWorkspace: _isLoadingWorkspace,
            error: _workspaceError,
          );

          return LayoutBuilder(
            builder: (context, constraints) {
              final showSidePanel = constraints.maxWidth >= 1040;
              final content = Column(
                children: [
                  _ViewerStatusHeader(
                    step: step,
                    runtime: runtimeStep,
                    connectionMode: extractMonitorConnectionMode(state),
                  ),
                  Expanded(
                    child: conversationState.messages.isEmpty
                        ? _EmptyViewerState(
                            isExecuting:
                                step.status == 'running' ||
                                step.status == 'queued' ||
                                step.status == 'waiting_intervention',
                          )
                        : ListView.builder(
                            controller: _scrollController,
                            padding: const EdgeInsets.fromLTRB(0, 12, 0, 12),
                            itemCount: conversationState.messages.length,
                            itemBuilder: (context, index) {
                              return MessageBubble(
                                message: conversationState.messages[index],
                              );
                            },
                          ),
                  ),
                ],
              );

              if (!showSidePanel) {
                return content;
              }

              return Row(
                children: [
                  Expanded(child: content),
                  SizedBox(
                    width: 380,
                    child: ConversationContextPanel(
                      state: conversationState,
                      onRefreshWorkspace: _refreshWorkspaceTree,
                      onOpenFile: _openWorkspaceFile,
                    ),
                  ),
                ],
              );
            },
          );
        },
      ),
    );
  }

  Future<void> _refreshWorkspaceTree({bool silent = false}) async {
    if (!mounted) {
      return;
    }

    setState(() {
      _isLoadingWorkspace = true;
      if (!silent) {
        _workspaceError = null;
      }
    });

    try {
      final tree = await ref
          .read(workflowApiProvider)
          .getExecutionStepWorkspaceTree(widget.executionId, widget.stepId);
      if (!mounted) {
        return;
      }

      final stillExists = _selectedFilePath == null
          ? false
          : _containsWorkspacePath(tree, _selectedFilePath!);

      setState(() {
        _fileTree = tree;
        _isLoadingWorkspace = false;
        _workspaceError = null;
        if (!stillExists) {
          _selectedFilePath = null;
          _selectedFileContent = null;
        }
      });

      if (stillExists && _selectedFilePath != null) {
        await _openWorkspaceFile(_selectedFilePath!, silent: true);
      }
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _isLoadingWorkspace = false;
        if (!silent) {
          _workspaceError = '加载工作区失败：$error';
        }
      });
    }
  }

  Future<void> _openWorkspaceFile(String path, {bool silent = false}) async {
    if (path.trim().isEmpty) {
      return;
    }

    if (mounted) {
      setState(() {
        _selectedFilePath = path;
        _selectedFileContent = null;
        _isLoadingWorkspace = true;
        if (!silent) {
          _workspaceError = null;
        }
      });
    }

    try {
      final file = await ref
          .read(workflowApiProvider)
          .getExecutionStepWorkspaceFile(
            widget.executionId,
            widget.stepId,
            path,
          );
      if (!mounted) {
        return;
      }

      setState(() {
        _selectedFilePath = path;
        _selectedFileContent = file;
        _isLoadingWorkspace = false;
        _workspaceError = null;
      });
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _isLoadingWorkspace = false;
        if (!silent) {
          _workspaceError = '读取文件失败：$error';
        }
      });
    }
  }

  void _openContextSheet(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (context) {
        return Consumer(
          builder: (context, ref, _) {
            final monitor = ref.watch(
              executionMonitorProvider(widget.executionId),
            );
            final state = monitor.value;
            final snapshot = extractMonitorSnapshot(state);
            final runtime = extractMonitorRuntime(state);
            final step = snapshot?.steps
                .where((item) => item.stepId == widget.stepId)
                .cast<StepSnapshot?>()
                .firstWhere((item) => item != null, orElse: () => null);

            if (step == null) {
              return const Center(child: CircularProgressIndicator());
            }

            final runtimeStep = runtime.stepById(step.stepId);
            final conversationState = buildWorkflowAgentConversationState(
              step: step,
              runtime: runtimeStep,
              fileTree: _fileTree,
              fileChanges: runtimeStep?.fileChanges,
              selectedFilePath: _selectedFilePath,
              selectedFileContent: _selectedFileContent,
              isLoadingWorkspace: _isLoadingWorkspace,
              error: _workspaceError,
            );

            return FractionallySizedBox(
              heightFactor: 0.92,
              child: ConversationContextPanel(
                compact: true,
                state: conversationState,
                onRefreshWorkspace: _refreshWorkspaceTree,
                onOpenFile: _openWorkspaceFile,
              ),
            );
          },
        );
      },
    );
  }

  void _scrollToBottom() {
    unawaited(settleScrollToBottom(_scrollController));
  }

  String _buildScrollSignature(ConversationState state) {
    final lastMessage = state.messages.isEmpty ? null : state.messages.last;
    final lastToolCount = lastMessage?.toolCalls.length ?? 0;
    final lastSegmentCount = lastMessage?.segments.length ?? 0;
    final lastContentLength = lastMessage?.content.length ?? 0;
    return [
      state.messages.length,
      lastToolCount,
      lastSegmentCount,
      lastContentLength,
      state.terminalEntries.length,
      state.fileChanges.length,
    ].join(':');
  }

  Widget _buildErrorState(String message) {
    final theme = Theme.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.error_outline, color: theme.colorScheme.error, size: 36),
            const SizedBox(height: 12),
            Text(
              message,
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ViewerStatusHeader extends StatelessWidget {
  const _ViewerStatusHeader({
    required this.step,
    required this.runtime,
    required this.connectionMode,
  });

  final StepSnapshot step;
  final ExecutionRuntimeStep? runtime;
  final ConnectionMode connectionMode;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final summary = summarizeExecutionStep(step, runtime);

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: theme.colorScheme.surfaceContainerLow,
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: theme.colorScheme.outlineVariant),
        ),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                step.nodeName ?? 'Agent 节点',
                style: theme.textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                summary,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                  height: 1.45,
                ),
              ),
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  _ViewerPill(icon: Icons.bolt_outlined, label: step.status),
                  _ViewerPill(
                    icon: Icons.sensors_outlined,
                    label: connectionMode.label,
                  ),
                  if (runtime?.toolCalls.isNotEmpty ?? false)
                    _ViewerPill(
                      icon: Icons.build_outlined,
                      label: '工具 ${runtime!.toolCalls.length}',
                    ),
                  if (runtime?.terminalEntries.isNotEmpty ?? false)
                    _ViewerPill(
                      icon: Icons.terminal_outlined,
                      label: '终端 ${runtime!.terminalEntries.length}',
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ViewerPill extends StatelessWidget {
  const _ViewerPill({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 14, color: theme.colorScheme.onSurfaceVariant),
            const SizedBox(width: 6),
            Text(
              label,
              style: theme.textTheme.labelMedium?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _EmptyViewerState extends StatelessWidget {
  const _EmptyViewerState({required this.isExecuting});

  final bool isExecuting;

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
              Icons.auto_awesome_outlined,
              size: 28,
              color: theme.colorScheme.onSurfaceVariant,
            ),
            const SizedBox(height: 12),
            Text(
              isExecuting ? '等待 Agent 产出首条内容' : '该 Agent 暂无可展示内容',
              style: theme.textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.w800,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text(
              isExecuting
                  ? '当文本、工具、终端或文件事件到达后，这里会按真实顺序展示瀑布流。'
                  : '如果该步骤只有极少量输出，仍可从右侧运行上下文查看终端与工作区。',
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
                height: 1.45,
              ),
              textAlign: TextAlign.center,
            ),
            if (isExecuting) ...[
              const SizedBox(height: 14),
              const CircularProgressIndicator(strokeWidth: 2),
            ],
          ],
        ),
      ),
    );
  }
}

bool _containsWorkspacePath(List<WorkspaceFileNode> nodes, String path) {
  for (final node in nodes) {
    if (node.path == path) {
      return true;
    }
    if (node.children.isNotEmpty &&
        _containsWorkspacePath(node.children, path)) {
      return true;
    }
  }

  return false;
}
