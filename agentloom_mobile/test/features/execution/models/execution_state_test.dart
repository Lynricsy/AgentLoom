import 'package:flutter_test/flutter_test.dart';
import 'package:agentloom_mobile/features/execution/models/execution_state.dart';
import 'package:agentloom_mobile/features/execution/models/execution_status.dart';

void main() {
  group('StepSnapshot', () {
    test('fromJson 正确解析 snake_case 字段', () {
      final json = {
        'step_id': 'step-001',
        'node_id': 'node-abc',
        'status': 'running',
        'started_at': '2026-01-01T10:00:00.000Z',
        'completed_at': null,
        'error_message': null,
        'error_detail': null,
        'result': null,
      };
      final step = StepSnapshot.fromJson(json);
      expect(step.stepId, 'step-001');
      expect(step.nodeId, 'node-abc');
      expect(step.status, 'running');
      expect(step.startedAt, '2026-01-01T10:00:00.000Z');
      expect(step.completedAt, isNull);
      expect(step.errorMessage, isNull);
    });

    test('fromJson 解析含错误详情', () {
      final json = {
        'step_id': 'step-002',
        'node_id': 'node-xyz',
        'status': 'failed',
        'started_at': '2026-01-01T10:00:00.000Z',
        'completed_at': '2026-01-01T10:01:00.000Z',
        'error_message': 'Connection timeout',
        'error_detail': {'type': 'timeout', 'code': 504},
        'result': null,
      };
      final step = StepSnapshot.fromJson(json);
      expect(step.status, 'failed');
      expect(step.errorMessage, 'Connection timeout');
      expect(step.errorDetail?['type'], 'timeout');
    });

    test('toJson 输出 snake_case', () {
      const step = StepSnapshot(
        stepId: 'step-001',
        nodeId: 'node-abc',
        status: 'running',
        startedAt: '2026-01-01T10:00:00.000Z',
      );
      final json = step.toJson();
      expect(json['step_id'], 'step-001');
      expect(json['node_id'], 'node-abc');
      expect(json['started_at'], '2026-01-01T10:00:00.000Z');
    });

    test('copyWith 正确复制', () {
      const step = StepSnapshot(
        stepId: 'step-001',
        nodeId: 'node-abc',
        status: 'running',
      );
      final updated = step.copyWith(status: 'completed');
      expect(updated.status, 'completed');
      expect(updated.stepId, 'step-001');
    });

    test('equality 基于值', () {
      const a = StepSnapshot(
        stepId: 'step-001',
        nodeId: 'node-abc',
        status: 'running',
      );
      const b = StepSnapshot(
        stepId: 'step-001',
        nodeId: 'node-abc',
        status: 'running',
      );
      expect(a, equals(b));
    });
  });

  group('ExecutionStateSnapshot', () {
    test('fromJson 正确解析完整快照', () {
      final json = {
        'execution_id': 'exec-001',
        'status': 'running',
        'completed_steps': 2,
        'total_steps': 5,
        'steps': [
          {
            'step_id': 'step-1',
            'node_id': 'node-a',
            'status': 'completed',
            'started_at': '2026-01-01T10:00:00.000Z',
            'completed_at': '2026-01-01T10:01:00.000Z',
          },
          {
            'step_id': 'step-2',
            'node_id': 'node-b',
            'status': 'running',
            'started_at': '2026-01-01T10:01:00.000Z',
          },
        ],
        'snapshot_at': '2026-01-01T10:01:30.000Z',
        'last_event_id': 42,
      };
      final snapshot = ExecutionStateSnapshot.fromJson(json);
      expect(snapshot.executionId, 'exec-001');
      expect(snapshot.status, 'running');
      expect(snapshot.completedSteps, 2);
      expect(snapshot.totalSteps, 5);
      expect(snapshot.steps, hasLength(2));
      expect(snapshot.steps[0].stepId, 'step-1');
      expect(snapshot.steps[1].status, 'running');
      expect(snapshot.snapshotAt, '2026-01-01T10:01:30.000Z');
      expect(snapshot.lastEventId, 42);
    });

    test('fromJson 处理空步骤列表', () {
      final json = {
        'execution_id': 'exec-002',
        'status': 'pending',
        'completed_steps': 0,
        'total_steps': 3,
        'steps': <Map<String, dynamic>>[],
        'snapshot_at': null,
        'last_event_id': null,
      };
      final snapshot = ExecutionStateSnapshot.fromJson(json);
      expect(snapshot.steps, isEmpty);
      expect(snapshot.lastEventId, isNull);
    });

    test('toJson 输出 snake_case', () {
      const snapshot = ExecutionStateSnapshot(
        executionId: 'exec-001',
        status: 'running',
        completedSteps: 1,
        totalSteps: 3,
        steps: [
          StepSnapshot(stepId: 'step-1', nodeId: 'node-a', status: 'completed'),
        ],
        snapshotAt: '2026-01-01T10:00:00.000Z',
        lastEventId: 10,
      );
      final json = snapshot.toJson();
      expect(json['execution_id'], 'exec-001');
      expect(json['completed_steps'], 1);
      expect(json['total_steps'], 3);
      expect(json['snapshot_at'], '2026-01-01T10:00:00.000Z');
      expect(json['last_event_id'], 10);
      expect((json['steps'] as List).first['step_id'], 'step-1');
    });

    test('equality 基于值', () {
      const steps = [
        StepSnapshot(stepId: 'step-1', nodeId: 'node-a', status: 'running'),
      ];
      const a = ExecutionStateSnapshot(
        executionId: 'exec-001',
        status: 'running',
        steps: steps,
      );
      const b = ExecutionStateSnapshot(
        executionId: 'exec-001',
        status: 'running',
        steps: steps,
      );
      expect(a, equals(b));
    });
  });

  group('ExecutionStateSnapshotX', () {
    test('executionStatus 返回正确枚举', () {
      const snapshot = ExecutionStateSnapshot(
        executionId: 'exec-001',
        status: 'running',
        steps: [],
      );
      expect(snapshot.executionStatus, ExecutionStatus.running);
    });

    test('stepStatusOf 返回正确步骤状态', () {
      const snapshot = ExecutionStateSnapshot(
        executionId: 'exec-001',
        status: 'running',
        steps: [
          StepSnapshot(stepId: 'step-1', nodeId: 'node-a', status: 'completed'),
          StepSnapshot(
            stepId: 'step-2',
            nodeId: 'node-b',
            status: 'waiting_intervention',
          ),
        ],
      );
      expect(snapshot.stepStatusOf('step-1'), StepStatus.completed);
      expect(snapshot.stepStatusOf('step-2'), StepStatus.waitingIntervention);
    });

    test('stepStatusOf 不存在的步骤返回 null', () {
      const snapshot = ExecutionStateSnapshot(
        executionId: 'exec-001',
        status: 'running',
        steps: [],
      );
      expect(snapshot.stepStatusOf('nonexistent'), isNull);
    });
  });
}
