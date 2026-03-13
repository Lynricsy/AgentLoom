import 'package:flutter_test/flutter_test.dart';
import 'package:agentloom_mobile/features/execution/models/execution_event.dart';

void main() {
  group('ExecutionEventEnvelope', () {
    test('fromJson 正确解析事件信封', () {
      final json = {
        'event_id': 1,
        'event': 'execution.status.changed',
        'timestamp': '2026-01-01T10:00:00.000Z',
        'execution_id': 'exec-001',
        'tenant_id': 'tenant-001',
        'data': {
          'execution_id': 'exec-001',
          'status': 'running',
          'completed_steps': 1,
          'total_steps': 5,
        },
      };
      final envelope = ExecutionEventEnvelope.fromJson(json);
      expect(envelope.eventId, 1);
      expect(envelope.event, 'execution.status.changed');
      expect(envelope.timestamp, '2026-01-01T10:00:00.000Z');
      expect(envelope.executionId, 'exec-001');
      expect(envelope.tenantId, 'tenant-001');
      expect(envelope.data['status'], 'running');
    });

    test('fromJson 处理无 tenant_id', () {
      final json = {
        'event_id': 2,
        'event': 'execution.node.status-changed',
        'timestamp': '2026-01-01T10:01:00.000Z',
        'execution_id': 'exec-001',
        'data': {
          'step_id': 'step-1',
          'node_id': 'node-a',
          'from': 'pending',
          'to': 'running',
        },
      };
      final envelope = ExecutionEventEnvelope.fromJson(json);
      expect(envelope.tenantId, isNull);
      expect(envelope.data['step_id'], 'step-1');
    });

    test('toJson 输出 snake_case', () {
      const envelope = ExecutionEventEnvelope(
        eventId: 1,
        event: 'execution.status.changed',
        timestamp: '2026-01-01T10:00:00.000Z',
        executionId: 'exec-001',
        data: {'status': 'running'},
      );
      final json = envelope.toJson();
      expect(json['event_id'], 1);
      expect(json['execution_id'], 'exec-001');
    });

    test('equality 基于值', () {
      final data = {'status': 'running'};
      final a = ExecutionEventEnvelope(
        eventId: 1,
        event: 'test',
        timestamp: 'ts',
        executionId: 'exec-001',
        data: data,
      );
      final b = ExecutionEventEnvelope(
        eventId: 1,
        event: 'test',
        timestamp: 'ts',
        executionId: 'exec-001',
        data: data,
      );
      expect(a, equals(b));
    });
  });

  group('ExecutionStatusChangedData', () {
    test('fromJson 正确解析', () {
      final json = {
        'execution_id': 'exec-001',
        'status': 'completed',
        'completed_steps': 5,
        'total_steps': 5,
        'error_message': null,
      };
      final data = ExecutionStatusChangedData.fromJson(json);
      expect(data.executionId, 'exec-001');
      expect(data.status, 'completed');
      expect(data.completedSteps, 5);
      expect(data.totalSteps, 5);
      expect(data.errorMessage, isNull);
    });

    test('fromJson 解析含错误消息', () {
      final json = {
        'execution_id': 'exec-002',
        'status': 'failed',
        'completed_steps': 2,
        'total_steps': 5,
        'error_message': 'Node timeout exceeded',
      };
      final data = ExecutionStatusChangedData.fromJson(json);
      expect(data.status, 'failed');
      expect(data.errorMessage, 'Node timeout exceeded');
    });

    test('toJson 输出 snake_case', () {
      const data = ExecutionStatusChangedData(
        executionId: 'exec-001',
        status: 'running',
        completedSteps: 1,
        totalSteps: 3,
      );
      final json = data.toJson();
      expect(json['execution_id'], 'exec-001');
      expect(json['completed_steps'], 1);
      expect(json['total_steps'], 3);
    });
  });

  group('NodeStatusChangedData', () {
    test('fromJson 正确解析', () {
      final json = {
        'step_id': 'step-001',
        'node_id': 'node-abc',
        'from': 'pending',
        'to': 'running',
        'error_detail': null,
        'error_message': null,
      };
      final data = NodeStatusChangedData.fromJson(json);
      expect(data.stepId, 'step-001');
      expect(data.nodeId, 'node-abc');
      expect(data.from, 'pending');
      expect(data.to, 'running');
      expect(data.errorDetail, isNull);
    });

    test('fromJson 解析含错误详情', () {
      final json = {
        'step_id': 'step-002',
        'node_id': 'node-xyz',
        'from': 'running',
        'to': 'failed',
        'error_detail': {
          'type': 'https://api.agentloom.io/errors/timeout',
          'title': 'Execution Timeout',
          'status': 504,
        },
        'error_message': 'Execution timed out',
      };
      final data = NodeStatusChangedData.fromJson(json);
      expect(data.to, 'failed');
      expect(
        data.errorDetail?['type'],
        'https://api.agentloom.io/errors/timeout',
      );
      expect(data.errorMessage, 'Execution timed out');
    });

    test('toJson 输出 snake_case', () {
      const data = NodeStatusChangedData(
        stepId: 'step-001',
        nodeId: 'node-abc',
        from: 'pending',
        to: 'running',
      );
      final json = data.toJson();
      expect(json['step_id'], 'step-001');
      expect(json['node_id'], 'node-abc');
    });
  });
}
