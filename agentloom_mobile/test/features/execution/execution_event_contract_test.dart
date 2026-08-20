import 'dart:convert';
import 'dart:io';

import 'package:agentloom_mobile/features/execution/models/execution_event.dart';
import 'package:agentloom_mobile/features/execution/models/execution_state.dart';
import 'package:flutter_test/flutter_test.dart';

/// 跨端契约测试：直接消费 `agentloom-contracts/fixtures/` 中 server 实际输出形状的
/// fixture，断言移动端模型能解析并取到正确字段值。
///
/// server 的 Socket 信封是 camelCase，移动端模型曾错误声明
/// `@JsonSerializable(fieldRename: FieldRename.snake)`，生成的解析代码去读
/// `event_id` / `execution_id`，必填字段必然缺失 —— 这道测试是该缺陷的回归防线。
void main() {
  final fixturesDir = Directory(
    '${Directory.current.parent.path}/agentloom-contracts/fixtures',
  );

  Map<String, dynamic> readFixture(String relativePath) {
    final file = File('${fixturesDir.path}/$relativePath');
    expect(
      file.existsSync(),
      isTrue,
      reason: '契约 fixture 缺失：${file.path}',
    );
    return jsonDecode(file.readAsStringSync()) as Map<String, dynamic>;
  }

  group('执行事件信封契约', () {
    test('解析 execution-event-envelope.json 并取到正确字段值', () {
      final json = readFixture('execution-event-envelope.json');

      final envelope = ExecutionEventEnvelope.fromJson(json);

      expect(envelope.eventId, 7);
      expect(envelope.event, 'execution.status.changed');
      expect(envelope.timestamp, '2026-03-24T09:15:42.318Z');
      expect(envelope.executionId, '0195c3a1-8f2e-7c41-9b3d-2e6f4a7c9d01');
      expect(envelope.tenantId, '0195c3a1-4b7d-7e22-8a15-6c3b9f2e4d88');
      expect(envelope.data['status'], 'running');
      expect(envelope.data['completedSteps'], 2);
    });

    test('解析 execution.status.changed 载荷', () {
      final json = readFixture(
        'execution-events/execution-status-changed.json',
      );

      final data = ExecutionStatusChangedData.fromJson(json);

      expect(data.executionId, '0195c3a1-8f2e-7c41-9b3d-2e6f4a7c9d01');
      expect(data.status, 'running');
      expect(data.completedSteps, 2);
      expect(data.totalSteps, 5);
    });

    test('解析 execution.node.status-changed 载荷', () {
      final json = readFixture('execution-events/node-status-changed.json');

      final data = NodeStatusChangedData.fromJson(json);

      expect(data.stepId, '0195c3a1-9a01-7f10-b2c4-118d5e7a3b22');
      expect(data.nodeId, 'agent-main');
      expect(data.from, 'pending');
      expect(data.to, 'running');
    });
  });

  group('回放快照契约', () {
    test('解析 execution-state-snapshot.json 并取到正确字段值', () {
      final json = readFixture('execution-state-snapshot.json');

      final snapshot = ExecutionStateSnapshot.fromJson(json);

      expect(snapshot.executionId, '0195c3a1-8f2e-7c41-9b3d-2e6f4a7c9d01');
      expect(snapshot.status, 'running');
      expect(snapshot.completedSteps, 1);
      expect(snapshot.totalSteps, 3);
      expect(snapshot.lastEventId, 7);
      expect(snapshot.snapshotAt, '2026-03-24T09:15:42.318Z');
      expect(snapshot.steps, hasLength(3));

      final first = snapshot.steps.first;
      expect(first.stepId, '0195c3a1-9a01-7f10-b2c4-118d5e7a3b21');
      expect(first.nodeId, 'input-1');
      expect(first.status, 'completed');
      expect(first.startedAt, '2026-03-24T09:15:40.001Z');
      expect(first.completedAt, '2026-03-24T09:15:40.512Z');
      expect(first.result, {'text': 'hello'});
      expect(first.checkpointData, isNull);

      final failed = snapshot.steps.last;
      expect(failed.status, 'failed');
      expect(failed.errorMessage, '端口类型不兼容');
      expect(failed.errorDetail?['type'], 'TYPE_MISMATCH');
    });
  });
}
