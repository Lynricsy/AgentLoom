import 'package:flutter_test/flutter_test.dart';
import 'package:agentloom_mobile/features/execution/models/subscribe_ack.dart';
import 'package:agentloom_mobile/features/execution/models/execution_state.dart';

void main() {
  group('SubscribeAck', () {
    test('fromJson 解析成功订阅响应', () {
      final json = {
        'status': 'subscribed',
        'currentState': {
          'executionId': 'exec-001',
          'status': 'running',
          'completedSteps': 2,
          'totalSteps': 5,
          'steps': [
            {'stepId': 'step-1', 'nodeId': 'node-a', 'status': 'completed'},
            {'stepId': 'step-2', 'nodeId': 'node-b', 'status': 'running'},
          ],
          'snapshotAt': '2026-01-01T10:00:00.000Z',
          'lastEventId': 10,
        },
        'error': null,
      };
      final ack = SubscribeAck.fromJson(json);
      expect(ack.status, 'subscribed');
      expect(ack.isSubscribed, isTrue);
      expect(ack.isError, isFalse);
      expect(ack.currentState, isNotNull);
      expect(ack.currentState!.executionId, 'exec-001');
      expect(ack.currentState!.steps, hasLength(2));
      expect(ack.error, isNull);
    });

    test('fromJson 解析错误响应', () {
      final json = {
        'status': 'error',
        'currentState': null,
        'error': 'FORBIDDEN',
      };
      final ack = SubscribeAck.fromJson(json);
      expect(ack.status, 'error');
      expect(ack.isSubscribed, isFalse);
      expect(ack.isError, isTrue);
      expect(ack.currentState, isNull);
      expect(ack.error, 'FORBIDDEN');
    });

    test('fromJson 解析 NOT_FOUND 错误', () {
      final json = {'status': 'error', 'error': 'NOT_FOUND'};
      final ack = SubscribeAck.fromJson(json);
      expect(ack.isError, isTrue);
      expect(ack.error, 'NOT_FOUND');
    });

    test('toJson 输出 camelCase wire 键名', () {
      const ack = SubscribeAck(
        status: 'subscribed',
        currentState: ExecutionStateSnapshot(
          executionId: 'exec-001',
          status: 'running',
          steps: [],
        ),
      );
      final json = ack.toJson();
      expect(json['status'], 'subscribed');
      expect(json['currentState'], isNotNull);
      expect((json['currentState'] as Map)['executionId'], 'exec-001');
    });

    test('equality 基于值', () {
      const a = SubscribeAck(status: 'subscribed');
      const b = SubscribeAck(status: 'subscribed');
      expect(a, equals(b));
    });
  });
}
