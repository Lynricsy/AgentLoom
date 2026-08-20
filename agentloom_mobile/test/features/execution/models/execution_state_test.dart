import 'package:flutter_test/flutter_test.dart';
import 'package:agentloom_mobile/features/execution/models/execution_state.dart';
import 'package:agentloom_mobile/features/execution/models/execution_status.dart';

void main() {
  group('StepSnapshot', () {
    test('fromJson 正确解析 camelCase wire 字段', () {
      final json = {
        'stepId': 'step-001',
        'nodeId': 'node-abc',
        'status': 'running',
        'startedAt': '2026-01-01T10:00:00.000Z',
        'completedAt': null,
        'errorMessage': null,
        'errorDetail': null,
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
        'stepId': 'step-002',
        'nodeId': 'node-xyz',
        'status': 'failed',
        'startedAt': '2026-01-01T10:00:00.000Z',
        'completedAt': '2026-01-01T10:01:00.000Z',
        'errorMessage': 'Connection timeout',
        'errorDetail': {'type': 'timeout', 'code': 504},
        'result': null,
      };
      final step = StepSnapshot.fromJson(json);
      expect(step.status, 'failed');
      expect(step.errorMessage, 'Connection timeout');
      expect(step.errorDetail?['type'], 'timeout');
    });

    test('toJson 输出 camelCase wire 键名', () {
      const step = StepSnapshot(
        stepId: 'step-001',
        nodeId: 'node-abc',
        status: 'running',
        startedAt: '2026-01-01T10:00:00.000Z',
      );
      final json = step.toJson();
      expect(json['stepId'], 'step-001');
      expect(json['nodeId'], 'node-abc');
      expect(json['startedAt'], '2026-01-01T10:00:00.000Z');
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
        'executionId': 'exec-001',
        'status': 'running',
        'completedSteps': 2,
        'totalSteps': 5,
        'steps': [
          {
            'stepId': 'step-1',
            'nodeId': 'node-a',
            'status': 'completed',
            'startedAt': '2026-01-01T10:00:00.000Z',
            'completedAt': '2026-01-01T10:01:00.000Z',
          },
          {
            'stepId': 'step-2',
            'nodeId': 'node-b',
            'status': 'running',
            'startedAt': '2026-01-01T10:01:00.000Z',
          },
        ],
        'snapshotAt': '2026-01-01T10:01:30.000Z',
        'lastEventId': 42,
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
        'executionId': 'exec-002',
        'status': 'pending',
        'completedSteps': 0,
        'totalSteps': 3,
        'steps': <Map<String, dynamic>>[],
        'snapshotAt': null,
        'lastEventId': null,
      };
      final snapshot = ExecutionStateSnapshot.fromJson(json);
      expect(snapshot.steps, isEmpty);
      expect(snapshot.lastEventId, isNull);
    });

    test('toJson 输出 camelCase wire 键名', () {
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
      expect(json['executionId'], 'exec-001');
      expect(json['completedSteps'], 1);
      expect(json['totalSteps'], 3);
      expect(json['snapshotAt'], '2026-01-01T10:00:00.000Z');
      expect(json['lastEventId'], 10);
      expect((json['steps'] as List).first['stepId'], 'step-1');
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
