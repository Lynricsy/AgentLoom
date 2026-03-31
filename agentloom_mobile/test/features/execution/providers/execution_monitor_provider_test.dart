import 'dart:async';

import 'package:agentloom_mobile/config/env.dart';
import 'package:agentloom_mobile/features/auth/models/auth_state.dart';
import 'package:agentloom_mobile/features/auth/models/auth_tokens.dart';
import 'package:agentloom_mobile/features/auth/models/login_user.dart';
import 'package:agentloom_mobile/features/auth/providers/auth_provider.dart';
import 'package:agentloom_mobile/features/execution/models/execution_event.dart';
import 'package:agentloom_mobile/features/execution/models/execution_state.dart';
import 'package:agentloom_mobile/features/execution/models/subscribe_ack.dart';
import 'package:agentloom_mobile/features/execution/providers/execution_monitor_provider.dart';
import 'package:agentloom_mobile/features/workflows/api/workflow_api.dart';
import 'package:agentloom_mobile/shared/providers/env_provider.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import '../../../helpers/test_helpers.dart';

void main() {
  late MockWorkflowApi mockApi;
  late MockExecutionSocketService mockSocket;
  late ProviderContainer container;

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

  /// 创建带 mock 覆盖的容器
  ProviderContainer createContainer({AuthState? authState}) {
    return ProviderContainer(
      overrides: [
        workflowApiProvider.overrideWithValue(mockApi),
        baseEnvProvider.overrideWithValue(testEnv),
        authProvider.overrideWith(
          () => _FakeAuthNotifier(
            authState ??
                const AuthState.authenticated(
                  user: testUser,
                  tokens: testTokens,
                ),
          ),
        ),
        socketServiceFactoryProvider.overrideWithValue(
          ({required baseUrl, required authToken}) => mockSocket,
        ),
      ],
    );
  }

  /// 初始化 auth provider 确保 token 就绪（async notifier 需要一个 microtask）
  Future<void> ensureAuthReady(ProviderContainer c) async {
    await c.read(authProvider.future);
  }

  setUp(() {
    mockApi = MockWorkflowApi();
    mockSocket = MockExecutionSocketService();

    // 默认 mock 行为
    when(() => mockSocket.isConnected).thenReturn(true);
    when(() => mockSocket.connect()).thenReturn(null);
    when(() => mockSocket.dispose()).thenReturn(null);
    when(
      () => mockSocket.unsubscribe(
        executionId: any(named: 'executionId'),
        tenantId: any(named: 'tenantId'),
      ),
    ).thenReturn(null);

    // 默认流返回空流
    when(
      () => mockSocket.executionStatusChanged,
    ).thenAnswer((_) => const Stream.empty());
    when(
      () => mockSocket.nodeStatusChanged,
    ).thenAnswer((_) => const Stream.empty());
    when(
      () => mockSocket.stateSnapshot,
    ).thenAnswer((_) => const Stream.empty());
    when(() => mockSocket.onConnected).thenAnswer((_) => Stream.value(null));
    when(
      () => mockSocket.onDisconnected,
    ).thenAnswer((_) => const Stream.empty());
    when(
      () => mockSocket.onReconnected,
    ).thenAnswer((_) => const Stream.empty());
    when(
      () => mockSocket.onConnectError,
    ).thenAnswer((_) => const Stream.empty());
  });

  tearDown(() {
    container.dispose();
  });

  group('ExecutionMonitorNotifier', () {
    group('build() — 初始加载', () {
      test('REST 成功 + WS 连接成功 → Connected 状态', () async {
        final execution = createTestExecution(
          id: 'exec-1',
          status: 'running',
          totalSteps: 3,
          completedSteps: 1,
        );
        when(
          () => mockApi.getExecution('exec-1'),
        ).thenAnswer((_) async => execution);

        final ackSnapshot = createTestStateSnapshot(
          executionId: 'exec-1',
          status: 'running',
          lastEventId: 10,
        );
        when(
          () => mockSocket.subscribe(
            executionId: any(named: 'executionId'),
            lastEventId: any(named: 'lastEventId'),
          ),
        ).thenAnswer(
          (_) async => createTestSubscribeAck(currentState: ackSnapshot),
        );

        container = createContainer();
        await ensureAuthReady(container);

        final sub = container.listen(
          executionMonitorProvider('exec-1'),
          (_, __) {},
        );

        await container.read(executionMonitorProvider('exec-1').future);

        final state = container.read(executionMonitorProvider('exec-1')).value;

        expect(state, isA<ExecutionMonitorConnected>());
        final connected = state as ExecutionMonitorConnected;
        expect(connected.snapshot.executionId, 'exec-1');
        expect(connected.connectionMode, ConnectionMode.websocket);

        sub.close();
      });

      test('REST 成功 + 终态执行 → Disconnected 状态（不连接 WS）', () async {
        final execution = createTestExecution(
          id: 'exec-1',
          status: 'completed',
          totalSteps: 3,
          completedSteps: 3,
        );
        when(
          () => mockApi.getExecution('exec-1'),
        ).thenAnswer((_) async => execution);

        container = createContainer();
        // 终态不需 WS，但 auth 仍要就绪（provider 先 REST 再判断终态）
        await ensureAuthReady(container);

        final sub = container.listen(
          executionMonitorProvider('exec-1'),
          (_, __) {},
        );

        await container.read(executionMonitorProvider('exec-1').future);

        final state = container.read(executionMonitorProvider('exec-1')).value;

        expect(state, isA<ExecutionMonitorDisconnected>());
        final disconnected = state as ExecutionMonitorDisconnected;
        expect(disconnected.lastSnapshot?.status, 'completed');

        // WS 不应被调用
        verifyNever(() => mockSocket.connect());

        sub.close();
      });

      test('REST 失败 → Error 状态', () async {
        when(
          () => mockApi.getExecution('exec-1'),
        ).thenThrow(Exception('Network error'));

        container = createContainer();
        await ensureAuthReady(container);

        // 使用 container.listen + Completer 避免 dispose 竞态
        final completer = Completer<void>();
        container.listen(executionMonitorProvider('exec-1'), (prev, next) {
          if (next.hasValue && !completer.isCompleted) {
            completer.complete();
          }
        }, fireImmediately: true);

        await completer.future;

        final state = container.read(executionMonitorProvider('exec-1')).value;

        expect(state, isA<ExecutionMonitorError>());
        final error = state as ExecutionMonitorError;
        expect(error.message, contains('Failed to load execution'));
        expect(error.executionId, 'exec-1');
      });

      test('REST 成功 + WS 连接超时 → Polling 降级', () async {
        final execution = createTestExecution(id: 'exec-1', status: 'running');
        when(
          () => mockApi.getExecution('exec-1'),
        ).thenAnswer((_) async => execution);

        // onConnected 永不 emit → 触发 timeout
        when(
          () => mockSocket.onConnected,
        ).thenAnswer((_) => const Stream.empty());

        container = createContainer();
        await ensureAuthReady(container);

        final sub = container.listen(
          executionMonitorProvider('exec-1'),
          (_, __) {},
        );

        await container.read(executionMonitorProvider('exec-1').future);

        final state = container.read(executionMonitorProvider('exec-1')).value;

        expect(state, isA<ExecutionMonitorPolling>());

        sub.close();
      });

      test('REST detail 自带 steps 时，Polling 快照保留步骤元数据', () async {
        final execution = createTestExecution(
          id: 'exec-1',
          status: 'running',
          definitionSnapshot: {
            'nodes': [
              {
                'id': 'node-1',
                'type': 'llm-agent',
                'data': {'label': 'Email Agent', 'nodeType': 'agent'},
              },
            ],
          },
          steps: [
            createTestExecutionStep(
              id: 'step-1',
              executionId: 'exec-1',
              nodeId: 'node-1',
              nodeType: 'llm-agent',
              nodeData: {'label': 'Email Agent'},
              status: 'running',
              completedAt: null,
            ),
          ],
        );
        when(
          () => mockApi.getExecution('exec-1'),
        ).thenAnswer((_) async => execution);

        when(
          () => mockSocket.onConnected,
        ).thenAnswer((_) => const Stream.empty());

        container = createContainer();
        await ensureAuthReady(container);

        final sub = container.listen(
          executionMonitorProvider('exec-1'),
          (_, __) {},
        );

        await container.read(executionMonitorProvider('exec-1').future);

        final state = container.read(executionMonitorProvider('exec-1')).value;

        expect(state, isA<ExecutionMonitorPolling>());
        final polling = state as ExecutionMonitorPolling;
        expect(polling.snapshot.steps, hasLength(1));
        expect(polling.snapshot.steps.first.nodeName, 'Email Agent');
        expect(polling.snapshot.steps.first.nodeType, 'agent');

        sub.close();
      });

      test('未认证 → WS 失败降级到 Polling', () async {
        final execution = createTestExecution(id: 'exec-1', status: 'running');
        when(
          () => mockApi.getExecution('exec-1'),
        ).thenAnswer((_) async => execution);

        container = createContainer(
          authState: const AuthState.unauthenticated(),
        );
        await ensureAuthReady(container);

        final completer = Completer<void>();
        container.listen(executionMonitorProvider('exec-1'), (prev, next) {
          if (next.hasValue && !completer.isCompleted) {
            completer.complete();
          }
        }, fireImmediately: true);

        await completer.future;

        final state = container.read(executionMonitorProvider('exec-1')).value;

        // 未认证 → token null → WS 连接失败 → 降级到 Polling
        expect(state, isA<ExecutionMonitorPolling>());
      });

      test('failed 执行 → Disconnected 状态', () async {
        final execution = createTestExecution(id: 'exec-1', status: 'failed');
        when(
          () => mockApi.getExecution('exec-1'),
        ).thenAnswer((_) async => execution);

        container = createContainer();
        await ensureAuthReady(container);

        final sub = container.listen(
          executionMonitorProvider('exec-1'),
          (_, __) {},
        );

        await container.read(executionMonitorProvider('exec-1').future);

        final state = container.read(executionMonitorProvider('exec-1')).value;

        expect(state, isA<ExecutionMonitorDisconnected>());
        verifyNever(() => mockSocket.connect());

        sub.close();
      });

      test('cancelled 执行 → Disconnected 状态', () async {
        final execution = createTestExecution(
          id: 'exec-1',
          status: 'cancelled',
        );
        when(
          () => mockApi.getExecution('exec-1'),
        ).thenAnswer((_) async => execution);

        container = createContainer();
        await ensureAuthReady(container);

        final sub = container.listen(
          executionMonitorProvider('exec-1'),
          (_, __) {},
        );

        await container.read(executionMonitorProvider('exec-1').future);

        final state = container.read(executionMonitorProvider('exec-1')).value;

        expect(state, isA<ExecutionMonitorDisconnected>());

        sub.close();
      });
    });

    group('事件处理', () {
      /// 设置默认的 running execution + WS 连接成功的 mock
      Future<void> setupRunningExecution() async {
        final execution = createTestExecution(
          id: 'exec-1',
          status: 'running',
          totalSteps: 3,
          completedSteps: 1,
        );
        when(
          () => mockApi.getExecution('exec-1'),
        ).thenAnswer((_) async => execution);

        final ackSnapshot = createTestStateSnapshot(
          executionId: 'exec-1',
          status: 'running',
          lastEventId: 10,
        );
        when(
          () => mockSocket.subscribe(
            executionId: any(named: 'executionId'),
            lastEventId: any(named: 'lastEventId'),
          ),
        ).thenAnswer(
          (_) async => createTestSubscribeAck(currentState: ackSnapshot),
        );
      }

      /// 创建容器 + 初始化 auth + 启动 monitor + 等待就绪
      Future<ProviderSubscription<AsyncValue<ExecutionMonitorState>>>
      startMonitor() async {
        container = createContainer();
        await ensureAuthReady(container);

        final sub = container.listen(
          executionMonitorProvider('exec-1'),
          (_, __) {},
        );
        await container.read(executionMonitorProvider('exec-1').future);
        return sub;
      }

      test('execution.status.changed → 更新快照状态', () async {
        final statusController =
            StreamController<ExecutionEventEnvelope>.broadcast();
        when(
          () => mockSocket.executionStatusChanged,
        ).thenAnswer((_) => statusController.stream);

        await setupRunningExecution();
        final sub = await startMonitor();

        // 发射状态变更事件
        statusController.add(
          createTestEventEnvelope(
            eventId: 11,
            event: 'execution.status.changed',
            data: {
              'execution_id': 'exec-1',
              'status': 'running',
              'completed_steps': 2,
              'total_steps': 3,
            },
          ),
        );

        await Future<void>.delayed(const Duration(milliseconds: 50));

        final state = container.read(executionMonitorProvider('exec-1')).value;

        expect(state, isA<ExecutionMonitorConnected>());
        final connected = state as ExecutionMonitorConnected;
        expect(connected.snapshot.completedSteps, 2);

        sub.close();
        await statusController.close();
      });

      test('execution.status.changed 到终态 → Disconnected', () async {
        final statusController =
            StreamController<ExecutionEventEnvelope>.broadcast();
        when(
          () => mockSocket.executionStatusChanged,
        ).thenAnswer((_) => statusController.stream);

        await setupRunningExecution();
        final sub = await startMonitor();

        // 发射终态事件
        statusController.add(
          createTestEventEnvelope(
            eventId: 11,
            event: 'execution.status.changed',
            data: {
              'execution_id': 'exec-1',
              'status': 'completed',
              'completed_steps': 3,
              'total_steps': 3,
            },
          ),
        );

        await Future<void>.delayed(const Duration(milliseconds: 50));

        final state = container.read(executionMonitorProvider('exec-1')).value;

        expect(state, isA<ExecutionMonitorDisconnected>());
        final disconnected = state as ExecutionMonitorDisconnected;
        expect(disconnected.lastSnapshot?.status, 'completed');

        // Socket 应该被释放
        verify(() => mockSocket.dispose()).called(1);

        sub.close();
        await statusController.close();
      });

      test('execution.node.status-changed → 更新步骤状态', () async {
        final nodeController =
            StreamController<ExecutionEventEnvelope>.broadcast();
        when(
          () => mockSocket.nodeStatusChanged,
        ).thenAnswer((_) => nodeController.stream);

        await setupRunningExecution();
        final sub = await startMonitor();

        // 发射节点状态变更
        nodeController.add(
          createTestEventEnvelope(
            eventId: 11,
            event: 'execution.node.status-changed',
            data: {
              'step_id': 'step-2',
              'node_id': 'node-2',
              'from': 'running',
              'to': 'completed',
            },
          ),
        );

        await Future<void>.delayed(const Duration(milliseconds: 50));

        final state = container.read(executionMonitorProvider('exec-1')).value;

        expect(state, isA<ExecutionMonitorConnected>());
        final connected = state as ExecutionMonitorConnected;
        final step2 = connected.snapshot.steps.firstWhere(
          (s) => s.stepId == 'step-2',
        );
        expect(step2.status, 'completed');

        sub.close();
        await nodeController.close();
      });

      test('execution.state.snapshot → 替换全量快照', () async {
        final snapshotController =
            StreamController<ExecutionStateSnapshot>.broadcast();
        when(
          () => mockSocket.stateSnapshot,
        ).thenAnswer((_) => snapshotController.stream);

        await setupRunningExecution();
        final sub = await startMonitor();

        // 发射全量快照
        final newSnapshot = createTestStateSnapshot(
          executionId: 'exec-1',
          status: 'running',
          completedSteps: 2,
          totalSteps: 3,
          lastEventId: 20,
        );
        snapshotController.add(newSnapshot);

        await Future<void>.delayed(const Duration(milliseconds: 50));

        final state = container.read(executionMonitorProvider('exec-1')).value;

        expect(state, isA<ExecutionMonitorConnected>());
        final connected = state as ExecutionMonitorConnected;
        expect(connected.snapshot.completedSteps, 2);

        sub.close();
        await snapshotController.close();
      });

      test('终态快照 → Disconnected', () async {
        final snapshotController =
            StreamController<ExecutionStateSnapshot>.broadcast();
        when(
          () => mockSocket.stateSnapshot,
        ).thenAnswer((_) => snapshotController.stream);

        await setupRunningExecution();
        final sub = await startMonitor();

        // 发射终态快照
        snapshotController.add(
          createTestStateSnapshot(executionId: 'exec-1', status: 'failed'),
        );

        await Future<void>.delayed(const Duration(milliseconds: 50));

        final state = container.read(executionMonitorProvider('exec-1')).value;

        expect(state, isA<ExecutionMonitorDisconnected>());

        sub.close();
        await snapshotController.close();
      });
    });

    group('断连与重连', () {
      Future<void> setupRunningExecution() async {
        final execution = createTestExecution(
          id: 'exec-1',
          status: 'running',
          totalSteps: 3,
          completedSteps: 1,
        );
        when(
          () => mockApi.getExecution('exec-1'),
        ).thenAnswer((_) async => execution);

        final ackSnapshot = createTestStateSnapshot(
          executionId: 'exec-1',
          status: 'running',
          lastEventId: 10,
        );
        when(
          () => mockSocket.subscribe(
            executionId: any(named: 'executionId'),
            lastEventId: any(named: 'lastEventId'),
          ),
        ).thenAnswer(
          (_) async => createTestSubscribeAck(currentState: ackSnapshot),
        );
      }

      test('WS 断连（transport error）→ 降级到 Polling', () async {
        final disconnectController = StreamController<String>.broadcast();
        when(
          () => mockSocket.onDisconnected,
        ).thenAnswer((_) => disconnectController.stream);

        await setupRunningExecution();

        container = createContainer();
        await ensureAuthReady(container);

        final sub = container.listen(
          executionMonitorProvider('exec-1'),
          (_, __) {},
        );
        await container.read(executionMonitorProvider('exec-1').future);

        // 模拟 transport 断连
        disconnectController.add('transport close');
        await Future<void>.delayed(const Duration(milliseconds: 50));

        final state = container.read(executionMonitorProvider('exec-1')).value;

        expect(state, isA<ExecutionMonitorPolling>());
        final polling = state as ExecutionMonitorPolling;
        expect(polling.connectionMode, ConnectionMode.reconnecting);

        sub.close();
        await disconnectController.close();
      });

      test('服务端主动断连（认证失败）→ Error 状态', () async {
        final disconnectController = StreamController<String>.broadcast();
        when(
          () => mockSocket.onDisconnected,
        ).thenAnswer((_) => disconnectController.stream);

        await setupRunningExecution();

        container = createContainer();
        await ensureAuthReady(container);

        final sub = container.listen(
          executionMonitorProvider('exec-1'),
          (_, __) {},
        );
        await container.read(executionMonitorProvider('exec-1').future);

        // 模拟服务端主动断连
        disconnectController.add('io server disconnect');
        await Future<void>.delayed(const Duration(milliseconds: 50));

        final state = container.read(executionMonitorProvider('exec-1')).value;

        expect(state, isA<ExecutionMonitorError>());
        final error = state as ExecutionMonitorError;
        expect(error.message, contains('authentication failed'));

        sub.close();
        await disconnectController.close();
      });

      test('重连成功 → 回到 Connected + re-subscribe with lastEventId', () async {
        final disconnectController = StreamController<String>.broadcast();
        final reconnectController = StreamController<void>.broadcast();
        when(
          () => mockSocket.onDisconnected,
        ).thenAnswer((_) => disconnectController.stream);
        when(
          () => mockSocket.onReconnected,
        ).thenAnswer((_) => reconnectController.stream);

        await setupRunningExecution();

        container = createContainer();
        await ensureAuthReady(container);

        final sub = container.listen(
          executionMonitorProvider('exec-1'),
          (_, __) {},
        );
        await container.read(executionMonitorProvider('exec-1').future);

        // 先断连
        disconnectController.add('transport close');
        await Future<void>.delayed(const Duration(milliseconds: 50));

        // 再重连 — 配置新的 ACK
        final reconnectAck = createTestSubscribeAck(
          currentState: createTestStateSnapshot(
            executionId: 'exec-1',
            status: 'running',
            completedSteps: 2,
            lastEventId: 15,
          ),
        );
        when(
          () => mockSocket.subscribe(
            executionId: any(named: 'executionId'),
            lastEventId: any(named: 'lastEventId'),
          ),
        ).thenAnswer((_) async => reconnectAck);

        reconnectController.add(null);
        await Future<void>.delayed(const Duration(milliseconds: 50));

        final state = container.read(executionMonitorProvider('exec-1')).value;

        expect(state, isA<ExecutionMonitorConnected>());
        final connected = state as ExecutionMonitorConnected;
        expect(connected.snapshot.completedSteps, 2);

        // 验证 re-subscribe 被调用（带 lastEventId）
        verify(
          () => mockSocket.subscribe(
            executionId: 'exec-1',
            lastEventId: 10, // 初始 ACK 的 lastEventId
          ),
        ).called(1);

        sub.close();
        await disconnectController.close();
        await reconnectController.close();
      });

      test('重连 ACK 快照会保留已知节点元数据', () async {
        final disconnectController = StreamController<String>.broadcast();
        final reconnectController = StreamController<void>.broadcast();
        when(
          () => mockSocket.onDisconnected,
        ).thenAnswer((_) => disconnectController.stream);
        when(
          () => mockSocket.onReconnected,
        ).thenAnswer((_) => reconnectController.stream);

        final execution = createTestExecution(
          id: 'exec-1',
          status: 'running',
          definitionSnapshot: {
            'nodes': [
              {
                'id': 'node-1',
                'type': 'llm-agent',
                'data': {'label': 'Email Agent', 'nodeType': 'agent'},
              },
            ],
          },
          steps: [
            createTestExecutionStep(
              id: 'step-1',
              executionId: 'exec-1',
              nodeId: 'node-1',
              nodeType: 'llm-agent',
              nodeData: {'label': 'Email Agent'},
              status: 'running',
              completedAt: null,
            ),
          ],
        );
        when(
          () => mockApi.getExecution('exec-1'),
        ).thenAnswer((_) async => execution);

        final initialAck = createTestSubscribeAck(
          currentState: ExecutionStateSnapshot.fromJson({
            'execution_id': 'exec-1',
            'status': 'running',
            'completed_steps': 0,
            'total_steps': 1,
            'steps': [
              {
                'step_id': 'step-1',
                'node_id': 'node-1',
                'status': 'running',
                'started_at': '2026-01-01T10:00:00.000Z',
              },
            ],
            'snapshot_at': '2026-01-01T10:00:00.000Z',
            'last_event_id': 10,
          }),
        );

        final reconnectAck = createTestSubscribeAck(
          currentState: ExecutionStateSnapshot.fromJson({
            'execution_id': 'exec-1',
            'status': 'running',
            'completed_steps': 1,
            'total_steps': 1,
            'steps': [
              {
                'step_id': 'step-1',
                'node_id': 'node-1',
                'status': 'completed',
                'started_at': '2026-01-01T10:00:00.000Z',
                'completed_at': '2026-01-01T10:01:00.000Z',
              },
            ],
            'snapshot_at': '2026-01-01T10:01:00.000Z',
            'last_event_id': 15,
          }),
        );

        when(
          () => mockSocket.subscribe(
            executionId: any(named: 'executionId'),
            lastEventId: any(named: 'lastEventId'),
          ),
        ).thenAnswer((invocation) async {
          final lastEventId = invocation.namedArguments[#lastEventId] as int?;
          if (lastEventId == 10) {
            return reconnectAck;
          }
          return initialAck;
        });

        container = createContainer();
        await ensureAuthReady(container);

        final sub = container.listen(
          executionMonitorProvider('exec-1'),
          (_, __) {},
        );
        await container.read(executionMonitorProvider('exec-1').future);

        disconnectController.add('transport close');
        await Future<void>.delayed(const Duration(milliseconds: 50));

        reconnectController.add(null);
        await Future<void>.delayed(const Duration(milliseconds: 50));

        final state = container.read(executionMonitorProvider('exec-1')).value;

        expect(state, isA<ExecutionMonitorConnected>());
        final connected = state as ExecutionMonitorConnected;
        expect(connected.snapshot.completedSteps, 1);
        expect(connected.snapshot.steps.first.nodeName, 'Email Agent');
        expect(connected.snapshot.steps.first.nodeType, 'agent');

        verify(
          () => mockSocket.subscribe(executionId: 'exec-1', lastEventId: 10),
        ).called(1);

        sub.close();
        await disconnectController.close();
        await reconnectController.close();
      });
    });

    group('subscribe ACK 处理', () {
      test('subscribe ACK 带 currentState → 更新状态', () async {
        final execution = createTestExecution(id: 'exec-1', status: 'running');
        when(
          () => mockApi.getExecution('exec-1'),
        ).thenAnswer((_) async => execution);

        final ackSnapshot = createTestStateSnapshot(
          executionId: 'exec-1',
          status: 'running',
          completedSteps: 2,
          totalSteps: 5,
          lastEventId: 42,
        );
        when(
          () => mockSocket.subscribe(
            executionId: any(named: 'executionId'),
            lastEventId: any(named: 'lastEventId'),
          ),
        ).thenAnswer(
          (_) async => createTestSubscribeAck(currentState: ackSnapshot),
        );

        container = createContainer();
        await ensureAuthReady(container);

        final sub = container.listen(
          executionMonitorProvider('exec-1'),
          (_, __) {},
        );
        await container.read(executionMonitorProvider('exec-1').future);

        final state = container.read(executionMonitorProvider('exec-1')).value;

        expect(state, isA<ExecutionMonitorConnected>());
        final connected = state as ExecutionMonitorConnected;
        // 应该使用 ACK 的快照而非初始 REST 数据
        expect(connected.snapshot.completedSteps, 2);
        expect(connected.snapshot.totalSteps, 5);

        sub.close();
      });

      test('subscribe ACK 快照会保留 REST detail 的节点元数据', () async {
        final execution = createTestExecution(
          id: 'exec-1',
          status: 'running',
          definitionSnapshot: {
            'nodes': [
              {
                'id': 'node-1',
                'type': 'llm-agent',
                'data': {'label': 'Email Agent', 'nodeType': 'agent'},
              },
            ],
          },
          steps: [
            createTestExecutionStep(
              id: 'step-1',
              executionId: 'exec-1',
              nodeId: 'node-1',
              nodeType: 'llm-agent',
              nodeData: {'label': 'Email Agent'},
              status: 'running',
              completedAt: null,
            ),
          ],
        );
        when(
          () => mockApi.getExecution('exec-1'),
        ).thenAnswer((_) async => execution);

        final ackSnapshot = ExecutionStateSnapshot.fromJson({
          'execution_id': 'exec-1',
          'status': 'running',
          'completed_steps': 0,
          'total_steps': 1,
          'steps': [
            {
              'step_id': 'step-1',
              'node_id': 'node-1',
              'status': 'running',
              'started_at': '2026-01-01T10:00:00.000Z',
            },
          ],
          'snapshot_at': '2026-01-01T10:00:00.000Z',
          'last_event_id': 42,
        });
        when(
          () => mockSocket.subscribe(
            executionId: any(named: 'executionId'),
            lastEventId: any(named: 'lastEventId'),
          ),
        ).thenAnswer(
          (_) async => createTestSubscribeAck(currentState: ackSnapshot),
        );

        container = createContainer();
        await ensureAuthReady(container);

        final sub = container.listen(
          executionMonitorProvider('exec-1'),
          (_, __) {},
        );
        await container.read(executionMonitorProvider('exec-1').future);

        final state = container.read(executionMonitorProvider('exec-1')).value;

        expect(state, isA<ExecutionMonitorConnected>());
        final connected = state as ExecutionMonitorConnected;
        expect(connected.snapshot.steps.first.nodeName, 'Email Agent');
        expect(connected.snapshot.steps.first.nodeType, 'agent');

        sub.close();
      });

      test('subscribe ACK 错误 → 降级到 Polling', () async {
        final execution = createTestExecution(id: 'exec-1', status: 'running');
        when(
          () => mockApi.getExecution('exec-1'),
        ).thenAnswer((_) async => execution);

        when(
          () => mockSocket.subscribe(
            executionId: any(named: 'executionId'),
            lastEventId: any(named: 'lastEventId'),
          ),
        ).thenAnswer(
          (_) async => const SubscribeAck(status: 'error', error: 'FORBIDDEN'),
        );

        container = createContainer();
        await ensureAuthReady(container);

        final sub = container.listen(
          executionMonitorProvider('exec-1'),
          (_, __) {},
        );
        await container.read(executionMonitorProvider('exec-1').future);

        final state = container.read(executionMonitorProvider('exec-1')).value;

        // subscribe 失败会抛异常，走 catch → Polling
        expect(state, isA<ExecutionMonitorPolling>());

        sub.close();
      });
    });

    group('ConnectionMode', () {
      test('label 返回正确字符串', () {
        expect(ConnectionMode.websocket.label, 'WebSocket');
        expect(ConnectionMode.polling.label, 'Polling');
        expect(ConnectionMode.reconnecting.label, 'Reconnecting');
      });
    });

    group('状态类', () {
      test('ExecutionMonitorLoading 可创建', () {
        const state = ExecutionMonitorLoading();
        expect(state, isA<ExecutionMonitorState>());
      });

      test('ExecutionMonitorConnected copyWith 正常工作', () {
        final snapshot = createTestStateSnapshot();
        final state = ExecutionMonitorConnected(
          snapshot: snapshot,
          connectionMode: ConnectionMode.websocket,
        );

        final updated = state.copyWith(
          connectionMode: ConnectionMode.reconnecting,
        );

        expect(updated.connectionMode, ConnectionMode.reconnecting);
        expect(updated.snapshot.executionId, snapshot.executionId);
      });

      test('ExecutionMonitorPolling copyWith 正常工作', () {
        final snapshot = createTestStateSnapshot();
        final state = ExecutionMonitorPolling(
          snapshot: snapshot,
          connectionMode: ConnectionMode.polling,
        );

        final newSnapshot = createTestStateSnapshot(completedSteps: 2);
        final updated = state.copyWith(snapshot: newSnapshot);

        expect(updated.snapshot.completedSteps, 2);
        expect(updated.connectionMode, ConnectionMode.polling);
      });

      test('ExecutionMonitorError 包含消息和 executionId', () {
        const state = ExecutionMonitorError(
          message: 'test error',
          executionId: 'exec-1',
        );

        expect(state.message, 'test error');
        expect(state.executionId, 'exec-1');
      });

      test('ExecutionMonitorDisconnected 可持有最终快照', () {
        final snapshot = createTestStateSnapshot(status: 'completed');
        final state = ExecutionMonitorDisconnected(lastSnapshot: snapshot);

        expect(state.lastSnapshot?.status, 'completed');
      });

      test('ExecutionMonitorDisconnected 可无快照', () {
        const state = ExecutionMonitorDisconnected();
        expect(state.lastSnapshot, isNull);
      });
    });

    group('dispose 清理', () {
      test('dispose container → 清理 socket 和 timer', () async {
        final execution = createTestExecution(id: 'exec-1', status: 'running');
        when(
          () => mockApi.getExecution('exec-1'),
        ).thenAnswer((_) async => execution);

        when(
          () => mockSocket.subscribe(
            executionId: any(named: 'executionId'),
            lastEventId: any(named: 'lastEventId'),
          ),
        ).thenAnswer((_) async => createTestSubscribeAck());

        container = createContainer();
        await ensureAuthReady(container);

        final sub = container.listen(
          executionMonitorProvider('exec-1'),
          (_, __) {},
        );
        await container.read(executionMonitorProvider('exec-1').future);

        // Dispose container 应触发清理
        sub.close();
        container.dispose();

        verify(() => mockSocket.dispose()).called(1);

        // 重建 container 以避免 tearDown 重复 dispose
        container = createContainer();
      });
    });
  });
}

/// 用于测试的 Fake AuthNotifier
class _FakeAuthNotifier extends AuthNotifier {
  _FakeAuthNotifier(this._fixedState);
  final AuthState _fixedState;

  @override
  Future<AuthState> build() async => _fixedState;
}
