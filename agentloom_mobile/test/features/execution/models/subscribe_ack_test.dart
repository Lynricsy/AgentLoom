import 'package:flutter_test/flutter_test.dart';
import 'package:agentloom_mobile/features/execution/models/subscribe_ack.dart';
import 'package:agentloom_mobile/features/execution/models/execution_state.dart';

void main() {
  group('SubscribeAck', () {
    test('fromJson 解析成功订阅响应', () {
      final json = {
        'status': 'subscribed',
        'current_state': {
          'execution_id': 'exec-001',
          'status': 'running',
          'completed_steps': 2,
          'total_steps': 5,
          'steps': [
            {'step_id': 'step-1', 'node_id': 'node-a', 'status': 'completed'},
            {'step_id': 'step-2', 'node_id': 'node-b', 'status': 'running'},
          ],
          'snapshot_at': '2026-01-01T10:00:00.000Z',
          'last_event_id': 10,
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
        'current_state': null,
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

    test('toJson 输出 snake_case', () {
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
      expect(json['current_state'], isNotNull);
      expect((json['current_state'] as Map)['execution_id'], 'exec-001');
    });

    test('equality 基于值', () {
      const a = SubscribeAck(status: 'subscribed');
      const b = SubscribeAck(status: 'subscribed');
      expect(a, equals(b));
    });
  });
}
