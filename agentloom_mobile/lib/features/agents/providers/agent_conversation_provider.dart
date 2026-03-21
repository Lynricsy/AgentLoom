import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import '../../auth/models/auth_state.dart';
import '../../auth/providers/auth_provider.dart';
import '../../execution/services/execution_socket_service.dart'
    show resolveExecutionSocketUrl;
import '../../../shared/providers/env_provider.dart';
import '../api/agent_api.dart';
import '../models/agent_conversation_dto.dart';
import '../models/conversation_message_dto.dart';

/// 对话参数
typedef ConversationParams = ({String agentId, String conversationId});

/// Agent 对话状态 (sealed class)
sealed class AgentConversationState {
  const AgentConversationState();
}

/// 初始加载中
class ConversationLoading extends AgentConversationState {
  const ConversationLoading();
}

/// 活跃对话
class ConversationActive extends AgentConversationState {
  final String conversationId;
  final String agentId;
  final ConversationState chatState;
  final bool isConnected;

  const ConversationActive({
    required this.conversationId,
    required this.agentId,
    this.chatState = const ConversationState(),
    this.isConnected = false,
  });

  ConversationActive copyWith({
    ConversationState? chatState,
    bool? isConnected,
  }) {
    return ConversationActive(
      conversationId: conversationId,
      agentId: agentId,
      chatState: chatState ?? this.chatState,
      isConnected: isConnected ?? this.isConnected,
    );
  }
}

/// 错误态
class ConversationError extends AgentConversationState {
  final String message;

  const ConversationError({required this.message});
}

// ---------------------------------------------------------------------------
// Socket URL 解析（复用 execution 的 _stripApiSuffix 逻辑）
// ---------------------------------------------------------------------------

String _resolveConversationSocketUrl(String apiBaseUrl) {
  final resolvedApiUrl = Uri.parse(apiBaseUrl);
  // 使用同 resolveExecutionSocketUrl 的路径清理逻辑
  final executionUrl = resolveExecutionSocketUrl(apiBaseUrl);
  final executionUri = Uri.parse(executionUrl);
  final basePath = executionUri.path.replaceAll('/execution', '');
  final namespacePath = '$basePath/agent-conversation'.replaceAll(
    RegExp(r'/+'),
    '/',
  );
  return resolvedApiUrl.replace(path: namespacePath).toString();
}

// ---------------------------------------------------------------------------
// Notifier
// ---------------------------------------------------------------------------

/// Agent 对话 Notifier (AutoDispose Family)
class AgentConversationNotifier extends AsyncNotifier<AgentConversationState> {
  AgentConversationNotifier(this.params);
  final ConversationParams params;

  io.Socket? _socket;
  final List<StreamSubscription<dynamic>> _subscriptions = [];

  @override
  Future<AgentConversationState> build() async {
    ref.onDispose(_cleanup);
    return _startConversation();
  }

  Future<AgentConversationState> _startConversation() async {
    try {
      // 加载已有消息
      final api = ref.read(agentApiProvider);
      final messagesResponse = await api.getMessages(params.conversationId);
      final messages = messagesResponse.data;

      // 建立 Socket.IO 连接
      _connectSocket();

      return ConversationActive(
        conversationId: params.conversationId,
        agentId: params.agentId,
        chatState: ConversationState(messages: messages),
        isConnected: false, // 连接成功后更新
      );
    } catch (e) {
      return ConversationError(message: 'Failed to load conversation: $e');
    }
  }

  // -----------------------------------------------------------------------
  // Socket.IO
  // -----------------------------------------------------------------------

  void _connectSocket() {
    final env = ref.read(envProvider);
    final authState = ref.read(authProvider).value;

    String? token;
    if (authState is AuthStateAuthenticated) {
      token = authState.tokens.accessToken;
    }
    if (token == null) return;

    final url = _resolveConversationSocketUrl(env.apiBaseUrl);

    _socket = io.io(
      url,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .setAuth({'token': token})
          .disableAutoConnect()
          .enableForceNew()
          .build(),
    );

    _setupSocketListeners();
    _socket!.connect();
  }

  void _setupSocketListeners() {
    final socket = _socket!;

    socket.onConnect((_) {
      _updateConnected(true);
      // 订阅对话事件
      socket.emit('conversation:subscribe', {
        'conversationId': params.conversationId,
      });
    });

    socket.onDisconnect((_) {
      _updateConnected(false);
    });

    // Agent 消息流
    socket.on('conversation.agent.message_chunk', (data) {
      if (data is Map<String, dynamic>) {
        _handleMessageChunk(data);
      }
    });

    socket.on('conversation.agent.thinking', (data) {
      if (data is Map<String, dynamic>) {
        _handleThinking(data);
      }
    });

    socket.on('conversation.agent.tool_call', (data) {
      if (data is Map<String, dynamic>) {
        _handleToolCall(data);
      }
    });

    socket.on('conversation.agent.tool_result', (data) {
      if (data is Map<String, dynamic>) {
        _handleToolResult(data);
      }
    });

    socket.on('conversation.sandbox.terminal_output', (data) {
      if (data is Map<String, dynamic>) {
        _handleTerminalOutput(data);
      }
    });

    socket.on('conversation.agent.done', (data) {
      _handleAgentDone();
    });

    socket.on('conversation.status.changed', (data) {
      if (data is Map<String, dynamic>) {
        _handleStatusChanged(data);
      }
    });
  }

  // -----------------------------------------------------------------------
  // Event handlers
  // -----------------------------------------------------------------------

  void _handleMessageChunk(Map<String, dynamic> data) {
    final chunk = data['content'] as String? ?? '';
    _updateChatState(
      (chat) => chat.copyWith(
        isAgentTyping: true,
        streamingContent: (chat.streamingContent ?? '') + chunk,
      ),
    );
  }

  void _handleThinking(Map<String, dynamic> data) {
    final content = data['content'] as String? ?? '';
    _updateChatState(
      (chat) => chat.copyWith(
        isAgentTyping: true,
        thinkingContent: (chat.thinkingContent ?? '') + content,
      ),
    );
  }

  void _handleToolCall(Map<String, dynamic> data) {
    try {
      final toolCall = ToolCallEventData.fromJson(data);
      _updateChatState(
        (chat) =>
            chat.copyWith(activeToolCall: toolCall, isSandboxActive: true),
      );
    } catch (_) {}
  }

  void _handleToolResult(Map<String, dynamic> data) {
    _updateChatState((chat) => chat.copyWith(activeToolCall: null));
  }

  void _handleTerminalOutput(Map<String, dynamic> data) {
    final output = data['output'] as String? ?? '';
    _updateChatState(
      (chat) => chat.copyWith(
        terminalOutput: [...chat.terminalOutput, output],
        latestTerminalLine: output.trim().split('\n').last,
        isSandboxActive: true,
      ),
    );
  }

  void _handleAgentDone() {
    _finalizeAgentMessage();
    _updateChatState(
      (chat) => chat.copyWith(
        isAgentTyping: false,
        streamingContent: null,
        thinkingContent: null,
        activeToolCall: null,
        isSandboxActive: false,
      ),
    );
  }

  void _handleStatusChanged(Map<String, dynamic> data) {
    final status = data['status'] as String?;
    if (status == 'completed' || status == 'failed') {
      _handleAgentDone();
    }
  }

  /// 将流式内容物化为消息
  void _finalizeAgentMessage() {
    final currentState = state.value;
    if (currentState is! ConversationActive) return;
    final chat = currentState.chatState;

    if (chat.streamingContent != null && chat.streamingContent!.isNotEmpty) {
      final msg = ConversationMessageDto.fromJson({
        'id': 'stream-${DateTime.now().millisecondsSinceEpoch}',
        'conversation_id': params.conversationId,
        'role': 'agent',
        'type': 'text',
        'content': chat.streamingContent!,
        'created_at': DateTime.now().toIso8601String(),
      });
      _updateChatState(
        (c) =>
            c.copyWith(messages: [...c.messages, msg], streamingContent: null),
      );
    }

    if (chat.thinkingContent != null && chat.thinkingContent!.isNotEmpty) {
      final thinkMsg = ConversationMessageDto.fromJson({
        'id': 'think-${DateTime.now().millisecondsSinceEpoch}',
        'conversation_id': params.conversationId,
        'role': 'agent',
        'type': 'thinking',
        'content': chat.thinkingContent!,
        'created_at': DateTime.now().toIso8601String(),
      });
      _updateChatState(
        (c) => c.copyWith(
          messages: [...c.messages, thinkMsg],
          thinkingContent: null,
        ),
      );
    }
  }

  // -----------------------------------------------------------------------
  // 发送消息
  // -----------------------------------------------------------------------

  Future<void> sendMessage(String content, {List<String>? attachments}) async {
    final currentState = state.value;
    if (currentState is! ConversationActive) return;

    // 乐观添加用户消息
    final optimisticMsg = ConversationMessageDto.fromJson({
      'id': 'local-${DateTime.now().millisecondsSinceEpoch}',
      'conversation_id': params.conversationId,
      'role': 'user',
      'type': 'text',
      'content': content,
      'created_at': DateTime.now().toIso8601String(),
    });

    _updateChatState(
      (chat) => chat.copyWith(
        messages: [...chat.messages, optimisticMsg],
        isLoading: true,
        error: null,
      ),
    );

    try {
      final api = ref.read(agentApiProvider);
      await api.sendMessage(
        params.conversationId,
        content: content,
        attachments: attachments,
      );

      if (!ref.mounted) return;

      _updateChatState(
        (chat) => chat.copyWith(isLoading: false, isAgentTyping: true),
      );
    } catch (e) {
      if (!ref.mounted) return;

      _updateChatState(
        (chat) => chat.copyWith(
          isLoading: false,
          error: 'Failed to send message: $e',
        ),
      );
    }
  }

  /// 清除终端输出
  void clearTerminalOutput() {
    _updateChatState(
      (chat) => chat.copyWith(terminalOutput: [], latestTerminalLine: null),
    );
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  void _updateConnected(bool connected) {
    final currentState = state.value;
    if (currentState is ConversationActive) {
      state = AsyncValue.data(currentState.copyWith(isConnected: connected));
    }
  }

  void _updateChatState(ConversationState Function(ConversationState) updater) {
    final currentState = state.value;
    if (currentState is ConversationActive) {
      state = AsyncValue.data(
        currentState.copyWith(chatState: updater(currentState.chatState)),
      );
    }
  }

  void _cleanup() {
    if (_socket != null) {
      _socket!.emit('conversation:unsubscribe', {
        'conversationId': params.conversationId,
      });
      _socket!.dispose();
      _socket = null;
    }
    for (final sub in _subscriptions) {
      sub.cancel();
    }
    _subscriptions.clear();
  }
}

/// Agent 对话 Provider（AutoDispose + Family）
final agentConversationProvider = AsyncNotifierProvider.autoDispose
    .family<
      AgentConversationNotifier,
      AgentConversationState,
      ConversationParams
    >(AgentConversationNotifier.new);

/// Agent 对话列表 Provider
final agentConversationsProvider =
    FutureProvider.family<List<AgentConversationDto>, String>((
      ref,
      agentId,
    ) async {
      final api = ref.read(agentApiProvider);
      return api.listConversations(agentId);
    });
