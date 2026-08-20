import 'package:agentloom_mobile/features/workflows/models/execution_summary_dto.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('ExecutionSummaryDto', () {
    final sampleJson = {
      'id': 'exec-001',
      'workflow_id': 'wf-001',
      'status': 'completed',
      'trigger_type': 'manual',
      'total_steps': 5,
      'completed_steps': 5,
      'started_at': '2026-01-01T10:00:00.000Z',
      'completed_at': '2026-01-01T10:05:00.000Z',
      'failed_at': null,
      'created_at': '2026-01-01T10:00:00.000Z',
      'updated_at': '2026-01-01T10:05:00.000Z',
    };

    test('fromJson 正确解析完整 JSON', () {
      final dto = ExecutionSummaryDto.fromJson(sampleJson);

      expect(dto.id, 'exec-001');
      expect(dto.workflowId, 'wf-001');
      expect(dto.status, 'completed');
      expect(dto.triggerType, 'manual');
      expect(dto.totalSteps, 5);
      expect(dto.completedSteps, 5);
      expect(dto.startedAt, '2026-01-01T10:00:00.000Z');
      expect(dto.completedAt, '2026-01-01T10:05:00.000Z');
      expect(dto.failedAt, isNull);
    });

    test('fromJson 正确处理可选字段缺失', () {
      final minimalJson = {
        'id': 'exec-002',
        'workflow_id': 'wf-002',
        'status': 'pending',
        'created_at': '2026-01-01T00:00:00.000Z',
        'updated_at': '2026-01-01T00:00:00.000Z',
      };

      final dto = ExecutionSummaryDto.fromJson(minimalJson);

      expect(dto.triggerType, isNull);
      expect(dto.totalSteps, isNull);
      expect(dto.completedSteps, isNull);
      expect(dto.startedAt, isNull);
      expect(dto.completedAt, isNull);
      expect(dto.failedAt, isNull);
    });

    test('toJson 输出 canonical camelCase 键', () {
      final dto = ExecutionSummaryDto.fromJson(sampleJson);
      final json = dto.toJson();

      expect(json.containsKey('workflowId'), isTrue);
      expect(json.containsKey('triggerType'), isTrue);
      expect(json.containsKey('totalSteps'), isTrue);
      expect(json.containsKey('completedSteps'), isTrue);
      expect(json.containsKey('startedAt'), isTrue);
      expect(json.containsKey('completedAt'), isTrue);
      expect(json.containsKey('failedAt'), isTrue);
      expect(json.containsKey('workflow_id'), isFalse);
    });

    test('toJson → fromJson 往返一致', () {
      final original = ExecutionSummaryDto.fromJson(sampleJson);
      final roundTripped = ExecutionSummaryDto.fromJson(original.toJson());

      expect(roundTripped.id, original.id);
      expect(roundTripped.status, original.status);
      expect(roundTripped.totalSteps, original.totalSteps);
    });

    test('failed 状态正确序列化', () {
      final failedJson = {
        ...sampleJson,
        'status': 'failed',
        'completed_at': null,
        'failed_at': '2026-01-01T10:03:00.000Z',
        'completed_steps': 3,
      };

      final dto = ExecutionSummaryDto.fromJson(failedJson);

      expect(dto.status, 'failed');
      expect(dto.completedAt, isNull);
      expect(dto.failedAt, '2026-01-01T10:03:00.000Z');
      expect(dto.completedSteps, 3);
    });

    test('copyWith 正确创建副本', () {
      final dto = ExecutionSummaryDto.fromJson(sampleJson);
      final copy = dto.copyWith(status: 'failed', completedSteps: 3);

      expect(copy.status, 'failed');
      expect(copy.completedSteps, 3);
      expect(copy.id, dto.id);
    });

    test('fromJson 兼容 camelCase 执行摘要与步骤', () {
      final camelCaseJson = {
        'id': 'exec-003',
        'workflowId': 'wf-003',
        'status': 'running',
        'triggerType': 'manual',
        'totalSteps': 2,
        'completedSteps': 1,
        'startedAt': '2026-01-01T10:00:00.000Z',
        'createdAt': '2026-01-01T10:00:00.000Z',
        'updatedAt': '2026-01-01T10:01:00.000Z',
        'definitionSnapshot': {
          'nodes': [
            {
              'id': 'node-1',
              'data': {'label': 'Agent A', 'nodeType': 'agent'},
            },
          ],
        },
        'steps': [
          {
            'id': 'step-1',
            'executionId': 'exec-003',
            'nodeId': 'node-1',
            'stepOrder': 1,
            'status': 'running',
            'nodeType': 'agent',
            'nodeData': {'label': 'Agent A'},
            'checkpointData': {
              'session': {'id': 'sess-1'},
            },
            'errorMessage': null,
            'startedAt': '2026-01-01T10:00:00.000Z',
            'createdAt': '2026-01-01T10:00:00.000Z',
            'updatedAt': '2026-01-01T10:01:00.000Z',
          },
        ],
      };

      final dto = ExecutionSummaryDto.fromJson(camelCaseJson);

      expect(dto.workflowId, 'wf-003');
      expect(dto.triggerType, 'manual');
      expect(dto.totalSteps, 2);
      expect(dto.createdAt, '2026-01-01T10:00:00.000Z');
      expect(dto.definitionSnapshot?['nodes'], isA<List<dynamic>>());
      expect(dto.steps, hasLength(1));
      expect(dto.steps!.first.executionId, 'exec-003');
      expect(dto.steps!.first.nodeId, 'node-1');
      expect(dto.steps!.first.stepOrder, 1);
      expect(dto.steps!.first.createdAt, '2026-01-01T10:00:00.000Z');
    });
  });
}
