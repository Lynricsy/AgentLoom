import 'package:agentloom_mobile/config/env.dart';
import 'package:agentloom_mobile/features/agents/api/agent_api.dart';
import 'package:agentloom_mobile/features/agents/models/conversation_message_dto.dart';
import 'package:agentloom_mobile/features/agents/providers/agent_conversation_provider.dart';
import 'package:agentloom_mobile/features/auth/models/auth_state.dart';
import 'package:agentloom_mobile/features/auth/models/auth_tokens.dart';
import 'package:agentloom_mobile/features/auth/models/login_user.dart';
import 'package:agentloom_mobile/features/auth/providers/auth_provider.dart';
import 'package:agentloom_mobile/shared/models/paginated_response.dart';
import 'package:agentloom_mobile/shared/providers/env_provider.dart';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import '../../../helpers/test_helpers.dart';

void _noopHandler([dynamic _]) {}

void main() {
  late MockAgentApi mockApi;
  late MockSocket mockSocket;
  late ProviderContainer container;
  late Map<String, Function> listeners;
  Map<String, dynamic>? capturedSocketOptions;

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
    mockSocket = MockSocket();
    listeners = <String, Function>{};
    capturedSocketOptions = null;

    when(
      () => mockApi.getAgent(any()),
    ).thenAnswer((_) async => createTestAgent(id: 'agent-001'));
    when(() => mockApi.getMessages(any())).thenAnswer(
      (_) async => const PaginatedResponse<ConversationMessageDto>(
        data: <ConversationMessageDto>[],
        meta: PaginationMeta(page: 1, pageSize: 50, total: 0, totalPages: 0),
      ),
    );
    when(
      () => mockApi.getWorkspaceTree(any()),
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

  test('socket 连接配置应允许 polling 回退再升级 websocket', () async {
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
    expect(transports, equals(const <String>['polling', 'websocket']));
    expect(
      capturedSocketOptions?['auth'],
      equals({'token': testTokens.accessToken}),
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
