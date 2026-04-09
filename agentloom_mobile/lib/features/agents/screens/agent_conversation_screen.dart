import 'dart:async';
import 'dart:math' as math;

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../models/conversation_message_dto.dart';
import '../providers/agent_conversation_provider.dart';
import '../conversation_attachment_payload.dart';
import '../widgets/conversation_context_panel.dart';
import '../widgets/conversation_input_bar.dart';
import '../widgets/message_bubble.dart';
import '../widgets/preparation_card.dart';
import '../../../shared/utils/scrolling.dart';
import '../../../routes/route_names.dart';

class AgentConversationScreen extends ConsumerStatefulWidget {
  const AgentConversationScreen({
    super.key,
    required this.agentId,
    required this.conversationId,
  });

  final String agentId;
  final String conversationId;

  @override
  ConsumerState<AgentConversationScreen> createState() =>
      _AgentConversationScreenState();
}

class _AgentConversationScreenState
    extends ConsumerState<AgentConversationScreen> {
  final _textController = TextEditingController();
  final _scrollController = ScrollController();
  final List<ConversationDraftAttachment> _pendingAttachments =
      <ConversationDraftAttachment>[];
  Timer? _workspaceRefreshDebounce;
  String? _lastScrollSignature;
  int _lastFileChangeCount = 0;

  ConversationParams get _params =>
      (agentId: widget.agentId, conversationId: widget.conversationId);

  @override
  void didUpdateWidget(covariant AgentConversationScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.agentId != widget.agentId ||
        oldWidget.conversationId != widget.conversationId) {
      _lastScrollSignature = null;
      _lastFileChangeCount = 0;
      _workspaceRefreshDebounce?.cancel();
    }
  }

  @override
  void dispose() {
    _workspaceRefreshDebounce?.cancel();
    _textController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    ref.listen<AsyncValue<ConversationState>>(
      agentConversationProvider(_params),
      (_, next) {
        final state = next.value;
        if (state == null) {
          return;
        }
        final nextSignature = _scrollSignature(state);
        if (nextSignature == _lastScrollSignature) {
          return;
        }
        _lastScrollSignature = nextSignature;
        _scrollToBottom();

        final nextFileChangeCount = state.fileChanges.length;
        if (nextFileChangeCount > _lastFileChangeCount) {
          _scheduleWorkspaceRefresh();
        }
        _lastFileChangeCount = nextFileChangeCount;
      },
    );

    final conversationAsync = ref.watch(agentConversationProvider(_params));
    final theme = Theme.of(context);
    final runtimeModeLabel = conversationAsync.value?.isNoSandboxRuntime == true
        ? '无沙箱'
        : '有沙箱';

    return Scaffold(
      appBar: AppBar(
        title: Text('Agent 对话 · $runtimeModeLabel'),
        actions: [
          if (conversationAsync.value case final state?)
            ..._buildActions(context, ref, state),
        ],
      ),
      body: conversationAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => _LoadErrorState(
          message: '加载对话失败：$error',
          onRetry: () => ref.invalidate(agentConversationProvider(_params)),
        ),
        data: (state) {
          return LayoutBuilder(
            builder: (context, constraints) {
              final showSidePanel = constraints.maxWidth >= 1040;
              final content = _ConversationPane(
                state: state,
                scrollController: _scrollController,
                textController: _textController,
                onSend: _sendMessage,
                pendingAttachments: _pendingAttachments,
                onRemoveAttachment: _removeAttachment,
                onPickFile: () => _pickAttachments(image: false),
                onPickImage: () => _pickAttachments(image: true),
                onCancel: () {
                  unawaited(
                    ref
                        .read(agentConversationProvider(_params).notifier)
                        .cancelConversation(),
                  );
                },
                onResolvePermission: (toolCallId, action, {rememberScope}) {
                  return ref
                      .read(agentConversationProvider(_params).notifier)
                      .resolveToolPermission(
                        toolCallId,
                        action,
                        rememberScope: rememberScope,
                      );
                },
                onRestartConversation: () async {
                  final nextConversationId = await ref
                      .read(agentConversationProvider(_params).notifier)
                      .restartConversationToLatestVersion();
                  if (!context.mounted || nextConversationId == null) {
                    return;
                  }

                  if (nextConversationId == widget.conversationId) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text('当前对话已刷新到最新配置'),
                      ),
                    );
                    return;
                  }

                  context.pushReplacementNamed(
                    RouteNames.agentConversation,
                    pathParameters: {
                      'agentId': widget.agentId,
                      'conversationId': nextConversationId,
                    },
                  );
                },
                onOpenContext: showSidePanel
                    ? null
                    : () => _openContextSheet(context),
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
                      state: state,
                      onRefreshWorkspace: () => ref
                          .read(agentConversationProvider(_params).notifier)
                          .refreshWorkspaceTree(),
                      onOpenFile: (path) => ref
                          .read(agentConversationProvider(_params).notifier)
                          .openWorkspaceFile(path),
                    ),
                  ),
                ],
              );
            },
          );
        },
      ),
      backgroundColor: theme.colorScheme.surface,
    );
  }

  List<Widget> _buildActions(
    BuildContext context,
    WidgetRef ref,
    ConversationState state,
  ) {
    final theme = Theme.of(context);
    return [
      Padding(
        padding: const EdgeInsets.only(right: 4),
        child: Icon(
          state.isConnected ? Icons.wifi : Icons.wifi_off,
          size: 18,
          color: state.isConnected
              ? const Color(0xFF0F9D58)
              : theme.colorScheme.error,
        ),
      ),
      IconButton(
        tooltip: '工作区',
        onPressed: () => _openContextSheet(context),
        icon: const Icon(Icons.dock_outlined),
      ),
      if (state.hasSandboxRuntime)
        IconButton(
          tooltip: '刷新工作区',
          onPressed: state.isLoadingWorkspace
              ? null
              : () {
                  unawaited(
                    ref
                        .read(agentConversationProvider(_params).notifier)
                        .refreshWorkspaceTree(),
                  );
                },
          icon: state.isLoadingWorkspace
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Icon(Icons.refresh),
        ),
      if (state.isBusy)
        IconButton(
          tooltip: '停止',
          onPressed: () {
            unawaited(
              ref
                  .read(agentConversationProvider(_params).notifier)
                  .cancelConversation(),
            );
          },
          icon: const Icon(Icons.stop_circle_outlined),
        ),
    ];
  }

  void _sendMessage() {
    final text = _textController.text.trim();
    if (text.isEmpty && _pendingAttachments.isEmpty) {
      return;
    }

    if (_pendingAttachments.isEmpty) {
      unawaited(
        ref.read(agentConversationProvider(_params).notifier).sendMessage(text),
      );
      _textController.clear();
      _scrollToBottom();
      return;
    }

    final payload = buildConversationOutgoingMessage(
      attachments: _pendingAttachments,
      content: text,
    );

    unawaited(_sendComposedPayload(payload));
  }

  Future<void> _sendComposedPayload(
    ConversationAttachmentPayload payload,
  ) async {
    await ref
        .read(agentConversationProvider(_params).notifier)
        .sendMessage(
          payload.content,
          contentType: payload.contentType,
          metadata: payload.metadata,
        );

    if (!mounted) {
      return;
    }

    setState(() {
      _pendingAttachments.clear();
      _textController.clear();
    });
    _scrollToBottom();
  }

  Future<void> _pickAttachments({required bool image}) async {
    final result = await FilePicker.platform.pickFiles(
      type: image ? FileType.image : FileType.any,
      allowMultiple: true,
      withData: true,
    );

    if (result == null || result.files.isEmpty) {
      return;
    }

    try {
      final nextAttachments = <ConversationDraftAttachment>[
        ..._pendingAttachments,
      ];
      for (final file in result.files) {
        final bytes = file.bytes;
        if (bytes == null || bytes.isEmpty) {
          throw Exception('无法读取所选文件，请重试。');
        }

        nextAttachments.add(
          buildConversationDraftAttachment(
            file: file,
            bytes: bytes,
            image: image,
          ),
        );
      }

      validateConversationAttachmentTotalBytes(nextAttachments);

      if (!mounted) {
        return;
      }

      setState(() {
        _pendingAttachments
          ..clear()
          ..addAll(nextAttachments);
      });
    } catch (error) {
      if (!mounted) {
        return;
      }
      final message = error is Exception
          ? error.toString().replaceFirst('Exception: ', '')
          : '上传失败，请稍后重试。';
      _showSnackBar(message);
    }
  }

  void _removeAttachment(int index) {
    if (index < 0 || index >= _pendingAttachments.length) {
      return;
    }

    setState(() {
      _pendingAttachments.removeAt(index);
    });
  }

  void _openContextSheet(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (context) {
        return FractionallySizedBox(
          heightFactor: 0.92,
          child: Consumer(
            builder: (context, ref, _) {
              final state = ref.watch(agentConversationProvider(_params)).value;
              if (state == null) {
                return const Center(child: CircularProgressIndicator());
              }
              return ConversationContextPanel(
                compact: true,
                state: state,
                onRefreshWorkspace: () => ref
                    .read(agentConversationProvider(_params).notifier)
                    .refreshWorkspaceTree(),
                onOpenFile: (path) => ref
                    .read(agentConversationProvider(_params).notifier)
                    .openWorkspaceFile(path),
              );
            },
          ),
        );
      },
    );
  }

  void _scrollToBottom() {
    unawaited(settleScrollToBottom(_scrollController));
  }

  void _scheduleWorkspaceRefresh() {
    _workspaceRefreshDebounce?.cancel();
    _workspaceRefreshDebounce = Timer(const Duration(milliseconds: 250), () {
      if (!mounted) {
        return;
      }

      final state = ref.read(agentConversationProvider(_params)).value;
      if (state == null ||
          !state.hasSandboxRuntime ||
          state.isLoadingWorkspace) {
        return;
      }

      unawaited(
        ref
            .read(agentConversationProvider(_params).notifier)
            .refreshWorkspaceTree(),
      );
    });
  }

  void _showSnackBar(String message) {
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message)));
  }

  String _scrollSignature(ConversationState state) {
    final lastMessage = state.messages.isNotEmpty ? state.messages.last : null;
    return [
      state.messages.length,
      lastMessage?.id ?? 'none',
      lastMessage?.content.length ?? 0,
      lastMessage?.toolCalls.length ?? 0,
      state.terminalEntries.length,
      state.fileChanges.length,
      state.status.name,
      state.preparationPhase?.name ?? 'none',
    ].join(':');
  }
}

/// 是否应该展示准备卡片
///
/// 无沙箱 Agent 不显示准备卡片，直接使用通用加载指示器。
/// 展示条件（仅沙箱模式）：
/// - 有活跃的准备阶段（正在准备中）
/// - 准备阶段刚清除但有 preparationStartTime（刚完成，展示收缩摘要）
/// - 有失败的准备阶段
/// 不展示条件：
/// - 历史加载时（没有活跃准备信息）
bool _showPreparationCard(ConversationState state) {
  if (state.isNoSandboxRuntime) return false;
  if (state.preparationPhase != null) {
    return true;
  }
  if (state.preparationFailedPhase != null) {
    return true;
  }
  // 刚完成收缩：phase 已清除但 startTime 仍在，且正在执行中
  if (state.preparationStartTime != null &&
      state.status == ConversationStatus.executing) {
    return true;
  }
  return false;
}

/// 消息列表 + 底部准备卡片
class _MessageListView extends StatelessWidget {
  const _MessageListView({
    required this.state,
    required this.scrollController,
    required this.onResolvePermission,
    required this.onRestartConversation,
  });

  final ConversationState state;
  final ScrollController scrollController;
  final Future<void> Function(
    String toolCallId,
    String action, {
    String? rememberScope,
  })
  onResolvePermission;
  final Future<void> Function() onRestartConversation;

  @override
  Widget build(BuildContext context) {
    final showCard = _showPreparationCard(state);
    // 通用加载指示器：无准备卡片、正在执行、且没有流式消息时显示
    final showTypingIndicator = state.isBusy &&
        !showCard &&
        !state.messages.any((m) => m.role == MessageRole.assistant && m.isStreaming);
    final extraItems = (showCard ? 1 : 0) + (showTypingIndicator ? 1 : 0);
    final itemCount = state.messages.length + extraItems;

    return ListView.builder(
      controller: scrollController,
      padding: const EdgeInsets.fromLTRB(0, 12, 0, 12),
      itemCount: itemCount,
      itemBuilder: (context, index) {
        if (index < state.messages.length) {
          return MessageBubble(
            message: state.messages[index],
            loadedPublishedVersionId: state.loadedPublishedVersionId,
            onResolvePermission: onResolvePermission,
            onRestartConversation: onRestartConversation,
          );
        }

        final extraIndex = index - state.messages.length;

        // 准备卡片（仅沙箱模式）
        if (showCard && extraIndex == 0) {
          final isCollapsed =
              state.preparationPhase == null &&
              state.preparationFailedPhase == null;
          return PreparationCard(
            phase: state.preparationPhase,
            showSandboxPhase: state.hasSandboxRuntime,
            sandboxReused: state.sandboxReused,
            failedPhase: state.preparationFailedPhase,
            error: state.preparationError,
            preparationStartTime: state.preparationStartTime,
            collapsed: isCollapsed,
          );
        }

        // 通用加载指示器（无沙箱模式下从发送消息持续到流式输出开始）
        return const _TypingIndicator();
      },
    );
  }
}

class _ConversationPane extends StatelessWidget {
  const _ConversationPane({
    required this.state,
    required this.scrollController,
    required this.textController,
    required this.onSend,
    required this.pendingAttachments,
    required this.onRemoveAttachment,
    required this.onPickFile,
    required this.onPickImage,
    required this.onCancel,
    required this.onResolvePermission,
    required this.onRestartConversation,
    required this.onOpenContext,
  });

  final ConversationState state;
  final ScrollController scrollController;
  final TextEditingController textController;
  final VoidCallback onSend;
  final List<ConversationDraftAttachment> pendingAttachments;
  final ValueChanged<int> onRemoveAttachment;
  final VoidCallback onPickFile;
  final VoidCallback onPickImage;
  final VoidCallback onCancel;
  final Future<void> Function(
    String toolCallId,
    String action, {
    String? rememberScope,
  })
  onResolvePermission;
  final Future<void> Function() onRestartConversation;
  final VoidCallback? onOpenContext;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      children: [
        if (state.error != null)
          _InlineBanner(
            icon: Icons.error_outline,
            text: state.error!,
            color: theme.colorScheme.errorContainer,
            foregroundColor: theme.colorScheme.onErrorContainer,
          )
        else if (!state.isConnected)
          _InlineBanner(
            icon: Icons.wifi_off,
            text: state.status == ConversationStatus.connecting
                ? '正在建立实时连接…'
                : '实时连接已断开，历史消息仍可查看',
            color: theme.colorScheme.secondaryContainer,
            foregroundColor: theme.colorScheme.onSecondaryContainer,
          ),
        Expanded(
          child: state.messages.isEmpty && !_showPreparationCard(state)
              ? const _EmptyConversationState()
              : _MessageListView(
                  state: state,
                  scrollController: scrollController,
                  onResolvePermission: onResolvePermission,
                  onRestartConversation: onRestartConversation,
                ),
        ),
        if (onOpenContext != null && _shouldShowDock(state))
          _ContextDock(state: state, onTap: onOpenContext!),
        ConversationInputBar(
          controller: textController,
          onSend: onSend,
          attachments: pendingAttachments,
          onRemoveAttachment: onRemoveAttachment,
          onPickFile: onPickFile,
          onPickImage: onPickImage,
          onCancel: onCancel,
          isBusy: state.isBusy,
        ),
      ],
    );
  }
}

class _InlineBanner extends StatelessWidget {
  const _InlineBanner({
    required this.icon,
    required this.text,
    required this.color,
    required this.foregroundColor,
  });

  final IconData icon;
  final String text;
  final Color color;
  final Color foregroundColor;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      color: color,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      child: Row(
        children: [
          Icon(icon, size: 18, color: foregroundColor),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              text,
              style: Theme.of(
                context,
              ).textTheme.bodySmall?.copyWith(color: foregroundColor),
            ),
          ),
        ],
      ),
    );
  }
}

class _ContextDock extends StatelessWidget {
  const _ContextDock({required this.state, required this.onTap});

  final ConversationState state;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Material(
      color: theme.colorScheme.surfaceContainerLow,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Row(
            children: [
              Icon(
                state.latestToolCall != null
                    ? Icons.build_circle_outlined
                    : Icons.dock_outlined,
                size: 18,
                color: theme.colorScheme.primary,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      state.latestToolCall != null
                          ? '最近工具：${state.latestToolCall!.tool}'
                          : '查看运行上下文',
                      style: theme.textTheme.bodySmall?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    Text(
                      state.latestTerminalLine ??
                          '终端 ${state.terminalEntries.length} 条 · 文件 ${state.fileTree.length} 项 · 变更 ${state.fileChanges.length} 条',
                      style: theme.textTheme.labelMedium?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
              Icon(
                Icons.chevron_right,
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _LoadErrorState extends StatelessWidget {
  const _LoadErrorState({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.error_outline, size: 48, color: theme.colorScheme.error),
            const SizedBox(height: 16),
            Text(
              message,
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyMedium,
            ),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh),
              label: const Text('重试'),
            ),
          ],
        ),
      ),
    );
  }
}

/// 通用加载指示器：三个跳动圆点，对齐 Studio 端的 TypingIndicator 风格
class _TypingIndicator extends StatefulWidget {
  const _TypingIndicator();

  @override
  State<_TypingIndicator> createState() => _TypingIndicatorState();
}

class _TypingIndicatorState extends State<_TypingIndicator>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          CircleAvatar(
            radius: 16,
            backgroundColor: theme.colorScheme.primaryContainer,
            child: Icon(
              Icons.smart_toy_outlined,
              size: 16,
              color: theme.colorScheme.onPrimaryContainer,
            ),
          ),
          const SizedBox(width: 12),
          Padding(
            padding: const EdgeInsets.only(top: 10),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: List.generate(3, (i) {
                return AnimatedBuilder(
                  animation: _controller,
                  builder: (context, child) {
                    // 每个圆点错开 0.15 的相位
                    final t = (_controller.value - i * 0.15) % 1.0;
                    // 在 0~0.4 区间做弹跳，其余时间静止
                    final bounce = t < 0.4
                        ? math.sin(t / 0.4 * math.pi) * 4.0
                        : 0.0;
                    return Container(
                      margin: const EdgeInsets.symmetric(horizontal: 2),
                      child: Transform.translate(
                        offset: Offset(0, -bounce),
                        child: child,
                      ),
                    );
                  },
                  child: Container(
                    width: 6,
                    height: 6,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: theme.colorScheme.onSurfaceVariant
                          .withValues(alpha: 0.5),
                    ),
                  ),
                );
              }),
            ),
          ),
        ],
      ),
    );
  }
}

class _EmptyConversationState extends StatelessWidget {
  const _EmptyConversationState();

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
              Icons.forum_outlined,
              size: 54,
              color: theme.colorScheme.onSurfaceVariant,
            ),
            const SizedBox(height: 16),
            Text(
              '开始一轮新的对话',
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              '消息、工具调用瀑布流、终端输出和工作区文件会在这里连续展示。',
              textAlign: TextAlign.center,
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

bool _shouldShowDock(ConversationState state) {
  return state.latestToolCall != null ||
      state.latestTerminalLine != null ||
      state.fileTree.isNotEmpty ||
      state.fileChanges.isNotEmpty;
}
