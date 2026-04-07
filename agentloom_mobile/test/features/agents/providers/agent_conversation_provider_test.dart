import 'dart:async';

import 'package:agentloom_mobile/config/env.dart';
import 'package:agentloom_mobile/features/agents/api/agent_api.dart';
import 'package:agentloom_mobile/features/agents/models/conversation_message_dto.dart';
import 'package:agentloom_mobile/features/agents/providers/agent_conversation_provider.dart';
import 'package:agentloom_mobile/features/auth/models/auth_state.dart';
import 'package:agentloom_mobile/features/auth/models/auth_tokens.dart';
import 'package:agentloom_mobile/features/auth/models/login_user.dart';
import 'package:agentloom_mobile/features/auth/providers/auth_provider.dart';
import 'package:agentloom_mobile/features/resources/api/resources_api.dart';
import 'package:agentloom_mobile/shared/models/paginated_response.dart';
import 'package:agentloom_mobile/shared/providers/env_provider.dart';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import '../../../helpers/test_helpers.dart';

void _noopHandler([dynamic _]) {}

void main() {
  late MockAgentApi mockApi;
  late MockResourcesApi mockResourcesApi;
  late MockSocket mockSocket;
  late ProviderContainer container;
  late Map<String, Function> listeners;
  Map<String, dynamic>? capturedSocketOptions;
  Map<String, dynamic>? capturedSubscribePayload;
  Function? capturedSubscribeAck;

  const testTokens = AuthTokens(
    accessToken: 'test-access-token',
    refreshToken: 'test-refresh-token',
    expiresIn: 3600,
  );
  const testUser = LoginUser(id: 'user-1', email: 'fox@test.com');
  const testEnv = EnvConfig(
    studioBaseUrl: 'http://localhost:3000',
    appName: 'AgentLoom Test',
    environment: AppEnvironment.dev,
  );
  const params = (agentId: 'agent-001', conversationId: 'conv-001');

  setUpAll(() {
    registerFallbackValue(_noopHandler);
  });

  ProviderContainer createContainer() {
    return ProviderContainer(
      overrides: [
        agentApiProvider.overrideWithValue(mockApi),
        resourcesApiProvider.overrideWithValue(mockResourcesApi),
        baseEnvProvider.overrideWithValue(testEnv),
        authProvider.overrideWith(
          () => _FakeAuthNotifier(
            const AuthState.authenticated(user: testUser, tokens: testTokens),
          ),
        ),
        agentConversationSocketFactoryProvider.overrideWithValue((
          url,
          options,
        ) {
          capturedSocketOptions = options;
          return mockSocket;
        }),
      ],
    );
  }

  setUp(() {
    mockApi = MockAgentApi();
    mockResourcesApi = MockResourcesApi();
    mockSocket = MockSocket();
    listeners = <String, Function>{};
    capturedSocketOptions = null;
    capturedSubscribePayload = null;
    capturedSubscribeAck = null;

    when(
      () => mockApi.getAgent(any()),
    ).thenAnswer((_) async => createTestAgent(id: 'agent-001'));
    when(() => mockApi.getMessages(any())).thenAnswer(
      (_) async => const PaginatedResponse<ConversationMessageDto>(
        data: <ConversationMessageDto>[],
        meta: PaginationMeta(page: 1, pageSize: 50, total: 0, totalPages: 0),
      ),
    );
    when(() => mockApi.getConversationDetail(any())).thenAnswer(
      (_) async => (
        messages: const PaginatedResponse<ConversationMessageDto>(
          data: <ConversationMessageDto>[],
          meta: PaginationMeta(page: 1, pageSize: 50, total: 0, totalPages: 0),
        ),
        metadata: const <String, dynamic>{},
      ),
    );
    when(
      () => mockApi.getWorkspaceTree(any()),
    ).thenAnswer((_) async => const []);
    when(
      () => mockResourcesApi.getWorkspaceTree(any()),
    ).thenAnswer((_) async => const []);
    when(() => mockApi.getWorkspaceFile(any(), any())).thenThrow(
      DioException(
        requestOptions: RequestOptions(path: '/workspace/files/summary.txt'),
      ),
    );
    when(() => mockSocket.on(any(), any())).thenAnswer((invocation) {
      final event = invocation.positionalArguments[0] as String;
      final handler = invocation.positionalArguments[1] as Function;
      listeners[event] = handler;
      return () {
        listeners.remove(event);
      };
    });
    when(() => mockSocket.connect()).thenReturn(mockSocket);
    when(() => mockSocket.emit(any(), any())).thenReturn(null);
    when(
      () => mockSocket.emitWithAck(any(), any(), ack: any(named: 'ack')),
    ).thenAnswer((invocation) {
      final event = invocation.positionalArguments[0] as String;
      final data = invocation.positionalArguments[1];
      if (event == 'conversation:subscribe') {
        if (data is Map<String, dynamic>) {
          capturedSubscribePayload = data;
        } else if (data is Map<Object?, Object?>) {
          capturedSubscribePayload = data.map(
            (key, value) => MapEntry('$key', value),
          );
        }
        capturedSubscribeAck = invocation.namedArguments[#ack] as Function?;
      }
    });
    when(() => mockSocket.clearListeners()).thenAnswer((_) {
      listeners.clear();
    });
    when(() => mockSocket.dispose()).thenAnswer((_) {
      final disconnectHandler = listeners['disconnect'];
      if (disconnectHandler != null) {
        disconnectHandler('io client disconnect');
      }
    });

    container = createContainer();
    addTearDown(container.dispose);
  });

  test('dispose provider 时应先清空 socket 监听再销毁，避免 onDispose 生命周期断言', () async {
    container.listen(
      agentConversationProvider(params),
      (_, __) {},
      fireImmediately: true,
    );

    await container.read(authProvider.future);
    await container.read(agentConversationProvider(params).future);
    await Future<void>.delayed(const Duration(milliseconds: 20));
    verify(() => mockSocket.connect()).called(1);

    expect(() => container.dispose(), returnsNormally);

    verifyInOrder([
      () => mockSocket.emit('conversation:unsubscribe', any()),
      () => mockSocket.clearListeners(),
      () => mockSocket.dispose(),
    ]);
  });

  test('failed 状态事件应读取 errorMessage 并写入会话错误', () async {
    container.listen(
      agentConversationProvider(params),
      (_, __) {},
      fireImmediately: true,
    );

    await container.read(authProvider.future);
    await container.read(agentConversationProvider(params).future);
    await Future<void>.delayed(const Duration(milliseconds: 20));

    final statusHandler = listeners['conversation.status.changed'];
    expect(statusHandler, isNotNull);

    statusHandler?.call({
      'conversationId': 'conv-001',
      'status': 'failed',
      'errorMessage': '上游模型流中断（MODEL_PROVIDER_ERROR: terminated）',
    });

    final state = container.read(agentConversationProvider(params)).value;
    expect(state, isNotNull);
    expect(state!.status, ConversationStatus.error);
    expect(state.error, '上游模型流中断（MODEL_PROVIDER_ERROR: terminated）');
    expect(state.preparationPhase, isNull);
    expect(state.preparationFailedPhase, isNull);
  });

  test('done 事件不会在 detail 回拉前清掉已存在的失败态', () async {
    final detailCompleter = Completer<AgentConversationDetailDto>();
    when(
      () => mockApi.getConversationDetail(any()),
    ).thenAnswer((_) => detailCompleter.future);

    container.listen(
      agentConversationProvider(params),
      (_, __) {},
      fireImmediately: true,
    );

    await container.read(authProvider.future);
    await container.read(agentConversationProvider(params).future);
    await Future<void>.delayed(const Duration(milliseconds: 20));

    listeners['conversation.status.changed']?.call({
      'conversationId': 'conv-001',
      'status': 'failed',
      'errorMessage': '租户未配置默认 LLM 模型',
    });
    listeners['conversation.agent.done']?.call({
      'conversationId': 'conv-001',
      'messageId': 'assistant-1',
    });

    final state = container.read(agentConversationProvider(params)).value;
    expect(state, isNotNull);
    expect(state!.status, ConversationStatus.error);
    expect(state.error, '租户未配置默认 LLM 模型');

    detailCompleter.complete((
      messages: const PaginatedResponse<ConversationMessageDto>(
        data: <ConversationMessageDto>[],
        meta: PaginationMeta(page: 1, pageSize: 50, total: 0, totalPages: 0),
      ),
      metadata: const {
        'execution': {
          'runningState': 'failed',
          'errorMessage': '租户未配置默认 LLM 模型',
        },
      },
    ));
    await Future<void>.delayed(const Duration(milliseconds: 20));
  });

  test('history detail metadata 应同步失败态和错误摘要', () async {
    when(() => mockApi.getConversationDetail(any())).thenAnswer(
      (_) async => (
        messages: const PaginatedResponse<ConversationMessageDto>(
          data: [
            ConversationMessageDto(
              id: 'user-1',
              conversationId: 'conv-001',
              role: MessageRole.user,
              content: '你好',
              metadata: <String, dynamic>{},
              createdAt: '2026-04-04T09:17:38.000Z',
            ),
          ],
          meta: PaginationMeta(page: 1, pageSize: 50, total: 1, totalPages: 1),
        ),
        metadata: const {
          'execution': {
            'runningState': 'failed',
            'errorMessage': '租户未配置默认 LLM 模型',
          },
        },
      ),
    );

    container.listen(
      agentConversationProvider(params),
      (_, __) {},
      fireImmediately: true,
    );

    await container.read(authProvider.future);
    await container.read(agentConversationProvider(params).future);
    await Future<void>.delayed(const Duration(milliseconds: 20));

    listeners['conversation.agent.done']?.call({
      'conversationId': 'conv-001',
      'messageId': 'assistant-1',
    });
    await Future<void>.delayed(const Duration(milliseconds: 20));

    final state = container.read(agentConversationProvider(params)).value;
    expect(state, isNotNull);
    expect(state!.status, ConversationStatus.error);
    expect(state.error, '租户未配置默认 LLM 模型');
    expect(state.messages.single.content, '你好');
  });

  test('迟到的 history detail 不会覆盖当前 live tail', () async {
    final detailCompleter = Completer<AgentConversationDetailDto>();
    when(() => mockApi.getMessages(any())).thenAnswer(
      (_) async => const PaginatedResponse(
        data: [
          ConversationMessageDto(
            id: 'user-1',
            conversationId: 'conv-001',
            role: MessageRole.user,
            content: '上一轮问题',
            metadata: <String, dynamic>{},
            createdAt: '2026-04-06T00:00:00.000Z',
          ),
        ],
        meta: PaginationMeta(page: 1, pageSize: 50, total: 1, totalPages: 1),
      ),
    );
    when(
      () => mockApi.getConversationDetail(any()),
    ).thenAnswer((_) => detailCompleter.future);
    when(
      () => mockApi.sendMessage(
        any(),
        content: any(named: 'content'),
        role: any(named: 'role'),
        contentType: any(named: 'contentType'),
        metadata: any(named: 'metadata'),
      ),
    ).thenAnswer(
      (_) async => const ConversationMessageDto(
        id: 'user-2',
        conversationId: 'conv-001',
        role: MessageRole.user,
        content: '第二轮提问',
        metadata: <String, dynamic>{},
        createdAt: '2026-04-06T00:01:00.000Z',
      ),
    );

    container.listen(
      agentConversationProvider(params),
      (_, __) {},
      fireImmediately: true,
    );

    await container.read(authProvider.future);
    await container.read(agentConversationProvider(params).future);
    await Future<void>.delayed(const Duration(milliseconds: 20));

    listeners['conversation.agent.done']?.call({
      'conversationId': 'conv-001',
      'messageId': 'assistant-1',
    });

    final notifier = container.read(agentConversationProvider(params).notifier);
    await notifier.sendMessage('第二轮提问');
    listeners['conversation.agent.message_chunk']?.call({
      'conversationId': 'conv-001',
      'messageId': 'assistant-2',
      'chunk': '第二轮回答',
    });

    detailCompleter.complete((
      messages: const PaginatedResponse<ConversationMessageDto>(
        data: [
          ConversationMessageDto(
            id: 'user-1',
            conversationId: 'conv-001',
            role: MessageRole.user,
            content: '上一轮问题',
            metadata: <String, dynamic>{},
            createdAt: '2026-04-06T00:00:00.000Z',
          ),
        ],
        meta: PaginationMeta(page: 1, pageSize: 50, total: 1, totalPages: 1),
      ),
      metadata: const {
        'execution': {'runningState': 'idle'},
      },
    ));
    await Future<void>.delayed(const Duration(milliseconds: 20));

    final state = container.read(agentConversationProvider(params)).value;
    expect(state, isNotNull);
    expect(state!.status, ConversationStatus.executing);
    expect(state.messages.map((message) => message.content).toList(), [
      '上一轮问题',
      '第二轮提问',
      '第二轮回答',
    ]);
    expect(state.messages.last.isStreaming, isTrue);
  });

  test('socket 连接配置应按平台选择 transport 与鉴权头', () async {
    container.listen(
      agentConversationProvider(params),
      (_, __) {},
      fireImmediately: true,
    );

    await container.read(authProvider.future);
    await container.read(agentConversationProvider(params).future);
    await Future<void>.delayed(const Duration(milliseconds: 20));

    final transports = (capturedSocketOptions?['transports'] as List<Object?>?)
        ?.cast<String>();
    expect(
      transports,
      equals(
        kIsWeb
            ? const <String>['polling', 'websocket']
            : const <String>['websocket'],
      ),
    );
    expect(
      capturedSocketOptions?['auth'],
      equals({'token': testTokens.accessToken}),
    );
    if (!kIsWeb) {
      expect(
        capturedSocketOptions?['extraHeaders'],
        equals({'Authorization': 'Bearer ${testTokens.accessToken}'}),
      );
    }
  });

  test('connect 后订阅应透传 tenantId', () async {
    when(() => mockApi.getAgent('agent-001')).thenAnswer(
      (_) async => createTestAgent(id: 'agent-001', tenantId: 'tenant-001'),
    );

    container.listen(
      agentConversationProvider(params),
      (_, __) {},
      fireImmediately: true,
    );

    await container.read(authProvider.future);
    await container.read(agentConversationProvider(params).future);
    await Future<void>.delayed(const Duration(milliseconds: 20));

    listeners['connect']?.call(null);

    expect(capturedSubscribePayload, {
      'conversationId': 'conv-001',
      'tenantId': 'tenant-001',
    });
  });

  test('订阅 ACK 返回 error 时应展示失败原因并标记未连接', () async {
    container.listen(
      agentConversationProvider(params),
      (_, __) {},
      fireImmediately: true,
    );

    await container.read(authProvider.future);
    await container.read(agentConversationProvider(params).future);
    await Future<void>.delayed(const Duration(milliseconds: 20));

    listeners['connect']?.call(null);
    capturedSubscribeAck?.call({'status': 'error', 'error': 'FORBIDDEN'});

    final state = container.read(agentConversationProvider(params)).value;
    expect(state, isNotNull);
    expect(state!.isConnected, isFalse);
    expect(state.status, ConversationStatus.error);
    expect(state.error, '实时订阅失败：当前账号无权访问该对话');
  });

  test('sendMessage 应透传附件消息的 contentType 与 metadata', () async {
    when(
      () => mockApi.sendMessage(
        any(),
        content: any(named: 'content'),
        role: any(named: 'role'),
        contentType: any(named: 'contentType'),
        metadata: any(named: 'metadata'),
      ),
    ).thenAnswer(
      (_) async => const ConversationMessageDto(
        id: 'user-attachment-1',
        conversationId: 'conv-001',
        role: MessageRole.user,
        content: '请查看附件',
        metadata: {
          'attachment': {
            'kind': 'file',
            'fileName': 'notes.txt',
            'mimeType': 'text/plain',
            'sizeBytes': 18,
            'textContent': 'ATTACH-QA-20260406',
          },
        },
        createdAt: '2026-04-06T00:00:00.000Z',
      ),
    );

    container.listen(
      agentConversationProvider(params),
      (_, __) {},
      fireImmediately: true,
    );

    await container.read(authProvider.future);
    await container.read(agentConversationProvider(params).future);
    await Future<void>.delayed(const Duration(milliseconds: 20));

    await container
        .read(agentConversationProvider(params).notifier)
        .sendMessage(
          '请查看附件',
          contentType: 'file',
          metadata: const <String, dynamic>{
            'attachment': {
              'kind': 'file',
              'fileName': 'notes.txt',
              'mimeType': 'text/plain',
              'sizeBytes': 18,
              'textContent': 'ATTACH-QA-20260406',
            },
          },
        );

    verify(
      () => mockApi.sendMessage(
        'conv-001',
        content: '请查看附件',
        role: 'user',
        contentType: 'file',
        metadata: const <String, dynamic>{
          'attachment': {
            'kind': 'file',
            'fileName': 'notes.txt',
            'mimeType': 'text/plain',
            'sizeBytes': 18,
            'textContent': 'ATTACH-QA-20260406',
          },
        },
      ),
    ).called(1);

    final state = container.read(agentConversationProvider(params)).value;
    expect(state, isNotNull);
    expect(state!.messages, hasLength(1));
    expect(state.messages.single.content, '请查看附件');
    expect(
      (state.messages.single.metadata['attachment']
              as Map<String, dynamic>)['fileName']
          as String,
      'notes.txt',
    );
  });

  test('历史消息中的 MCP 文本信封结果应保留结构化 restartSuggestion', () async {
    when(() => mockApi.getMessages(any())).thenAnswer(
      (_) async => const PaginatedResponse(
        data: [
          ConversationMessageDto(
            id: 'assistant-1',
            conversationId: 'conv-001',
            role: MessageRole.assistant,
            content: '已完成自进化发布',
            toolCalls: [
              ConversationToolCallDto(
                id: 'tool-1',
                tool: 'apply_change',
                status: ConversationToolStatus.completed,
                result: {
                  'content': [
                    {
                      'type': 'text',
                      'text':
                          '{"data":{"restartSuggestion":{"available":true,"publishedVersionId":"pub-1","publishedVersionNumber":7}}}',
                    },
                  ],
                },
              ),
            ],
            metadata: {
              'segments': [
                {'type': 'tool_call', 'toolCallId': 'tool-1'},
              ],
            },
            createdAt: '2026-04-02T00:00:00.000Z',
          ),
        ],
        meta: PaginationMeta(page: 1, pageSize: 50, total: 1, totalPages: 1),
      ),
    );

    container.listen(
      agentConversationProvider(params),
      (_, __) {},
      fireImmediately: true,
    );

    await container.read(authProvider.future);
    final state = await container.read(
      agentConversationProvider(params).future,
    );

    expect(
      (state.messages.first.toolCalls.first.result
          as Map<String, dynamic>)['data'],
      equals({
        'restartSuggestion': {
          'available': true,
          'publishedVersionId': 'pub-1',
          'publishedVersionNumber': 7,
        },
      }),
    );
  });

  test('已完成会话只保留目录树时应进入 tree-only 模式并停止再次请求文件预览', () async {
    when(() => mockApi.getWorkspaceTree(any())).thenAnswer(
      (_) async => const [
        WorkspaceFileNode(
          name: 'summary.txt',
          path: 'summary.txt',
          type: 'file',
        ),
      ],
    );
    when(() => mockApi.getWorkspaceFile(any(), any())).thenThrow(
      DioException(
        requestOptions: RequestOptions(path: '/workspace/files/summary.txt'),
        response: Response<Map<String, dynamic>>(
          requestOptions: RequestOptions(path: '/workspace/files/summary.txt'),
          data: const {'message': '此运行已结束，仅保留工作区目录结构，未保留文件内容预览'},
          statusCode: 409,
        ),
        type: DioExceptionType.badResponse,
      ),
    );

    container.listen(
      agentConversationProvider(params),
      (_, __) {},
      fireImmediately: true,
    );

    await container.read(authProvider.future);
    await container.read(agentConversationProvider(params).future);
    await Future<void>.delayed(const Duration(milliseconds: 20));

    final notifier = container.read(agentConversationProvider(params).notifier);

    await notifier.openWorkspaceFile('summary.txt');

    final stateAfterFallback = container
        .read(agentConversationProvider(params))
        .value;
    expect(stateAfterFallback, isNotNull);
    expect(stateAfterFallback!.workspaceTreeOnly, isTrue);
    expect(
      stateAfterFallback.workspacePreviewUnavailableReason,
      '此运行已结束，仅保留工作区目录结构，未保留文件内容预览',
    );
    expect(stateAfterFallback.selectedFileContent, isNull);
    expect(stateAfterFallback.error, isNull);

    clearInteractions(mockApi);

    await notifier.openWorkspaceFile('summary.txt');

    verifyNever(() => mockApi.getWorkspaceFile(any(), any()));
    final stateAfterSecondTap = container
        .read(agentConversationProvider(params))
        .value;
    expect(stateAfterSecondTap!.selectedFilePath, 'summary.txt');
    expect(stateAfterSecondTap.workspaceTreeOnly, isTrue);
  });

  test('绑定持久化 workspace 的对话页初始化时应先显示目录预览', () async {
    when(() => mockApi.getAgent('agent-001')).thenAnswer(
      (_) async =>
          createTestAgent(id: 'agent-001', workspaceSnapshotId: 'ws-001'),
    );
    when(() => mockResourcesApi.getWorkspaceTree('ws-001')).thenAnswer(
      (_) async => const [
        WorkspaceFileNode(name: 'seed.txt', path: 'seed.txt', type: 'file'),
      ],
    );
    when(
      () => mockApi.getWorkspaceTree(any()),
    ).thenAnswer((_) async => const []);

    container.listen(
      agentConversationProvider(params),
      (_, __) {},
      fireImmediately: true,
    );

    await container.read(authProvider.future);
    await container.read(agentConversationProvider(params).future);
    await Future<void>.delayed(const Duration(milliseconds: 20));

    final state = container.read(agentConversationProvider(params)).value;
    expect(state, isNotNull);
    expect(state!.workspaceSource, WorkspaceViewSource.snapshotPreview);
    expect(state.hasLoadedWorkspaceTree, isTrue);
    expect(state.fileTree, hasLength(1));
    expect(state.fileTree.single.name, 'seed.txt');
    expect(state.fileTree.single.path, 'seed.txt');
  });

  test(
    'sandbox restoreWorkspaceId 与 workspaceSnapshotId 冲突时应优先预载实际恢复工作区',
    () async {
      when(() => mockApi.getAgent('agent-001')).thenAnswer(
        (_) async => createTestAgent(
          id: 'agent-001',
          workspaceSnapshotId: 'preview-ws',
          sandboxConfig: {'restoreWorkspaceId': 'restore-ws'},
        ),
      );
      when(() => mockResourcesApi.getWorkspaceTree('restore-ws')).thenAnswer(
        (_) async => const [
          WorkspaceFileNode(
            name: 'restore-note.md',
            path: 'restore-note.md',
            type: 'file',
          ),
        ],
      );
      when(
        () => mockApi.getWorkspaceTree(any()),
      ).thenAnswer((_) async => const []);

      container.listen(
        agentConversationProvider(params),
        (_, __) {},
        fireImmediately: true,
      );

      await container.read(authProvider.future);
      await container.read(agentConversationProvider(params).future);
      await Future<void>.delayed(const Duration(milliseconds: 20));

      verify(() => mockResourcesApi.getWorkspaceTree('restore-ws')).called(1);
      verifyNever(() => mockResourcesApi.getWorkspaceTree('preview-ws'));

      final state = container.read(agentConversationProvider(params)).value;
      expect(state, isNotNull);
      expect(state!.workspaceSource, WorkspaceViewSource.snapshotPreview);
      expect(state.fileTree, hasLength(1));
      expect(state.fileTree.single.name, 'restore-note.md');
    },
  );

  test('持久化 workspace 预览模式点文件时不请求 live 文件内容', () async {
    when(() => mockApi.getAgent('agent-001')).thenAnswer(
      (_) async =>
          createTestAgent(id: 'agent-001', workspaceSnapshotId: 'ws-001'),
    );
    when(() => mockResourcesApi.getWorkspaceTree('ws-001')).thenAnswer(
      (_) async => const [
        WorkspaceFileNode(name: 'seed.txt', path: 'seed.txt', type: 'file'),
      ],
    );
    when(
      () => mockApi.getWorkspaceTree(any()),
    ).thenAnswer((_) async => const []);

    container.listen(
      agentConversationProvider(params),
      (_, __) {},
      fireImmediately: true,
    );

    await container.read(authProvider.future);
    await container.read(agentConversationProvider(params).future);
    await Future<void>.delayed(const Duration(milliseconds: 20));

    final notifier = container.read(agentConversationProvider(params).notifier);
    await notifier.openWorkspaceFile('seed.txt');

    verifyNever(() => mockApi.getWorkspaceFile(any(), any()));
    final state = container.read(agentConversationProvider(params)).value;
    expect(state, isNotNull);
    expect(state!.workspaceSource, WorkspaceViewSource.snapshotPreview);
    expect(state.selectedFilePath, 'seed.txt');
    expect(state.selectedFileContent, isNull);
  });

  test('迟到的持久化 workspace 预载不会覆盖已经进入 live 的工作区树', () async {
    final snapshotCompleter = Completer<List<WorkspaceFileNode>>();
    when(() => mockApi.getAgent('agent-001')).thenAnswer(
      (_) async =>
          createTestAgent(id: 'agent-001', workspaceSnapshotId: 'ws-001'),
    );
    when(
      () => mockResourcesApi.getWorkspaceTree('ws-001'),
    ).thenAnswer((_) => snapshotCompleter.future);
    when(() => mockApi.getWorkspaceTree(any())).thenAnswer(
      (_) async => const [
        WorkspaceFileNode(name: 'live.txt', path: 'live.txt', type: 'file'),
      ],
    );

    container.listen(
      agentConversationProvider(params),
      (_, __) {},
      fireImmediately: true,
    );

    await container.read(authProvider.future);
    await container.read(agentConversationProvider(params).future);
    await Future<void>.delayed(const Duration(milliseconds: 20));

    snapshotCompleter.complete(const [
      WorkspaceFileNode(name: 'seed.txt', path: 'seed.txt', type: 'file'),
    ]);
    await Future<void>.delayed(const Duration(milliseconds: 20));

    final state = container.read(agentConversationProvider(params)).value;
    expect(state, isNotNull);
    expect(state!.workspaceSource, WorkspaceViewSource.live);
    expect(state.fileTree, hasLength(1));
    expect(state.fileTree.single.name, 'live.txt');
    expect(state.fileTree.single.path, 'live.txt');
  });

  test('无 sandbox agent 初始化时不请求工作区树', () async {
    when(() => mockApi.getAgent('agent-001')).thenAnswer(
      (_) async => createTestAgent(id: 'agent-001', runtimeMode: 'no_sandbox'),
    );

    container.listen(
      agentConversationProvider(params),
      (_, __) {},
      fireImmediately: true,
    );

    await container.read(authProvider.future);
    await container.read(agentConversationProvider(params).future);
    await Future<void>.delayed(const Duration(milliseconds: 20));

    verifyNever(() => mockApi.getWorkspaceTree(any()));
    final state = container.read(agentConversationProvider(params)).value;
    expect(state, isNotNull);
    expect(state!.runtimeMode, 'no_sandbox');
    expect(state.hasSandboxRuntime, isFalse);
    expect(state.hasLoadedWorkspaceTree, isFalse);
  });

  test('resolveToolPermission 应透传 rememberScope 并更新本地工具状态', () async {
    when(() => mockApi.getMessages(any())).thenAnswer(
      (_) async => const PaginatedResponse(
        data: [
          ConversationMessageDto(
            id: 'assistant-1',
            conversationId: 'conv-001',
            role: MessageRole.assistant,
            content: '准备修改自身编排',
            toolCalls: [
              ConversationToolCallDto(
                id: 'tool-1',
                tool: 'apply_change',
                status: ConversationToolStatus.awaitingPermission,
              ),
            ],
            metadata: {
              'segments': [
                {'type': 'tool_call', 'toolCallId': 'tool-1'},
              ],
            },
            createdAt: '2026-04-02T00:00:00.000Z',
          ),
        ],
        meta: PaginationMeta(page: 1, pageSize: 50, total: 1, totalPages: 1),
      ),
    );
    when(
      () => mockApi.resolveToolPermission(
        any(),
        any(),
        action: any(named: 'action'),
        rememberScope: any(named: 'rememberScope'),
      ),
    ).thenAnswer((_) async {});

    container.listen(
      agentConversationProvider(params),
      (_, __) {},
      fireImmediately: true,
    );
    await container.read(authProvider.future);
    await container.read(agentConversationProvider(params).future);
    await Future<void>.delayed(const Duration(milliseconds: 20));

    final notifier = container.read(agentConversationProvider(params).notifier);
    await notifier.resolveToolPermission(
      'tool-1',
      'approve',
      rememberScope: 'conversation_category',
    );

    verify(
      () => mockApi.resolveToolPermission(
        'conv-001',
        'tool-1',
        action: 'approve',
        rememberScope: 'conversation_category',
      ),
    ).called(1);

    final state = container.read(agentConversationProvider(params)).value;
    final toolCall = state!.messages.single.toolCalls.single;
    expect(toolCall.status, ConversationToolStatus.inProgress);
    expect(toolCall.transitions.last.source, 'user');
    expect(toolCall.transitions.last.to, ConversationToolStatus.inProgress);
  });

  test('restartConversationToLatestVersion 应返回新会话 id', () async {
    when(
      () => mockApi.restartConversationToLatestVersion(any()),
    ).thenAnswer((_) async => 'conv-002');

    container.listen(
      agentConversationProvider(params),
      (_, __) {},
      fireImmediately: true,
    );
    await container.read(authProvider.future);
    await container.read(agentConversationProvider(params).future);
    await Future<void>.delayed(const Duration(milliseconds: 20));

    final notifier = container.read(agentConversationProvider(params).notifier);
    final nextConversationId = await notifier
        .restartConversationToLatestVersion();

    expect(nextConversationId, 'conv-002');
    verify(
      () => mockApi.restartConversationToLatestVersion('conv-001'),
    ).called(1);
  });
}

class MockSocket extends Mock implements io.Socket {}

class _FakeAuthNotifier extends AuthNotifier {
  _FakeAuthNotifier(this._fixedState);
  final AuthState _fixedState;

  @override
  Future<AuthState> build() async => _fixedState;
}
