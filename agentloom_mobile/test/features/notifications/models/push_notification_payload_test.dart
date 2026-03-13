import 'package:agentloom_mobile/features/notifications/models/push_notification_payload.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('PushNotificationPayload.fromFcmData', () {
    test('all fields 都能正确解析', () {
      final payload = PushNotificationPayload.fromFcmData({
        'type': 'execution_completed',
        'executionId': 'exec-1',
        'workflowId': 'wf-1',
        'nodeId': 'node-1',
        'notificationId': 'notif-1',
      });

      expect(payload.type, 'execution_completed');
      expect(payload.executionId, 'exec-1');
      expect(payload.workflowId, 'wf-1');
      expect(payload.nodeId, 'node-1');
      expect(payload.notificationId, 'notif-1');
    });

    test('execution_completed 类型可解析 executionId', () {
      final payload = PushNotificationPayload.fromFcmData({
        'type': 'execution_completed',
        'executionId': 'exec-200',
      });

      expect(payload.type, 'execution_completed');
      expect(payload.executionId, 'exec-200');
      expect(payload.nodeId, isNull);
    });

    test('intervention_required 类型可解析 nodeId', () {
      final payload = PushNotificationPayload.fromFcmData({
        'type': 'intervention_required',
        'executionId': 'exec-300',
        'nodeId': 'node-review',
      });

      expect(payload.type, 'intervention_required');
      expect(payload.executionId, 'exec-300');
      expect(payload.nodeId, 'node-review');
    });

    test('缺失 type 时默认 unknown', () {
      final payload = PushNotificationPayload.fromFcmData({
        'executionId': 'exec-400',
      });

      expect(payload.type, 'unknown');
      expect(payload.executionId, 'exec-400');
    });

    test('最小数据仅包含 type', () {
      final payload = PushNotificationPayload.fromFcmData({
        'type': 'execution_failed',
      });

      expect(payload.type, 'execution_failed');
      expect(payload.executionId, isNull);
      expect(payload.workflowId, isNull);
      expect(payload.nodeId, isNull);
      expect(payload.notificationId, isNull);
    });
  });

  test('fromJson/toJson 可往返', () {
    const json = {
      'type': 'intervention_required',
      'execution_id': 'exec-500',
      'workflow_id': 'wf-500',
      'node_id': 'node-500',
      'notification_id': 'notif-500',
    };

    final payload = PushNotificationPayload.fromJson(json);

    expect(payload.type, 'intervention_required');
    expect(payload.executionId, 'exec-500');
    expect(payload.workflowId, 'wf-500');
    expect(payload.nodeId, 'node-500');
    expect(payload.notificationId, 'notif-500');
    expect(payload.toJson(), json);
  });
}
