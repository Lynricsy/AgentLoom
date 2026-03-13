import 'package:agentloom_mobile/features/workflows/models/input_field_definition.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../helpers/test_helpers.dart';

void main() {
  group('InputFieldValidation', () {
    test('fromJson 解析 snake_case 键', () {
      final json = {
        'min_length': 3,
        'max_length': 100,
        'min': 1.5,
        'max': 99.9,
      };
      final validation = InputFieldValidation.fromJson(json);
      expect(validation.minLength, 3);
      expect(validation.maxLength, 100);
      expect(validation.min, 1.5);
      expect(validation.max, 99.9);
    });

    test('fromJson 处理全部 null 字段', () {
      final validation = InputFieldValidation.fromJson({});
      expect(validation.minLength, isNull);
      expect(validation.maxLength, isNull);
      expect(validation.min, isNull);
      expect(validation.max, isNull);
    });

    test('toJson 输出 snake_case 键', () {
      final validation = createTestInputFieldValidation(
        minLength: 5,
        maxLength: 50,
        min: 0,
        max: 100,
      );
      final json = validation.toJson();
      expect(json['min_length'], 5);
      expect(json['max_length'], 50);
      expect(json['min'], 0.0);
      expect(json['max'], 100.0);
    });

    test('toJson round-trip', () {
      final original = createTestInputFieldValidation(
        minLength: 10,
        maxLength: 200,
        min: -5,
        max: 999,
      );
      final json = original.toJson();
      final restored = InputFieldValidation.fromJson(json);
      expect(restored, original);
    });
  });

  group('InputFieldDefinition', () {
    test('fromJson 解析所有字段', () {
      final json = {
        'id': 'field-title',
        'type': 'text',
        'label': '标题',
        'description': '请输入标题',
        'required': true,
        'validation': {'min_length': 3, 'max_length': 100},
        'options': ['A', 'B'],
        'default': 'hello',
      };
      final field = InputFieldDefinition.fromJson(json);
      expect(field.id, 'field-title');
      expect(field.type, 'text');
      expect(field.label, '标题');
      expect(field.description, '请输入标题');
      expect(field.required, true);
      expect(field.validation?.minLength, 3);
      expect(field.validation?.maxLength, 100);
      expect(field.options, ['A', 'B']);
      expect(field.defaultValue, 'hello');
    });

    test('fromJson 使用默认值 (required=false, validation=null)', () {
      final json = {'id': 'f1', 'type': 'number', 'label': '数量'};
      final field = InputFieldDefinition.fromJson(json);
      expect(field.required, false);
      expect(field.validation, isNull);
      expect(field.description, isNull);
      expect(field.options, isNull);
      expect(field.defaultValue, isNull);
    });

    test('@JsonKey(name: "default") 映射 defaultValue', () {
      final json = {'id': 'f2', 'type': 'text', 'label': 'Name', 'default': 42};
      final field = InputFieldDefinition.fromJson(json);
      expect(field.defaultValue, 42);

      final output = field.toJson();
      expect(output['default'], 42);
      expect(output.containsKey('defaultValue'), false);
    });

    test('toJson round-trip', () {
      final original = createTestInputFieldDefinition(
        id: 'f-round',
        type: 'single_select',
        label: '选择',
        description: '选一个',
        required: true,
        validation: createTestInputFieldValidation(minLength: 1),
        options: ['X', 'Y', 'Z'],
        defaultValue: 'X',
      );
      final json = original.toJson();
      final restored = InputFieldDefinition.fromJson(json);
      expect(restored.id, original.id);
      expect(restored.type, original.type);
      expect(restored.label, original.label);
      expect(restored.required, original.required);
      expect(restored.options, original.options);
      expect(restored.defaultValue, original.defaultValue);
    });

    test('工厂函数 createTestInputFieldDefinition 默认值', () {
      final field = createTestInputFieldDefinition();
      expect(field.id, 'field-1');
      expect(field.type, 'text');
      expect(field.label, '测试字段');
      expect(field.required, false);
    });
  });
}
