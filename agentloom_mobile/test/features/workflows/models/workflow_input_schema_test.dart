import 'package:agentloom_mobile/features/workflows/models/conversation_plan.dart';
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

    test('支持字段 visibility round-trip', () {
      final original = createTestWorkflowInputSchema(
        fields: [
          createTestInputFieldDefinition(
            id: 'advanced_note',
            type: 'text',
            label: '高级说明',
            visibility: createTestInputFieldVisibility(
              fieldId: 'mode',
              equals: 'advanced',
            ),
          ),
        ],
      );

      final json = original.toJson();
      expect((json['fields'] as List).first['visibility'], <String, dynamic>{
        'fieldId': 'mode',
        'equals': 'advanced',
      });

      final restored = WorkflowInputSchema.fromJson(json);
      expect(restored.fields.first.visibility?.fieldId, 'mode');
      expect(restored.fields.first.visibility?.equals, 'advanced');
    });

    test('should parse conversationPlan from JSON', () {
      final schema = WorkflowInputSchema.fromJson({
        'version': 1,
        'collection_mode': 'conversation',
        'fields': const [],
        'conversation_plan': {'system_prompt': '请逐步收集需求背景。', 'max_turns': 6},
      });

      expect(schema.conversationPlan, isNotNull);
      expect(schema.conversationPlan?.systemPrompt, '请逐步收集需求背景。');
      expect(schema.conversationPlan?.maxTurns, 6);
    });

    test('should handle missing conversationPlan (backward compat)', () {
      final schema = WorkflowInputSchema.fromJson({
        'version': 1,
        'collection_mode': 'conversation',
        'fields': const [],
      });

      expect(schema.conversationPlan, isNull);
    });

    test('should serialize conversationPlan to JSON', () {
      final original = createTestWorkflowInputSchema(
        collectionMode: 'conversation',
        conversationPlan: const ConversationPlan(
          systemPrompt: '先确认目标，再继续追问。',
          maxTurns: 4,
        ),
      );

      final json = original.toJson();
      expect(json['conversation_plan'], {
        'system_prompt': '先确认目标，再继续追问。',
        'max_turns': 4,
      });

      final restored = WorkflowInputSchema.fromJson(json);
      expect(restored.conversationPlan, original.conversationPlan);
    });
  });
}
