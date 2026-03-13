import 'package:freezed_annotation/freezed_annotation.dart';

part 'input_field_definition.freezed.dart';
part 'input_field_definition.g.dart';

/// 输入字段校验规则
@freezed
abstract class InputFieldValidation with _$InputFieldValidation {
  const factory InputFieldValidation({
    @JsonKey(name: 'min_length') int? minLength,
    @JsonKey(name: 'max_length') int? maxLength,
    double? min,
    double? max,
  }) = _InputFieldValidation;

  factory InputFieldValidation.fromJson(Map<String, dynamic> json) =>
      _$InputFieldValidationFromJson(json);
}

/// 输入字段定义
@freezed
abstract class InputFieldDefinition with _$InputFieldDefinition {
  const factory InputFieldDefinition({
    required String id,
    required String type,
    required String label,
    String? description,
    @Default(false) bool required,
    InputFieldValidation? validation,
    List<String>? options,
    @JsonKey(name: 'default') dynamic defaultValue,
  }) = _InputFieldDefinition;

  factory InputFieldDefinition.fromJson(Map<String, dynamic> json) =>
      _$InputFieldDefinitionFromJson(json);
}
