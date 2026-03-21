import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/conversation_message_dto.dart';
import '../providers/agent_conversation_provider.dart';
import '../widgets/computer_banner.dart';
import '../widgets/computer_expand_view.dart';
import '../widgets/message_bubble.dart';

/// Agent 对话页面（Manus 风格）
class AgentConversationScreen extends ConsumerStatefulWidget {
  final String agentId;
  final String conversationId;

  const AgentConversationScreen({
    super.key,
    required this.agentId,
    required this.conversationId,
  });

  @override
  ConsumerState<AgentConversationScreen> createState() =>
      _AgentConversationScreenState();
}

class _AgentConversationScreenState
    extends ConsumerState<AgentConversationScreen> {
  final _textController = TextEditingController();
  final _scrollController = ScrollController();

  ConversationParams get _params =>
      (agentId: widget.agentId, conversationId: widget.conversationId);

  @override
  void dispose() {
    _textController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeOut,
        );
      }
    });
  }

  void _sendMessage() {
    final text = _textController.text.trim();
    if (text.isEmpty) return;

    ref.read(agentConversationProvider(_params).notifier).sendMessage(text);
    _textController.clear();
    _scrollToBottom();
  }

  void _openComputerView(ConversationState chatState) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (context) => ComputerExpandView(
        terminalOutput: chatState.terminalOutput,
        isLive: chatState.isSandboxActive,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final conversationAsync = ref.watch(agentConversationProvider(_params));

    return Scaffold(
      appBar: AppBar(
        title: const Text('Conversation'),
        actions: [
          // 连接状态指示
          conversationAsync.whenOrNull(
                data: (state) {
                  if (state is ConversationActive) {
                    return Padding(
                      padding: const EdgeInsets.only(right: 12),
                      child: Icon(
                        state.isConnected ? Icons.wifi : Icons.wifi_off,
                        size: 18,
                        color: state.isConnected
                            ? Colors.green
                            : theme.colorScheme.error,
                      ),
                    );
                  }
                  return null;
                },
              ) ??
              const SizedBox.shrink(),
        ],
      ),
      body: conversationAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                Icons.error_outline,
                size: 48,
                color: theme.colorScheme.error,
              ),
              const SizedBox(height: 16),
              Text(
                'Failed to load conversation',
                style: theme.textTheme.titleMedium,
              ),
              const SizedBox(height: 8),
              TextButton(
                onPressed: () =>
                    ref.invalidate(agentConversationProvider(_params)),
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
        data: (state) {
          if (state is ConversationError) {
            return Center(
              child: Text(
                state.message,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: theme.colorScheme.error,
                ),
              ),
            );
          }

          if (state is! ConversationActive) {
            return const Center(child: CircularProgressIndicator());
          }

          final chatState = state.chatState;

          return Column(
            children: [
              // 消息列表
              Expanded(
                child:
                    chatState.messages.isEmpty &&
                        chatState.streamingContent == null
                    ? Center(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(
                              Icons.chat_bubble_outline,
                              size: 64,
                              color: theme.colorScheme.onSurfaceVariant
                                  .withValues(alpha: 0.5),
                            ),
                            const SizedBox(height: 16),
                            Text(
                              'Send a message to start',
                              style: theme.textTheme.titleMedium?.copyWith(
                                color: theme.colorScheme.onSurfaceVariant,
                              ),
                            ),
                          ],
                        ),
                      )
                    : ListView.builder(
                        controller: _scrollController,
                        padding: const EdgeInsets.only(top: 8, bottom: 8),
                        itemCount:
                            chatState.messages.length +
                            (chatState.streamingContent != null ? 1 : 0) +
                            (chatState.thinkingContent != null ? 1 : 0),
                        itemBuilder: (context, index) {
                          // 已有消息
                          if (index < chatState.messages.length) {
                            return MessageBubble(
                              message: chatState.messages[index],
                            );
                          }

                          // 思考中的流式内容
                          final streamIndex = index - chatState.messages.length;
                          if (streamIndex == 0 &&
                              chatState.thinkingContent != null) {
                            return StreamingMessageBubble(
                              content: chatState.thinkingContent!,
                              isThinking: true,
                            );
                          }

                          // 流式消息内容
                          if (chatState.streamingContent != null) {
                            return StreamingMessageBubble(
                              content: chatState.streamingContent!,
                            );
                          }

                          return const SizedBox.shrink();
                        },
                      ),
              ),

              // Agent 正在输入指示
              if (chatState.isAgentTyping &&
                  chatState.streamingContent == null &&
                  chatState.thinkingContent == null)
                Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 4,
                  ),
                  child: Row(
                    children: [
                      SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: theme.colorScheme.primary,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        'Agent is thinking...',
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ),
                ),

              // 计算机状态横幅
              ComputerBanner(
                latestTerminalLine: chatState.latestTerminalLine,
                activeToolCall: chatState.activeToolCall,
                isSandboxActive: chatState.isSandboxActive,
                onTap: () => _openComputerView(chatState),
              ),

              // 输入栏
              _InputBar(
                controller: _textController,
                onSend: _sendMessage,
                isLoading: chatState.isLoading,
              ),
            ],
          );
        },
      ),
    );
  }
}

/// 底部输入栏
class _InputBar extends StatelessWidget {
  final TextEditingController controller;
  final VoidCallback onSend;
  final bool isLoading;

  const _InputBar({
    required this.controller,
    required this.onSend,
    this.isLoading = false,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      padding: EdgeInsets.only(
        left: 12,
        right: 8,
        top: 8,
        bottom: 8 + MediaQuery.of(context).padding.bottom,
      ),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        border: Border(
          top: BorderSide(color: theme.colorScheme.outlineVariant, width: 0.5),
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Expanded(
            child: TextField(
              controller: controller,
              maxLines: 4,
              minLines: 1,
              textInputAction: TextInputAction.send,
              onSubmitted: (_) => onSend(),
              decoration: InputDecoration(
                hintText: 'Type a message...',
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(24),
                  borderSide: BorderSide.none,
                ),
                filled: true,
                fillColor: theme.colorScheme.surfaceContainerHighest,
                contentPadding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 10,
                ),
                isDense: true,
              ),
            ),
          ),
          const SizedBox(width: 8),
          isLoading
              ? const Padding(
                  padding: EdgeInsets.all(8),
                  child: SizedBox(
                    width: 24,
                    height: 24,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                )
              : IconButton(
                  onPressed: onSend,
                  icon: Icon(Icons.send, color: theme.colorScheme.primary),
                ),
        ],
      ),
    );
  }
}
