import 'package:agentloom_mobile/features/resources/models/resource_entities.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('WorkspaceDto', () {
    test('应解析来源字段并生成中文标签', () {
      final dto = WorkspaceDto.fromJson({
        'id': 'workspace-1',
        'name': 'execution-run-1-step-node-1-workspace',
        'description': null,
        'storageKey': 'key',
        'sizeBytes': null,
        'status': 'ready',
        'config': {'sourceSandboxSessionId': 'sandbox-1'},
        'sourceKind': 'execution_archive',
        'isAutoArchived': true,
        'createdAt': '2026-04-03T00:00:00.000Z',
        'updatedAt': '2026-04-03T00:00:00.000Z',
      });

      expect(dto.sourceKind, 'execution_archive');
      expect(dto.isAutoArchived, isTrue);
      expect(dto.sourceLabel, '执行归档');
    });
  });

  group('SandboxSessionDto', () {
    test('应解析 bindingType 与 timeoutSeconds，并提供展示标签', () {
      final dto = SandboxSessionDto.fromJson({
        'id': 'sandbox-1',
        'tenantId': 'tenant-1',
        'status': 'ready',
        'bindingType': 'conversation',
        'config': {
          'cpu': 1,
          'memory': 512,
          'disk': 2,
          'timeout': 1,
          'timeoutSeconds': 300,
          'lifecycleMode': 'session',
        },
        'createdAt': '2026-04-03T00:00:00.000Z',
      });

      expect(dto.bindingType, 'conversation');
      expect(dto.bindingLabel, '对话');
      expect(dto.config.timeoutSeconds, 300);
      expect(dto.config.timeoutLabel, '300s');
    });
  });
}
