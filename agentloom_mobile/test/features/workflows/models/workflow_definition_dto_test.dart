import 'package:agentloom_mobile/features/workflows/models/workflow_definition_dto.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('WorkflowDefinitionDto', () {
    final sampleJson = {
      'id': 'wf-001',
      'name': 'Test Workflow',
      'slug': 'test-workflow',
      'description': 'A test workflow',
      'status': 'published',
      'version': 2,
      'metadata': {'key': 'value'},
      'created_by': 'user-001',
      'updated_by': 'user-002',
      'created_at': '2026-01-01T00:00:00.000Z',
      'updated_at': '2026-01-02T00:00:00.000Z',
    };

    test('fromJson 正确解析完整 JSON', () {
      final dto = WorkflowDefinitionDto.fromJson(sampleJson);

      expect(dto.id, 'wf-001');
      expect(dto.name, 'Test Workflow');
      expect(dto.slug, 'test-workflow');
      expect(dto.description, 'A test workflow');
      expect(dto.status, 'published');
      expect(dto.version, 2);
      expect(dto.metadata, {'key': 'value'});
      expect(dto.createdBy, 'user-001');
      expect(dto.updatedBy, 'user-002');
      expect(dto.createdAt, '2026-01-01T00:00:00.000Z');
      expect(dto.updatedAt, '2026-01-02T00:00:00.000Z');
    });

    test('fromJson 正确处理可选字段缺失', () {
      final minimalJson = {
        'id': 'wf-002',
        'name': 'Minimal',
        'slug': 'minimal',
        'status': 'draft',
        'version': 1,
        'created_at': '2026-01-01T00:00:00.000Z',
        'updated_at': '2026-01-01T00:00:00.000Z',
      };

      final dto = WorkflowDefinitionDto.fromJson(minimalJson);

      expect(dto.id, 'wf-002');
      expect(dto.description, isNull);
      expect(dto.metadata, isNull);
      expect(dto.createdBy, isNull);
      expect(dto.updatedBy, isNull);
    });

    test('toJson 输出 snake_case 键', () {
      final dto = WorkflowDefinitionDto.fromJson(sampleJson);
      final json = dto.toJson();

      expect(json.containsKey('createdAt'), isTrue);
      expect(json.containsKey('updatedAt'), isTrue);
      expect(json.containsKey('createdBy'), isTrue);
      expect(json.containsKey('updatedBy'), isTrue);
      expect(json.containsKey('created_at'), isFalse);
    });

    test('toJson → fromJson 往返一致', () {
      final original = WorkflowDefinitionDto.fromJson(sampleJson);
      final roundTripped = WorkflowDefinitionDto.fromJson(original.toJson());

      expect(roundTripped.id, original.id);
      expect(roundTripped.name, original.name);
      expect(roundTripped.status, original.status);
      expect(roundTripped.version, original.version);
      expect(roundTripped.metadata, original.metadata);
    });

    test('copyWith 正确创建副本', () {
      final dto = WorkflowDefinitionDto.fromJson(sampleJson);
      final copy = dto.copyWith(name: 'Updated Name', version: 3);

      expect(copy.name, 'Updated Name');
      expect(copy.version, 3);
      expect(copy.id, dto.id);
      expect(copy.slug, dto.slug);
    });

    test('相等性比较正确', () {
      final a = WorkflowDefinitionDto.fromJson(sampleJson);
      final b = WorkflowDefinitionDto.fromJson(sampleJson);

      expect(a, equals(b));
      expect(a.hashCode, equals(b.hashCode));
    });

    test('fromJson 兼容 camelCase 响应', () {
      final camelCaseJson = {
        'id': 'wf-003',
        'name': 'Camel Workflow',
        'slug': 'camel-workflow',
        'description': 'camel case payload',
        'status': 'published',
        'version': 3,
        'publishedReleaseNumber': 2,
        'metadata': {'origin': 'api'},
        'createdBy': 'user-003',
        'updatedBy': 'user-004',
        'createdAt': '2026-01-03T00:00:00.000Z',
        'updatedAt': '2026-01-04T00:00:00.000Z',
      };

      final dto = WorkflowDefinitionDto.fromJson(camelCaseJson);

      expect(dto.id, 'wf-003');
      expect(dto.publishedReleaseNumber, 2);
      expect(dto.createdBy, 'user-003');
      expect(dto.updatedAt, '2026-01-04T00:00:00.000Z');
    });
  });
}
