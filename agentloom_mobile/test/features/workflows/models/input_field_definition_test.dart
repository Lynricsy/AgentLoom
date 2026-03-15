import 'package:agentloom_mobile/features/workflows/models/input_field_definition.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../helpers/test_helpers.dart';

void main() {
  group('InputFieldVisibility', () {
    test('支持 snake_case 与 camelCase fieldId 反序列化', () {
      final snakeCase = InputFieldVisibility.fromJson({
        'field_id': 'mode',
        'equals': 'advanced',
      });
      final camelCase = InputFieldVisibility.fromJson({
        'fieldId': 'mode',
        'equals': 'advanced',
      });

      expect(snakeCase.fieldId, 'mode');
      expect(snakeCase.equals, 'advanced');
      expect(camelCase, snakeCase);
      expect(camelCase.toJson(), {'fieldId': 'mode', 'equals': 'advanced'});
    });
  });

  group('InputFieldValidation', () {
    test('正确映射 snake_case 校验字段', () {
      final validation = InputFieldValidation.fromJson({
        'min_length': 2,
        'max_length': 20,
        'min': 1,
        'max': 10.5,
      });

      expect(validation.minLength, 2);
      expect(validation.maxLength, 20);
      expect(validation.min, 1);
      expect(validation.max, 10.5);
      expect(validation.toJson(), {
        'min_length': 2,
        'max_length': 20,
        'min': 1,
        'max': 10.5,
      });
    });
  });

  group('InputFieldDefinition', () {
    test('支持 default 与 visibility 解析', () {
      final field = InputFieldDefinition.fromJson({
        'id': 'advanced_note',
        'type': 'text',
        'label': '高级说明',
        'description': '仅在高级模式下显示',
        'required': false,
        'default': '默认说明',
        'visibility': {'field_id': 'mode', 'equals': 'advanced'},
        'validation': {'min_length': 3, 'max_length': 100},
      });

      expect(field.id, 'advanced_note');
      expect(field.defaultValue, '默认说明');
      expect(
        field.visibility,
        const InputFieldVisibility(fieldId: 'mode', equals: 'advanced'),
      );
      expect(
        field.validation,
        const InputFieldValidation(minLength: 3, maxLength: 100),
      );
      expect(field.toJson(), {
        'id': 'advanced_note',
        'type': 'text',
        'label': '高级说明',
        'description': '仅在高级模式下显示',
        'required': false,
        'validation': {
          'min_length': 3,
          'max_length': 100,
          'min': null,
          'max': null,
        },
        'options': null,
        'default': '默认说明',
        'visibility': {'fieldId': 'mode', 'equals': 'advanced'},
      });
    });

    test('深层默认值可参与相等比较', () {
      final left = createTestInputFieldDefinition(
        id: 'payload',
        type: 'text',
        defaultValue: {
          'items': ['a', 'b'],
          'meta': {'count': 2},
        },
      );
      final right = createTestInputFieldDefinition(
        id: 'payload',
        type: 'text',
        defaultValue: {
          'meta': {'count': 2},
          'items': ['a', 'b'],
        },
      );

      expect(left, right);
      expect(left.hashCode, right.hashCode);
    });

    test('工厂默认值符合预期', () {
      final field = createTestInputFieldDefinition();

      expect(field.id, 'field-1');
      expect(field.type, 'text');
      expect(field.label, '测试字段');
      expect(field.required, isFalse);
      expect(field.validation, isNull);
      expect(field.options, isNull);
      expect(field.defaultValue, isNull);
      expect(field.visibility, isNull);
    });

    test('should parse collectionHint from snake_case JSON', () {
      final field = InputFieldDefinition.fromJson({
        'id': 'goal',
        'type': 'text',
        'label': '目标',
        'collection_hint': '请先描述你希望达到的结果。',
      });

      expect(field.collectionHint, '请先描述你希望达到的结果。');
    });

    test('should parse collectionHint from camelCase JSON', () {
      final field = InputFieldDefinition.fromJson({
        'id': 'goal',
        'type': 'text',
        'label': '目标',
        'collectionHint': '请补充成功标准。',
      });

      expect(field.collectionHint, '请补充成功标准。');
    });

    test('should handle missing collectionHint (backward compat)', () {
      final field = InputFieldDefinition.fromJson({
        'id': 'goal',
        'type': 'text',
        'label': '目标',
      });

      expect(field.collectionHint, isNull);
    });

    test('should include collectionHint in toJson', () {
      final field = createTestInputFieldDefinition(
        id: 'goal',
        collectionHint: '请描述期望成果。',
      );

      expect(field.toJson()['collection_hint'], '请描述期望成果。');
    });

    test('should include collectionHint in equality', () {
      final left = createTestInputFieldDefinition(
        id: 'goal',
        collectionHint: '先描述背景。',
      );
      final right = createTestInputFieldDefinition(
        id: 'goal',
        collectionHint: '先描述成功标准。',
      );

      expect(left == right, isFalse);
    });
  });
}
