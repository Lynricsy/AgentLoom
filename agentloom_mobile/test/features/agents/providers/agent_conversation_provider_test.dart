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

    when(() => mockApi.getMessages(any())).thenAnswer(
      (_) async => const PaginatedResponse<ConversationMessageDto>(
        data: <ConversationMessageDto>[],
        meta: PaginationMeta(page: 1, pageSize: 50, total: 0, totalPages: 0),
      ),
    );
    when(
      () => mockApi.getWorkspaceTree(any()),
    ).thenAnswer((_) async => const []);
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
}

class MockSocket extends Mock implements io.Socket {}

class _FakeAuthNotifier extends AuthNotifier {
  _FakeAuthNotifier(this._fixedState);
  final AuthState _fixedState;

  @override
  Future<AuthState> build() async => _fixedState;
}
