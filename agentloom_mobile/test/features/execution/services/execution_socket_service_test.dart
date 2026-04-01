import 'dart:async';
import 'package:agentloom_mobile/features/execution/models/execution_event.dart';
import 'package:agentloom_mobile/features/execution/models/execution_state.dart';
import 'package:agentloom_mobile/features/execution/models/execution_status.dart';
import 'package:agentloom_mobile/features/execution/models/subscribe_ack.dart';
import 'package:agentloom_mobile/features/execution/services/execution_socket_service.dart'
    show
        ExecutionSocketService,
        coerceSocketJsonMap,
        executionSocketServiceProvider,
        resolveExecutionSocketUrl;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('ExecutionSocketService', () {
    late ExecutionSocketService service;

    setUp(() {
      service = ExecutionSocketService(
        baseUrl: 'http://localhost:3000',
        authToken: 'test-token',
        ackTimeoutMs: 1000,
      );
    });

    tearDown(() {
      service.dispose();
    });

    test('初始状态 isConnected 为 false', () {
      expect(service.isConnected, isFalse);
    });

    test('connect() 后重复调用不会重新创建 socket', () {
      // 首次 connect 创建 socket（连接到不存在的服务器没关系）
      service.connect();
      // 不应抛异常
      service.connect();
      // isConnected 可能为 false（因为服务器不存在），但不应崩溃
    });

    test('subscribe() 未连接时返回 NOT_CONNECTED', () async {
      final ack = await service.subscribe(executionId: 'exec-1');
      expect(ack.status, equals('error'));
      expect(ack.error, equals('NOT_CONNECTED'));
      expect(ack.isError, isTrue);
      expect(ack.isSubscribed, isFalse);
    });

    test('unsubscribe() 未连接时不会抛异常', () {
      // 不应抛异常
      service.unsubscribe(executionId: 'exec-1');
    });

    test('dispose() 后 isConnected 为 false', () {
      service.connect();
      service.dispose();
      expect(service.isConnected, isFalse);
    });

    test('dispose() 关闭所有 stream', () {
      service.dispose();
      // 再次 dispose 不应抛异常
      // 注意：StreamController close 后再 add 会抛异常，
      // 但 dispose() 已将 _socket 置为 null 所以不会触发
    });

    group('Stream 类型正确', () {
      test('executionStatusChanged 是 ExecutionEventEnvelope stream', () {
        expect(
          service.executionStatusChanged,
          isA<Stream<ExecutionEventEnvelope>>(),
        );
      });

      test('nodeStatusChanged 是 ExecutionEventEnvelope stream', () {
        expect(
          service.nodeStatusChanged,
          isA<Stream<ExecutionEventEnvelope>>(),
        );
      });

      test('stepAgentEvent 是 ExecutionEventEnvelope stream', () {
        expect(service.stepAgentEvent, isA<Stream<ExecutionEventEnvelope>>());
      });

      test('stepRetrying 是 ExecutionEventEnvelope stream', () {
        expect(service.stepRetrying, isA<Stream<ExecutionEventEnvelope>>());
      });

      test('outputChunk 是 ExecutionEventEnvelope stream', () {
        expect(service.outputChunk, isA<Stream<ExecutionEventEnvelope>>());
      });

      test('interventionRequired 是 ExecutionEventEnvelope stream', () {
        expect(
          service.interventionRequired,
          isA<Stream<ExecutionEventEnvelope>>(),
        );
      });

      test('interventionResolved 是 ExecutionEventEnvelope stream', () {
        expect(
          service.interventionResolved,
          isA<Stream<ExecutionEventEnvelope>>(),
        );
      });

      test('toolCallStatusChanged 是 ExecutionEventEnvelope stream', () {
        expect(
          service.toolCallStatusChanged,
          isA<Stream<ExecutionEventEnvelope>>(),
        );
      });

      test('toolPermissionRequired 是 ExecutionEventEnvelope stream', () {
        expect(
          service.toolPermissionRequired,
          isA<Stream<ExecutionEventEnvelope>>(),
        );
      });

      test('toolPermissionResolved 是 ExecutionEventEnvelope stream', () {
        expect(
          service.toolPermissionResolved,
          isA<Stream<ExecutionEventEnvelope>>(),
        );
      });

      test('stateSnapshot 是 ExecutionStateSnapshot stream', () {
        expect(service.stateSnapshot, isA<Stream<ExecutionStateSnapshot>>());
      });

      test('onConnected 是 void stream', () {
        expect(service.onConnected, isA<Stream<void>>());
      });

      test('onDisconnected 是 String stream', () {
        expect(service.onDisconnected, isA<Stream<String>>());
      });

      test('onReconnected 是 void stream', () {
        expect(service.onReconnected, isA<Stream<void>>());
      });

      test('onConnectError 是 dynamic stream', () {
        expect(service.onConnectError, isA<Stream<dynamic>>());
      });
    });
  });

  group('ExecutionSocketService 事件解析', () {
    // 测试事件模型的序列化/反序列化（间接测试事件处理逻辑）
    test('ExecutionEventEnvelope 从服务端 JSON 正确反序列化', () {
      final json = {
        'event_id': 42,
        'event': 'execution.status.changed',
        'timestamp': '2026-01-01T00:00:00.000Z',
        'execution_id': 'exec-1',
        'tenant_id': 'tenant-1',
        'data': {
          'execution_id': 'exec-1',
          'status': 'running',
          'completed_steps': 1,
          'total_steps': 5,
        },
      };

      final envelope = ExecutionEventEnvelope.fromJson(json);
      expect(envelope.eventId, equals(42));
      expect(envelope.event, equals('execution.status.changed'));
      expect(envelope.executionId, equals('exec-1'));
      expect(envelope.data['status'], equals('running'));

      // 可以进一步解析 data 为具体类型
      final statusData = ExecutionStatusChangedData.fromJson(
        envelope.data.cast<String, dynamic>(),
      );
      expect(statusData.status, equals('running'));
      expect(statusData.completedSteps, equals(1));
      expect(statusData.totalSteps, equals(5));
    });

    test('NodeStatusChangedData 从服务端 JSON 正确反序列化', () {
      final json = {
        'step_id': 'step-1',
        'node_id': 'node-1',
        'from': 'pending',
        'to': 'running',
      };

      final data = NodeStatusChangedData.fromJson(json);
      expect(data.stepId, equals('step-1'));
      expect(data.nodeId, equals('node-1'));
      expect(data.from, equals('pending'));
      expect(data.to, equals('running'));
    });

    test('ExecutionStateSnapshot 从服务端 JSON 正确反序列化', () {
      final json = {
        'execution_id': 'exec-1',
        'status': 'running',
        'completed_steps': 2,
        'total_steps': 5,
        'steps': [
          {
            'step_id': 'step-1',
            'node_id': 'node-1',
            'status': 'completed',
            'started_at': '2026-01-01T10:00:00.000Z',
            'completed_at': '2026-01-01T10:01:00.000Z',
          },
          {
            'step_id': 'step-2',
            'node_id': 'node-2',
            'status': 'running',
            'started_at': '2026-01-01T10:01:00.000Z',
          },
        ],
        'snapshot_at': '2026-01-01T10:01:30.000Z',
        'last_event_id': 15,
      };

      final snapshot = ExecutionStateSnapshot.fromJson(json);
      expect(snapshot.executionId, equals('exec-1'));
      expect(snapshot.status, equals('running'));
      expect(snapshot.completedSteps, equals(2));
      expect(snapshot.totalSteps, equals(5));
      expect(snapshot.steps, hasLength(2));
      expect(snapshot.steps[0].status, equals('completed'));
      expect(snapshot.steps[1].status, equals('running'));
      expect(snapshot.lastEventId, equals(15));

      // Extension 方法
      expect(snapshot.executionStatus, equals(ExecutionStatus.running));
      expect(snapshot.stepStatusOf('step-1'), equals(StepStatus.completed));
      expect(snapshot.stepStatusOf('step-2'), equals(StepStatus.running));
      expect(snapshot.stepStatusOf('nonexistent'), isNull);
    });

    test('SubscribeAck subscribed 响应正确反序列化', () {
      final json = {
        'status': 'subscribed',
        'current_state': {
          'execution_id': 'exec-1',
          'status': 'running',
          'completed_steps': 0,
          'total_steps': 3,
          'steps': [],
          'snapshot_at': '2026-01-01T10:00:00.000Z',
        },
      };

      final ack = SubscribeAck.fromJson(json);
      expect(ack.isSubscribed, isTrue);
      expect(ack.isError, isFalse);
      expect(ack.currentState, isNotNull);
      expect(ack.currentState!.executionId, equals('exec-1'));
    });

    test('SubscribeAck error 响应正确反序列化', () {
      final json = {'status': 'error', 'error': 'FORBIDDEN'};

      final ack = SubscribeAck.fromJson(json);
      expect(ack.isSubscribed, isFalse);
      expect(ack.isError, isTrue);
      expect(ack.error, equals('FORBIDDEN'));
    });
  });

  group('resolveExecutionSocketUrl', () {
    test('strips /api/v1 suffix before appending /execution', () {
      expect(
        resolveExecutionSocketUrl('http://localhost:3000/api/v1'),
        'http://localhost:3000/execution',
      );
    });

    test('strips /api suffix before appending /execution', () {
      expect(
        resolveExecutionSocketUrl('https://example.com/api'),
        'https://example.com/execution',
      );
    });

    test('preserves base host when already root path', () {
      expect(
        resolveExecutionSocketUrl('https://example.com'),
        'https://example.com/execution',
      );
    });
  });

  group('coerceSocketJsonMap', () {
    test('converts Map<Object?, Object?> into Map<String, dynamic>', () {
      final payload = coerceSocketJsonMap(
        {
              'status': 'subscribed',
              'current_state': {'execution_id': 'exec-1'},
            }
            as Map<Object?, Object?>,
      );

      expect(payload, isNotNull);
      expect(payload!['status'], 'subscribed');
      expect(payload['current_state'], isA<Map<Object?, Object?>>());
    });

    test('returns null for non-map payloads', () {
      expect(coerceSocketJsonMap('invalid'), isNull);
      expect(coerceSocketJsonMap(42), isNull);
    });
  });

  group('executionSocketServiceProvider', () {
    test('provider 创建服务实例', () {
      final container = ProviderContainer();
      addTearDown(container.dispose);

      final service = container.read(
        executionSocketServiceProvider((
          baseUrl: 'http://localhost:3000',
          authToken: 'test-token',
        )),
      );
      expect(service, isA<ExecutionSocketService>());
      expect(service.isConnected, isFalse);
    });

    test('provider dispose 时清理服务', () {
      final container = ProviderContainer();

      final service = container.read(
        executionSocketServiceProvider((
          baseUrl: 'http://localhost:3000',
          authToken: 'test-token',
        )),
      );

      // connect 创建 socket
      service.connect();

      // dispose 不应抛异常（会调用 service.dispose()）
      container.dispose();

      // service 已被清理
      expect(service.isConnected, isFalse);
    });

    test('不同参数创建不同服务实例', () {
      final container = ProviderContainer();
      addTearDown(container.dispose);

      final service1 = container.read(
        executionSocketServiceProvider((
          baseUrl: 'http://localhost:3000',
          authToken: 'token-1',
        )),
      );
      final service2 = container.read(
        executionSocketServiceProvider((
          baseUrl: 'http://localhost:3000',
          authToken: 'token-2',
        )),
      );
      expect(service1, isNot(same(service2)));
    });

    test('相同参数返回同一服务实例', () {
      final container = ProviderContainer();
      addTearDown(container.dispose);

      const params = (baseUrl: 'http://localhost:3000', authToken: 'token-1');
      final service1 = container.read(executionSocketServiceProvider(params));
      final service2 = container.read(executionSocketServiceProvider(params));
      expect(service1, same(service2));
    });
  });
}
