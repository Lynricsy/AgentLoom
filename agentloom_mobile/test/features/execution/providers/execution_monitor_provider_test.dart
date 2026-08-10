import 'dart:async';

import 'package:agentloom_mobile/config/env.dart';
import 'package:agentloom_mobile/features/auth/models/auth_state.dart';
import 'package:agentloom_mobile/features/auth/models/auth_tokens.dart';
import 'package:agentloom_mobile/features/auth/models/login_user.dart';
import 'package:agentloom_mobile/features/auth/providers/auth_provider.dart';
import 'package:agentloom_mobile/features/agents/models/conversation_message_dto.dart';
import 'package:agentloom_mobile/features/execution/models/execution_event.dart';
import 'package:agentloom_mobile/features/execution/models/execution_state.dart';
import 'package:agentloom_mobile/features/execution/models/subscribe_ack.dart';
import 'package:agentloom_mobile/features/execution/providers/execution_monitor_provider.dart';
import 'package:agentloom_mobile/features/execution/providers/execution_monitor_state.dart';
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
      () => mockSocket.stepAgentEvent,
    ).thenAnswer((_) => const Stream.empty());
    when(() => mockSocket.stepRetrying).thenAnswer((_) => const Stream.empty());
    when(() => mockSocket.outputChunk).thenAnswer((_) => const Stream.empty());
    when(
      () => mockSocket.interventionRequired,
    ).thenAnswer((_) => const Stream.empty());
    when(
      () => mockSocket.interventionResolved,
    ).thenAnswer((_) => const Stream.empty());
    when(
      () => mockSocket.toolCallStatusChanged,
    ).thenAnswer((_) => const Stream.empty());
    when(
      () => mockSocket.toolPermissionRequired,
    ).thenAnswer((_) => const Stream.empty());
    when(
      () => mockSocket.toolPermissionResolved,
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

      test('compound 内部节点会继承父容器名称作为展示前缀', () async {
        final execution = createTestExecution(
          id: 'exec-1',
          status: 'completed',
          definitionSnapshot: {
            'nodes': [
              {
                'id': 'loop-1',
                'type': 'loop',
                'data': {'label': '文章循环', 'nodeType': 'loop'},
              },
              {
                'id': 'result-1',
                'type': 'result',
                'parentId': 'loop-1',
                'data': {'label': '输出摘要', 'nodeType': 'result'},
              },
            ],
          },
          steps: [
            createTestExecutionStep(
              id: 'step-1',
              executionId: 'exec-1',
              nodeId: 'result-1',
              nodeType: 'result',
              nodeData: {'label': '输出摘要', 'nodeType': 'result'},
              status: 'completed',
            ),
          ],
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
        final disconnected = state as ExecutionMonitorDisconnected;
        expect(
          disconnected.lastSnapshot?.steps.first.nodeName,
          '文章循环 / 输出摘要',
        );

        sub.close();
      });

      test(
        'REST 终态 execution 会从 checkpointData 恢复 agent 瀑布流 runtime',
        () async {
          final execution = createTestExecution(
            id: 'exec-1',
            status: 'completed',
            totalSteps: 1,
            completedSteps: 1,
            definitionSnapshot: {
              'nodes': [
                {
                  'id': 'node-agent-1',
                  'type': 'agent',
                  'data': {'label': 'Agent Node', 'nodeType': 'agent'},
                },
              ],
            },
            steps: [
              createTestExecutionStep(
                id: 'step-agent-1',
                executionId: 'exec-1',
                nodeId: 'node-agent-1',
                nodeType: 'agent',
                nodeData: {'label': 'Agent Node', 'nodeType': 'agent'},
                status: 'completed',
                checkpointData: {
                  'partialContent': '先查\n再总结',
                  'stopReason': 'end_turn',
                  'decision': {'rationale': '先判断资料可信度'},
                  'toolCalls': [
                    {
                      'id': 'tool-1',
                      'tool': 'read_file',
                      'status': 'completed',
                      'result': {
                        'content': [
                          {'type': 'text', 'text': 'alpha'},
                        ],
                      },
                    },
                  ],
                  'segments': [
                    {'type': 'text', 'content': '先查\n'},
                    {'type': 'tool_call', 'toolCallId': 'tool-1'},
                    {'type': 'text', 'content': '再总结'},
                  ],
                },
                result: {'content': '先查\n再总结'},
              ),
            ],
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

          final state = container
              .read(executionMonitorProvider('exec-1'))
              .value;

          expect(state, isA<ExecutionMonitorDisconnected>());
          final disconnected = state as ExecutionMonitorDisconnected;
          final runtimeStep = disconnected.runtime.stepById('step-agent-1');
          expect(runtimeStep, isNotNull);
          expect(runtimeStep!.output, '先查\n再总结');
          expect(runtimeStep.stopReason, 'end_turn');
          expect(runtimeStep.toolCalls, hasLength(1));
          expect(runtimeStep.toolCalls.single.tool, 'read_file');
          expect(
            runtimeStep.toolCalls.single.status,
            ConversationToolStatus.completed,
          );
          expect(runtimeStep.segments, hasLength(4));
          expect(runtimeStep.segments[0].kind, MessageSegmentKind.text);
          expect(runtimeStep.segments[1].kind, MessageSegmentKind.toolCall);
          expect(runtimeStep.segments[1].toolCallId, 'tool-1');
          expect(runtimeStep.segments[2].content, '再总结');
          expect(runtimeStep.segments[3].kind, MessageSegmentKind.thinking);
          expect(runtimeStep.thinking, '先判断资料可信度');

          verifyNever(() => mockSocket.connect());

          sub.close();
        },
      );

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

      test('execution.status.changed 到终态时会回拉最终 REST 快照避免步骤卡在运行中', () async {
        final statusController =
            StreamController<ExecutionEventEnvelope>.broadcast();
        when(
          () => mockSocket.executionStatusChanged,
        ).thenAnswer((_) => statusController.stream);

        final initialExecution = createTestExecution(
          id: 'exec-1',
          status: 'running',
          totalSteps: 3,
          completedSteps: 2,
          steps: [
            createTestExecutionStep(id: 'step-1', status: 'completed'),
            createTestExecutionStep(
              id: 'step-2',
              status: 'running',
              completedAt: null,
            ),
            createTestExecutionStep(
              id: 'step-3',
              status: 'pending',
              startedAt: null,
              completedAt: null,
            ),
          ],
        );
        final finalExecution = createTestExecution(
          id: 'exec-1',
          status: 'completed',
          totalSteps: 3,
          completedSteps: 3,
          steps: [
            createTestExecutionStep(id: 'step-1', status: 'completed'),
            createTestExecutionStep(id: 'step-2', status: 'completed'),
            createTestExecutionStep(id: 'step-3', status: 'completed'),
          ],
        );

        final responses = [initialExecution, finalExecution];
        var responseIndex = 0;
        when(() => mockApi.getExecution('exec-1')).thenAnswer((_) async {
          final safeIndex = responseIndex < responses.length
              ? responseIndex
              : responses.length - 1;
          responseIndex += 1;
          return responses[safeIndex];
        });

        final ackSnapshot = createTestStateSnapshot(
          executionId: 'exec-1',
          status: 'running',
          completedSteps: 2,
          totalSteps: 3,
          steps: const [
            StepSnapshot(
              stepId: 'step-1',
              nodeId: 'node-1',
              nodeName: 'Node 1',
              nodeType: 'agent',
              status: 'completed',
              startedAt: '2026-01-01T10:00:00.000Z',
              completedAt: '2026-01-01T10:01:00.000Z',
            ),
            StepSnapshot(
              stepId: 'step-2',
              nodeId: 'node-2',
              nodeName: 'Node 2',
              nodeType: 'agent',
              status: 'running',
              startedAt: '2026-01-01T10:01:00.000Z',
            ),
            StepSnapshot(
              stepId: 'step-3',
              nodeId: 'node-3',
              nodeName: 'Node 3',
              nodeType: 'agent',
              status: 'pending',
            ),
          ],
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

        final sub = await startMonitor();

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

        await Future<void>.delayed(const Duration(milliseconds: 80));

        final state = container.read(executionMonitorProvider('exec-1')).value;

        expect(state, isA<ExecutionMonitorDisconnected>());
        final disconnected = state as ExecutionMonitorDisconnected;
        expect(disconnected.lastSnapshot?.status, 'completed');
        final step2 = disconnected.lastSnapshot?.steps.firstWhere(
          (step) => step.stepId == 'step-2',
        );
        expect(step2?.status, 'completed');

        verify(() => mockApi.getExecution('exec-1')).called(2);

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

      test('execution.node.output-chunk 会驱动 agent 节点的实时文本与段落流', () async {
        final outputController =
            StreamController<ExecutionEventEnvelope>.broadcast();
        when(
          () => mockSocket.outputChunk,
        ).thenAnswer((_) => outputController.stream);

        final execution = createTestExecution(
          id: 'exec-1',
          status: 'running',
          definitionSnapshot: {
            'nodes': [
              {
                'id': 'node-1',
                'type': 'llm-agent',
                'data': {'label': 'Agent Node', 'nodeType': 'agent'},
              },
            ],
          },
          steps: [
            createTestExecutionStep(
              id: 'step-1',
              executionId: 'exec-1',
              nodeId: 'node-1',
              nodeType: 'agent',
              nodeData: {'label': 'Agent Node'},
              status: 'running',
              completedAt: null,
            ),
          ],
        );
        when(
          () => mockApi.getExecution('exec-1'),
        ).thenAnswer((_) async => execution);

        final ackSnapshot = createTestStateSnapshot(
          executionId: 'exec-1',
          status: 'running',
          steps: const [
            StepSnapshot(
              stepId: 'step-1',
              nodeId: 'node-1',
              nodeName: 'Agent Node',
              nodeType: 'agent',
              status: 'running',
              startedAt: '2026-01-01T10:00:00.000Z',
              completedAt: null,
            ),
          ],
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

        final sub = await startMonitor();

        outputController.add(
          createTestEventEnvelope(
            eventId: 11,
            event: 'execution.node.output-chunk',
            executionId: 'exec-1',
            data: {'stepId': 'step-1', 'chunk': '实时输出', 'index': 1},
          ),
        );

        await Future<void>.delayed(const Duration(milliseconds: 50));

        final state = container.read(executionMonitorProvider('exec-1')).value;

        expect(state, isA<ExecutionMonitorConnected>());
        final connected = state as ExecutionMonitorConnected;
        final runtimeStep = connected.runtime.stepById('step-1');
        expect(runtimeStep, isNotNull);
        expect(runtimeStep!.output, '实时输出');
        expect(runtimeStep.segments, hasLength(1));
        expect(runtimeStep.segments.first.kind, MessageSegmentKind.text);
        expect(runtimeStep.segments.first.content, '实时输出');

        sub.close();
        await outputController.close();
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

      test('WebSocket 已连接时也会通过 REST 对账收敛到终态', () async {
        final initialExecution = createTestExecution(
          id: 'exec-1',
          status: 'running',
          totalSteps: 1,
          completedSteps: 0,
          completedAt: null,
          steps: [
            createTestExecutionStep(
              id: 'step-1',
              status: 'running',
              completedAt: null,
            ),
          ],
        );
        final finalExecution = createTestExecution(
          id: 'exec-1',
          status: 'completed',
          totalSteps: 1,
          completedSteps: 1,
          steps: [createTestExecutionStep(id: 'step-1', status: 'completed')],
        );

        var requestCount = 0;
        when(() => mockApi.getExecution('exec-1')).thenAnswer((_) async {
          requestCount += 1;
          return requestCount == 1 ? initialExecution : finalExecution;
        });

        final ackSnapshot = createTestStateSnapshot(
          executionId: 'exec-1',
          status: 'running',
          completedSteps: 0,
          totalSteps: 1,
          steps: const [
            StepSnapshot(
              stepId: 'step-1',
              nodeId: 'node-1',
              nodeName: 'Node 1',
              nodeType: 'agent',
              status: 'running',
              startedAt: '2026-01-01T10:00:00.000Z',
            ),
          ],
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

        final sub = await startMonitor();

        await Future<void>.delayed(const Duration(seconds: 6));

        final state = container.read(executionMonitorProvider('exec-1')).value;

        expect(state, isA<ExecutionMonitorDisconnected>());
        final disconnected = state as ExecutionMonitorDisconnected;
        expect(disconnected.lastSnapshot?.status, 'completed');
        expect(disconnected.lastSnapshot?.steps.single.status, 'completed');
        expect(requestCount, greaterThanOrEqualTo(2));

        sub.close();
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

      test('subscribe ACK 快照会立刻恢复 checkpointData 的工具与段落瀑布流', () async {
        final execution = createTestExecution(
          id: 'exec-1',
          status: 'running',
          totalSteps: 1,
          completedSteps: 0,
          definitionSnapshot: {
            'nodes': [
              {
                'id': 'node-1',
                'type': 'agent',
                'data': {'label': 'Agent Node', 'nodeType': 'agent'},
              },
            ],
          },
          steps: [
            createTestExecutionStep(
              id: 'step-1',
              executionId: 'exec-1',
              nodeId: 'node-1',
              nodeType: 'agent',
              nodeData: {'label': 'Agent Node', 'nodeType': 'agent'},
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
              'checkpoint_data': {
                'partial_content': '第一段第二段',
                'decision': {'rationale': '先整理上下文'},
                'tool_calls': [
                  {
                    'id': 'tool-1',
                    'tool': 'search_web',
                    'status': 'awaiting_permission',
                    'permission_request': {
                      'description': '读取外部网页',
                      'resource_paths': ['https://example.com'],
                    },
                  },
                ],
                'segments': [
                  {'type': 'text', 'content': '第一段'},
                  {'type': 'tool_call', 'tool_call_id': 'tool-1'},
                  {'type': 'text', 'content': '第二段'},
                ],
              },
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
        final runtimeStep = connected.runtime.stepById('step-1');
        expect(runtimeStep, isNotNull);
        expect(runtimeStep!.output, '第一段第二段');
        expect(runtimeStep.thinking, '先整理上下文');
        expect(runtimeStep.toolCalls, hasLength(1));
        expect(runtimeStep.toolCalls.single.tool, 'search_web');
        expect(
          runtimeStep.toolCalls.single.status,
          ConversationToolStatus.awaitingPermission,
        );
        expect(
          runtimeStep.toolCalls.single.permissionRequest?.description,
          '读取外部网页',
        );
        expect(runtimeStep.segments, hasLength(4));
        expect(runtimeStep.segments[0].content, '第一段');
        expect(runtimeStep.segments[1].toolCallId, 'tool-1');
        expect(runtimeStep.segments[2].content, '第二段');
        expect(runtimeStep.segments[3].kind, MessageSegmentKind.thinking);

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
