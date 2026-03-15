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
  });
}
