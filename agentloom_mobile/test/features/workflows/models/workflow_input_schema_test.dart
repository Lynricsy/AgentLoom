import 'package:agentloom_mobile/features/workflows/models/input_field_definition.dart';
import 'package:agentloom_mobile/features/workflows/models/workflow_input_schema.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../helpers/test_helpers.dart';

void main() {
  group('WorkflowInputSchema', () {
    test('fromJson 解析 snake_case (collection_mode)', () {
      final json = {
        'version': 2,
        'collection_mode': 'conversation',
        'fields': [
          {'id': 'f1', 'type': 'text', 'label': '标题'},
        ],
      };
      final schema = WorkflowInputSchema.fromJson(json);
      expect(schema.version, 2);
      expect(schema.collectionMode, 'conversation');
      expect(schema.fields.length, 1);
      expect(schema.fields.first.id, 'f1');
    });

    test('默认值 (version=1, collectionMode=form, fields=[])', () {
      final schema = WorkflowInputSchema.fromJson({});
      expect(schema.version, 1);
      expect(schema.collectionMode, 'form');
      expect(schema.fields, isEmpty);
    });

    test('包含多个字段', () {
      final schema = createTestWorkflowInputSchema(
        fields: [
          createTestInputFieldDefinition(id: 'f1', type: 'text', label: 'A'),
          createTestInputFieldDefinition(id: 'f2', type: 'number', label: 'B'),
        ],
      );
      expect(schema.fields.length, 2);
      expect(schema.fields[0].type, 'text');
      expect(schema.fields[1].type, 'number');
    });

    test('toJson round-trip', () {
      final original = createTestWorkflowInputSchema(
        version: 3,
        collectionMode: 'conversation',
        fields: [
          createTestInputFieldDefinition(id: 'f1', type: 'text', label: 'Q'),
        ],
      );
      final json = original.toJson();
      expect(json['collection_mode'], 'conversation');
      expect(json['version'], 3);

      final restored = WorkflowInputSchema.fromJson(json);
      expect(restored.version, original.version);
      expect(restored.collectionMode, original.collectionMode);
      expect(restored.fields.length, original.fields.length);
    });
  });
}
