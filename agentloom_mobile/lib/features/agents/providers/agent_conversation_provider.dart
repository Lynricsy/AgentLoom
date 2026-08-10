import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import '../../../shared/providers/env_provider.dart';
import '../../auth/models/auth_state.dart';
import '../../auth/providers/auth_provider.dart';
import '../../execution/services/execution_socket_service.dart'
    show buildSocketConnectionOptions, resolveExecutionSocketUrl;
import '../../resources/api/resources_api.dart';
import '../api/agent_api.dart';
import '../models/agent_conversation_dto.dart';
import '../models/agent_definition_dto.dart';
import '../models/conversation_message_dto.dart';
import '../../../shared/conversation/conversation_normalizers.dart';
import 'agent_conversation_message_utils.dart';
import 'agent_conversation_payloads.dart';
import 'agent_provider.dart';

typedef ConversationParams = ({String agentId, String conversationId});
typedef AgentConversationSocketFactory =
    io.Socket Function(String url, Map<String, dynamic> options);


String _resolveConversationSocketUrl(String apiBaseUrl) {
  final resolvedApiUrl = Uri.parse(apiBaseUrl);
  final executionUrl = resolveExecutionSocketUrl(apiBaseUrl);
  final executionUri = Uri.parse(executionUrl);
  final basePath = executionUri.path.replaceAll('/execution', '');
  final namespacePath = '$basePath/agent-conversation'.replaceAll(
    RegExp(r'/+'),
    '/',
  );
  return resolvedApiUrl.replace(path: namespacePath).toString();
}

final agentConversationSocketFactoryProvider =
    Provider<AgentConversationSocketFactory>((ref) {
      return (url, options) => io.io(url, options);
    });




String _describeConversationSubscribeError(String? error) {
  switch (error) {
    case 'FORBIDDEN':
      return '当前账号无权访问该对话';
    case 'INVALID_PAYLOAD':
      return '对话订阅参数无效';
    case null:
      return '订阅未成功';
    default:
      return error;
  }
}

String? _resolveWorkspacePreviewId(AgentDefinitionDto agent) {
  final sandboxConfig = asNullableMap(agent.sandboxConfig);
  final restoreWorkspaceId =
      readString(sandboxConfig?['restoreWorkspaceId']) ??
      readString(sandboxConfig?['restore_workspace_id']);
  return restoreWorkspaceId ?? readString(agent.workspaceSnapshotId);
}

String _describeConversationApiError(Object error) {
  if (error is DioException) {
    if (error.type == DioExceptionType.connectionTimeout ||
        error.type == DioExceptionType.receiveTimeout) {
      return '请求超时，请稍后重试';
    }
    if (error.type == DioExceptionType.connectionError) {
      return '无法连接到服务器，请检查网络或服务器地址';
    }

    final data = error.response?.data;
    if (data is Map<String, dynamic>) {
      final message =
          readString(data['message']) ?? readString(data['detail']);
      if (message != null) {
        return message;
      }
    }
    if (data is Map<Object?, Object?>) {
      final map = data.map((key, value) => MapEntry('$key', value));
      final message = readString(map['message']) ?? readString(map['detail']);
      if (message != null) {
        return message;
      }
    }
  }

  return error.toString();
}

bool _isTreeOnlyWorkspacePreviewMessage(String message) {
  return message.contains('仅保留工作区目录结构') || message.contains('未保留文件内容预览');
}


String _nextLocalId(String prefix) {
  return '$prefix-${DateTime.now().microsecondsSinceEpoch}';
}

bool _workspaceTreeContainsPath(List<WorkspaceFileNode> nodes, String path) {
  for (final node in nodes) {
    if (node.path == path) {
      return true;
    }
    if (node.children.isNotEmpty &&
        _workspaceTreeContainsPath(node.children, path)) {
      return true;
    }
  }

  return false;
}

bool _shouldTreatWorkspaceTreeAsLive(
  ConversationState current,
  List<WorkspaceFileNode> tree, {
  required bool hasHistoricalMessages,
}) {
  if (tree.isNotEmpty) {
    return true;
  }

  return current.workspaceSource == WorkspaceViewSource.live ||
      current.fileChanges.isNotEmpty ||
      current.terminalEntries.isNotEmpty ||
      current.preparationPhase == PreparationPhase.running ||
      hasHistoricalMessages;
}



class AgentConversationNotifier extends AsyncNotifier<ConversationState> {
  AgentConversationNotifier(this.params);

  final ConversationParams params;
  io.Socket? _socket;
  int _historyRequestVersion = 0;
  int _workspacePreviewRequestVersion = 0;
  int _workspaceTreeRequestVersion = 0;
  bool _isCleaningUp = false;
  bool _hasHistoricalMessages = false;
  String? _boundWorkspacePreviewId;
  String? _boundTenantId;

  @override
  Future<ConversationState> build() async {
    ref.onDispose(_cleanup);

    final messagesFuture = _fetchHistory();
    final bootstrapFuture = _resolveConversationBootstrap();
    final messages = await messagesFuture;
    final bootstrap = await bootstrapFuture;
    _hasHistoricalMessages = messages.isNotEmpty;
    _boundWorkspacePreviewId = bootstrap.workspacePreviewId;
    _boundTenantId = bootstrap.tenantId;
    Future<void>.microtask(() {
      if (!ref.mounted) {
        return;
      }
      _connectSocket();
      if (bootstrap.runtimeMode == 'sandbox') {
        if (_boundWorkspacePreviewId case final workspaceId?
            when workspaceId.isNotEmpty) {
          unawaited(_preloadWorkspaceSnapshot(workspaceId));
        }
        unawaited(_refreshWorkspaceTree(silent: true));
      }
    });

    return ConversationState(
      messages: messages,
      status: ConversationStatus.connecting,
      runtimeMode: bootstrap.runtimeMode,
    );
  }

  Future<ConversationBootstrap> _resolveConversationBootstrap() async {
    try {
      final agent = await ref.read(agentDetailProvider(params.agentId).future);
      return (
        runtimeMode: agent.runtimeMode,
        workspacePreviewId: _resolveWorkspacePreviewId(agent),
        tenantId: agent.tenantId,
      );
    } catch (_) {
      return (runtimeMode: 'sandbox', workspacePreviewId: null, tenantId: null);
    }
  }

  Future<List<ConversationMessageDto>> _fetchHistory() async {
    final api = ref.read(agentApiProvider);
    final response = await api.getMessages(params.conversationId);
    return response.data.map(normalizeHistoryMessage).toList(growable: false);
  }

  Future<void> _loadHistory({bool silent = false}) async {
    final requestVersion = ++_historyRequestVersion;
    try {
      final snapshot = normalizeConversationHistorySnapshot(
        await ref
            .read(agentApiProvider)
            .getConversationDetail(params.conversationId),
      );
      if (!ref.mounted || requestVersion != _historyRequestVersion) {
        return;
      }

      _hasHistoricalMessages = snapshot.messages.isNotEmpty;

      _updateState((current) {
        final mergedMessages = mergeHistoryWithLiveTail(
          current.messages,
          snapshot.messages,
        );
        final preservedLiveTail =
            mergedMessages.length > snapshot.messages.length;
        if (preservedLiveTail) {
          return current.copyWith(
            messages: mergedMessages,
            loadedPublishedVersionId: snapshot.loadedPublishedVersionId,
          );
        }

        if (snapshot.runningState == 'running') {
          return current.copyWith(
            messages: mergedMessages,
            status: ConversationStatus.executing,
            loadedPublishedVersionId: snapshot.loadedPublishedVersionId,
            clearError: true,
          );
        }

        if (snapshot.runningState == 'failed') {
          final runtimeError =
              snapshot.errorMessage ?? '当前对话执行失败，请检查 Agent 配置后重试。';
          if (snapshot.failedPhase != null) {
            return current.copyWith(
              messages: mergedMessages,
              status: ConversationStatus.error,
              preparationFailedPhase: snapshot.failedPhase,
              preparationError: runtimeError,
              error: runtimeError,
              loadedPublishedVersionId: snapshot.loadedPublishedVersionId,
            );
          }

          return current.copyWith(
            messages: mergedMessages,
            status: ConversationStatus.error,
            error: runtimeError,
            loadedPublishedVersionId: snapshot.loadedPublishedVersionId,
            clearPreparationPhase: true,
            clearPreparationStartTime: true,
            clearPreparationError: true,
            clearPreparationFailedPhase: true,
          );
        }

        if (snapshot.runningState == 'idle' ||
            snapshot.runningState == 'cancelled') {
          return current.copyWith(
            messages: mergedMessages,
            status: current.isConnected
                ? ConversationStatus.connected
                : ConversationStatus.idle,
            loadedPublishedVersionId: snapshot.loadedPublishedVersionId,
            clearError: true,
            clearPreparationPhase: true,
            clearPreparationStartTime: true,
            clearPreparationError: true,
            clearPreparationFailedPhase: true,
          );
        }

        return current.copyWith(
          messages: mergedMessages,
          loadedPublishedVersionId: snapshot.loadedPublishedVersionId,
        );
      });
    } catch (error) {
      if (!ref.mounted || silent) {
        return;
      }
      _updateState((current) => current.copyWith(error: '加载对话历史失败：$error'));
    }
  }

  void _connectSocket() {
    final authState = ref.read(authProvider).value;
    final env = ref.read(envProvider);
    final accessToken = switch (authState) {
      AuthStateAuthenticated(:final tokens) => tokens.accessToken,
      _ => null,
    };
    if (accessToken == null || accessToken.isEmpty) {
      _updateState(
        (current) => current.copyWith(
          status: ConversationStatus.error,
          error: '当前未登录，无法建立对话实时连接',
        ),
      );
      return;
    }

    final socketFactory = ref.read(agentConversationSocketFactoryProvider);
    final socket = socketFactory(
      _resolveConversationSocketUrl(env.apiBaseUrl),
      buildSocketConnectionOptions(authToken: accessToken),
    );

    _socket = socket;

    socket.onConnect((_) {
      _updateState(
        (current) => current.copyWith(
          isConnected: true,
          status: current.status == ConversationStatus.executing
              ? ConversationStatus.executing
              : ConversationStatus.connected,
          clearError: true,
        ),
      );
      socket.emitWithAck(
        'conversation:subscribe',
        {
          'conversationId': params.conversationId,
          if (_boundTenantId case final tenantId? when tenantId.isNotEmpty)
            'tenantId': tenantId,
        },
        ack: (response) {
          final ack = asMap(response);
          if (readString(ack['status']) != 'error') {
            return;
          }

          _updateState(
            (current) => current.copyWith(
              isConnected: false,
              status: ConversationStatus.error,
              error:
                  '实时订阅失败：${_describeConversationSubscribeError(readString(ack['error']) ?? readString(ack['message']))}',
            ),
          );
        },
      );
    });

    socket.onDisconnect((reason) {
      _updateState(
        (current) => current.copyWith(
          isConnected: false,
          status: ConversationStatus.idle,
          error: readString(reason) ?? '实时连接已断开',
        ),
      );
    });

    socket.onConnectError((error) {
      _updateState(
        (current) => current.copyWith(
          isConnected: false,
          status: ConversationStatus.error,
          error: '实时连接失败：$error',
        ),
      );
    });

    socket.on('conversation.agent.message_chunk', _handleMessageChunk);
    socket.on('conversation.agent.thinking', _handleThinking);
    socket.on('conversation.agent.tool_call', _handleToolCall);
    socket.on('conversation.agent.tool_result', _handleToolCall);
    socket.on('conversation.sandbox.terminal_output', _handleTerminalOutput);
    socket.on('conversation.sandbox.file_change', _handleFileChange);
    socket.on('conversation.agent.done', _handleAgentDone);
    socket.on('conversation.status.changed', _handleStatusChanged);

    socket.connect();
  }

  void _handleMessageChunk(Object? raw) {
    final payload = normalizeMessageChunkPayload(raw);
    if (payload == null || payload.conversationId != params.conversationId) {
      return;
    }

    _updateState(
      (current) => current.copyWith(
        messages: upsertAssistantMessage(
          current.messages,
          messageId: payload.messageId,
          conversationId: params.conversationId,
          transform: (message) => message.copyWith(
            content: '${message.content}${payload.chunk}',
            segments: appendTextSegment(message.segments, payload.chunk),
            isStreaming: true,
          ),
        ),
        status: ConversationStatus.executing,
        // 收到第一个 message_chunk 时清除准备阶段，触发卡片收缩
        clearPreparationPhase: current.preparationPhase != null,
        clearError: true,
      ),
    );
  }

  void _handleThinking(Object? raw) {
    final payload = normalizeThinkingPayload(raw);
    if (payload == null || payload.conversationId != params.conversationId) {
      return;
    }

    _updateState(
      (current) => current.copyWith(
        messages: upsertAssistantMessage(
          current.messages,
          messageId: payload.messageId,
          conversationId: params.conversationId,
          transform: (message) => message.copyWith(
            thinking: '${message.thinking ?? ''}${payload.content}',
            segments: appendThinkingSegment(message.segments, payload.content),
            isStreaming: true,
          ),
        ),
        status: ConversationStatus.executing,
        clearError: true,
      ),
    );
  }

  void _handleToolCall(Object? raw) {
    final payload = normalizeToolPayload(raw);
    if (payload == null || payload.conversationId != params.conversationId) {
      return;
    }

    _updateState(
      (current) => current.copyWith(
        messages: upsertAssistantMessage(
          current.messages,
          messageId: payload.messageId,
          conversationId: params.conversationId,
          transform: (message) => message.copyWith(
            toolCalls: upsertToolCall(message.toolCalls, payload),
            segments: ensureToolSegment(message.segments, payload.toolCallId),
            isStreaming: true,
          ),
        ),
        status: ConversationStatus.executing,
        clearError: true,
      ),
    );
  }

  void _handleTerminalOutput(Object? raw) {
    final payload = normalizeTerminalPayload(raw);
    if (payload == null || payload.conversationId != params.conversationId) {
      return;
    }
    final currentState = state.value;
    if (currentState == null || !currentState.hasSandboxRuntime) {
      return;
    }

    _updateState(
      (current) => current.copyWith(
        terminalEntries: [
          ...current.terminalEntries,
          TerminalEntry(
            id: _nextLocalId('terminal'),
            output: payload.output,
            timestamp: DateTime.now(),
            command: payload.command,
            sessionId: payload.sessionId,
          ),
        ],
        clearError: current.status != ConversationStatus.error,
      ),
    );
  }

  void _handleFileChange(Object? raw) {
    final payload = normalizeFileChangePayload(raw);
    if (payload == null || payload.conversationId != params.conversationId) {
      return;
    }
    final currentState = state.value;
    if (currentState == null || !currentState.hasSandboxRuntime) {
      return;
    }

    _updateState((current) {
      final clearSelected =
          payload.changeType == 'deleted' &&
          current.selectedFilePath == payload.path;
      final selectedFileContent =
          current.selectedFilePath == payload.path &&
              payload.content != null &&
              payload.changeType != 'deleted'
          ? WorkspaceFileContent(
              path: payload.path,
              content: payload.content!,
              size: payload.content!.length,
              encoding: 'utf-8',
            )
          : current.selectedFileContent;

      return current.copyWith(
        fileChanges: [
          ...current.fileChanges,
          WorkspaceFileChange(
            path: payload.path,
            changeType: payload.changeType,
            diff: payload.diff,
            content: payload.content,
          ),
        ],
        hasLoadedWorkspaceTree: true,
        workspaceSource: WorkspaceViewSource.live,
        workspaceTreeOnly: false,
        clearWorkspacePreviewUnavailableReason: true,
        selectedFileContent: selectedFileContent,
        clearSelectedFileContent: clearSelected,
        clearError: current.status != ConversationStatus.error,
      );
    });
  }

  void _handleAgentDone(Object? raw) {
    final payload = normalizeDonePayload(raw);
    if (payload.conversationId != params.conversationId) {
      return;
    }
    final hasSandboxRuntime = state.value?.hasSandboxRuntime ?? true;

    _updateState((current) {
      final messages = finishStreamingMessage(
        current.messages,
        messageId: payload.messageId,
      );

      if (current.status == ConversationStatus.error) {
        return current.copyWith(messages: messages);
      }

      return current.copyWith(
        messages: messages,
        status: current.isConnected
            ? ConversationStatus.connected
            : ConversationStatus.idle,
        clearPreparationPhase: true,
        clearPreparationStartTime: true,
        clearPreparationError: true,
        clearPreparationFailedPhase: true,
        clearError: true,
      );
    });

    unawaited(_loadHistory(silent: true));
    if (hasSandboxRuntime) {
      unawaited(_refreshWorkspaceTree(silent: true));
    }
  }

  void _handleStatusChanged(Object? raw) {
    final payload = normalizeStatusPayload(raw);
    if (payload == null || payload.conversationId != params.conversationId) {
      return;
    }

    final phase = parsePreparationPhase(payload.phase);
    final failedPhase = parsePreparationPhase(payload.failedPhase);

    _updateState((current) {
      // 记录沙箱复用标志
      final nextSandboxReused = payload.sandboxReused ?? current.sandboxReused;
      final runtimeError = payload.error ?? payload.errorMessage;

      // 准备阶段事件（status == 'preparing'）
      if (payload.status == 'preparing' && phase != null) {
        return current.copyWith(
          status: ConversationStatus.executing,
          preparationPhase: phase,
          preparationStartTime: current.preparationStartTime ?? DateTime.now(),
          sandboxReused: nextSandboxReused,
          clearError: true,
        );
      }

      // 失败事件，附带 failedPhase
      if (payload.status == 'failed' || payload.status == 'error') {
        if (failedPhase != null) {
          return current.copyWith(
            status: ConversationStatus.error,
            preparationFailedPhase: failedPhase,
            preparationError: runtimeError,
            sandboxReused: nextSandboxReused,
            error: runtimeError,
          );
        }

        return current.copyWith(
          status: ConversationStatus.error,
          sandboxReused: nextSandboxReused,
          error: runtimeError,
          clearPreparationPhase: true,
          clearPreparationStartTime: true,
          clearPreparationError: true,
          clearPreparationFailedPhase: true,
        );
      }

      // running 阶段 — 准备完成，Agent 循环即将开始
      if (phase == PreparationPhase.running) {
        return current.copyWith(
          status: normalizeConversationStatus(payload.status),
          preparationPhase: PreparationPhase.running,
          sandboxReused: nextSandboxReused,
          clearError: true,
        );
      }

      // 其他常规状态变更（completed / cancelled / 无 phase 的 running 等）
      // 终态（completed/cancelled）需要清除准备状态
      final isTerminal =
          payload.status == 'completed' || payload.status == 'cancelled';
      return current.copyWith(
        status: normalizeConversationStatus(payload.status),
        sandboxReused: nextSandboxReused,
        clearPreparationPhase: isTerminal,
        clearPreparationStartTime: isTerminal,
        clearPreparationError: isTerminal,
        clearPreparationFailedPhase: isTerminal,
        clearError: true,
      );
    });

    final shouldRefreshWorkspace =
        payload.status == 'running' ||
        payload.status == 'executing' ||
        phase == PreparationPhase.running;
    if (shouldRefreshWorkspace) {
      unawaited(_refreshWorkspaceTree(silent: true));
    }
  }

  Future<void> sendMessage(
    String content, {
    String contentType = 'text',
    Map<String, dynamic>? metadata,
  }) async {
    final trimmed = content.trim();
    if (trimmed.isEmpty) {
      return;
    }

    _updateState(
      (current) => current.copyWith(
        status: ConversationStatus.executing,
        // 重置上一轮的准备状态，为新一轮准备做好准备
        clearPreparationPhase: true,
        clearPreparationStartTime: true,
        clearPreparationError: true,
        clearPreparationFailedPhase: true,
        sandboxReused: false,
        workspaceTreeOnly: false,
        clearWorkspacePreviewUnavailableReason: true,
        clearError: true,
      ),
    );

    try {
      final response = await ref
          .read(agentApiProvider)
          .sendMessage(
            params.conversationId,
            content: trimmed,
            contentType: contentType,
            metadata: metadata,
          );
      if (!ref.mounted) {
        return;
      }

      final userMessage = normalizeHistoryMessage(response);
      _updateState(
        (current) => current.copyWith(
          messages: upsertMessage(current.messages, userMessage),
          status: ConversationStatus.executing,
          clearError: true,
        ),
      );
    } catch (error) {
      if (!ref.mounted) {
        return;
      }
      _updateState(
        (current) => current.copyWith(
          status: current.isConnected
              ? ConversationStatus.connected
              : ConversationStatus.error,
          error: '发送消息失败：$error',
        ),
      );
    }
  }

  Future<void> cancelConversation() async {
    try {
      _socket?.emit('conversation:cancel', {
        'conversationId': params.conversationId,
      });
      await ref
          .read(agentApiProvider)
          .cancelConversation(params.conversationId);
      if (!ref.mounted) {
        return;
      }
      _updateState(
        (current) => current.copyWith(
          status: current.isConnected
              ? ConversationStatus.connected
              : ConversationStatus.idle,
          clearError: true,
        ),
      );
    } catch (error) {
      if (!ref.mounted) {
        return;
      }
      _updateState((current) => current.copyWith(error: '取消执行失败：$error'));
    }
  }

  Future<void> resolveToolPermission(
    String toolCallId,
    String action, {
    String? rememberScope,
  }) async {
    try {
      await ref
          .read(agentApiProvider)
          .resolveToolPermission(
            params.conversationId,
            toolCallId,
            action: action,
            rememberScope: rememberScope,
          );
      if (!ref.mounted) {
        return;
      }

      final nextStatus = action == 'approve'
          ? ConversationToolStatus.inProgress
          : ConversationToolStatus.denied;
      final nextTransition = ConversationToolTransitionDto(
        from: action == 'approve'
            ? ConversationToolStatus.awaitingPermission
            : ConversationToolStatus.awaitingPermission,
        to: nextStatus,
        timestamp: DateTime.now().toIso8601String(),
        source: 'user',
      );

      _updateState((current) {
        final messages = current.messages
            .map((message) {
              final index = message.toolCalls.indexWhere(
                (toolCall) => toolCall.id == toolCallId,
              );
              if (index < 0) {
                return message;
              }

              final nextToolCalls = [...message.toolCalls];
              final toolCall = nextToolCalls[index];
              nextToolCalls[index] = toolCall.copyWith(
                status: nextStatus,
                transitions: [...toolCall.transitions, nextTransition],
                updatedAt: DateTime.now(),
              );
              return message.copyWith(toolCalls: nextToolCalls);
            })
            .toList(growable: false);

        return current.copyWith(messages: messages, clearError: true);
      });
    } catch (error) {
      if (!ref.mounted) {
        return;
      }
      _updateState((current) => current.copyWith(error: '处理工具权限失败：$error'));
    }
  }

  Future<String?> restartConversationToLatestVersion() async {
    try {
      final nextConversationId = await ref
          .read(agentApiProvider)
          .restartConversationToLatestVersion(params.conversationId);
      if (!ref.mounted || nextConversationId == null) {
        return nextConversationId;
      }

      if (nextConversationId == params.conversationId) {
        await _loadHistory();
        final currentState = state.value;
        if (currentState != null && currentState.hasSandboxRuntime) {
          await _refreshWorkspaceTree(silent: true);
        }
      }

      return nextConversationId;
    } catch (error) {
      if (!ref.mounted) {
        return null;
      }
      _updateState((current) => current.copyWith(error: '重启会话失败：$error'));
      return null;
    }
  }

  Future<void> refreshWorkspaceTree() {
    return _refreshWorkspaceTree();
  }

  Future<void> _preloadWorkspaceSnapshot(String workspaceId) async {
    final requestVersion = ++_workspacePreviewRequestVersion;

    try {
      final tree = await ref
          .read(resourcesApiProvider)
          .getWorkspaceTree(workspaceId);
      if (!ref.mounted || requestVersion != _workspacePreviewRequestVersion) {
        return;
      }

      _updateState((current) {
        if (!current.hasSandboxRuntime ||
            current.workspaceSource == WorkspaceViewSource.live) {
          return current;
        }

        final keepSelected =
            current.selectedFilePath != null &&
            _workspaceTreeContainsPath(tree, current.selectedFilePath!);
        return current.copyWith(
          fileTree: tree,
          hasLoadedWorkspaceTree: true,
          workspaceSource: WorkspaceViewSource.snapshotPreview,
          clearSelectedFilePath: !keepSelected,
          clearSelectedFileContent: true,
          clearError: current.status != ConversationStatus.error,
        );
      });
    } catch (_) {
      // 持久化工作区预载失败时继续走 live workspace 流程，不打断对话页加载。
    }
  }

  Future<void> _refreshWorkspaceTree({bool silent = false}) async {
    final currentState = state.value;
    if (currentState != null && !currentState.hasSandboxRuntime) {
      return;
    }
    final requestVersion = ++_workspaceTreeRequestVersion;
    _updateState((current) => current.copyWith(isLoadingWorkspace: true));
    try {
      final tree = await ref
          .read(agentApiProvider)
          .getWorkspaceTree(params.conversationId);
      if (!ref.mounted || requestVersion != _workspaceTreeRequestVersion) {
        return;
      }
      _updateState((current) {
        final keepSelected =
            current.selectedFilePath != null &&
            _workspaceTreeContainsPath(tree, current.selectedFilePath!);
        if (!_shouldTreatWorkspaceTreeAsLive(
          current,
          tree,
          hasHistoricalMessages: _hasHistoricalMessages,
        )) {
          if (current.workspaceSource == WorkspaceViewSource.snapshotPreview) {
            return current.copyWith(
              isLoadingWorkspace: false,
              clearError: current.status != ConversationStatus.error,
            );
          }

          return current.copyWith(
            fileTree: tree,
            hasLoadedWorkspaceTree: true,
            workspaceSource: WorkspaceViewSource.unavailable,
            isLoadingWorkspace: false,
            clearSelectedFilePath: !keepSelected,
            clearSelectedFileContent:
                !keepSelected || current.selectedFileContent == null,
            clearError: current.status != ConversationStatus.error,
          );
        }

        return current.copyWith(
          fileTree: tree,
          hasLoadedWorkspaceTree: true,
          workspaceSource: WorkspaceViewSource.live,
          workspaceTreeOnly: false,
          clearWorkspacePreviewUnavailableReason: true,
          isLoadingWorkspace: false,
          clearSelectedFilePath: !keepSelected,
          clearSelectedFileContent:
              !keepSelected || current.selectedFileContent == null,
          clearError: current.status != ConversationStatus.error,
        );
      });
    } catch (error) {
      if (!ref.mounted) {
        return;
      }
      final message = _describeConversationApiError(error);
      _updateState(
        (current) => current.copyWith(
          isLoadingWorkspace: false,
          error: silent ? current.error : '加载工作区失败：$message',
        ),
      );
    }
  }

  Future<void> openWorkspaceFile(String path) async {
    if (path.trim().isEmpty) {
      return;
    }

    final currentState = state.value;
    if (currentState != null && !currentState.hasSandboxRuntime) {
      return;
    }
    if (currentState?.workspaceSource == WorkspaceViewSource.snapshotPreview) {
      _updateState(
        (current) => current.copyWith(
          selectedFilePath: path,
          clearSelectedFileContent: true,
          clearError: current.status != ConversationStatus.error,
        ),
      );
      return;
    }
    if (currentState?.workspaceTreeOnly == true) {
      _updateState(
        (current) => current.copyWith(
          selectedFilePath: path,
          clearSelectedFileContent: true,
          clearError: current.status != ConversationStatus.error,
        ),
      );
      return;
    }

    _updateState(
      (current) => current.copyWith(
        selectedFilePath: path,
        isLoadingWorkspace: true,
        clearError: current.status != ConversationStatus.error,
      ),
    );

    try {
      final file = await ref
          .read(agentApiProvider)
          .getWorkspaceFile(params.conversationId, path);
      if (!ref.mounted) {
        return;
      }
      _updateState(
        (current) => current.copyWith(
          selectedFilePath: path,
          selectedFileContent: file,
          workspaceSource: WorkspaceViewSource.live,
          workspaceTreeOnly: false,
          clearWorkspacePreviewUnavailableReason: true,
          isLoadingWorkspace: false,
          clearError: current.status != ConversationStatus.error,
        ),
      );
    } catch (error) {
      if (!ref.mounted) {
        return;
      }
      final message = _describeConversationApiError(error);
      if (_isTreeOnlyWorkspacePreviewMessage(message)) {
        _updateState(
          (current) => current.copyWith(
            selectedFilePath: path,
            hasLoadedWorkspaceTree: true,
            workspaceSource: WorkspaceViewSource.live,
            workspaceTreeOnly: true,
            workspacePreviewUnavailableReason: message,
            clearSelectedFileContent: true,
            isLoadingWorkspace: false,
            clearError: current.status != ConversationStatus.error,
          ),
        );
        return;
      }
      _updateState(
        (current) => current.copyWith(
          isLoadingWorkspace: false,
          error: '读取文件失败：$message',
        ),
      );
    }
  }

  void _updateState(
    ConversationState Function(ConversationState current) transform,
  ) {
    if (_isCleaningUp || !ref.mounted) {
      return;
    }
    final current = state.value;
    if (current == null) {
      return;
    }
    state = AsyncValue.data(transform(current));
  }

  void _cleanup() {
    final socket = _socket;
    if (socket == null) {
      return;
    }

    _isCleaningUp = true;
    _socket = null;

    socket.emit('conversation:unsubscribe', {
      'conversationId': params.conversationId,
    });
    socket.clearListeners();
    socket.dispose();
  }
}

final agentConversationProvider = AsyncNotifierProvider.autoDispose
    .family<AgentConversationNotifier, ConversationState, ConversationParams>(
      AgentConversationNotifier.new,
    );

final agentConversationsProvider =
    FutureProvider.family<List<AgentConversationDto>, String>((ref, agentId) {
      final api = ref.read(agentApiProvider);
      return api.listConversations(agentId);
    });
