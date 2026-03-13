// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'input_field_definition.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_InputFieldValidation _$InputFieldValidationFromJson(
  Map<String, dynamic> json,
) => _InputFieldValidation(
  minLength: (json['min_length'] as num?)?.toInt(),
  maxLength: (json['max_length'] as num?)?.toInt(),
  min: (json['min'] as num?)?.toDouble(),
  max: (json['max'] as num?)?.toDouble(),
);

Map<String, dynamic> _$InputFieldValidationToJson(
  _InputFieldValidation instance,
) => <String, dynamic>{
  'min_length': instance.minLength,
  'max_length': instance.maxLength,
  'min': instance.min,
  'max': instance.max,
};

_InputFieldDefinition _$InputFieldDefinitionFromJson(
  Map<String, dynamic> json,
) => _InputFieldDefinition(
  id: json['id'] as String,
  type: json['type'] as String,
  label: json['label'] as String,
  description: json['description'] as String?,
  required: json['required'] as bool? ?? false,
  validation: json['validation'] == null
      ? null
      : InputFieldValidation.fromJson(
          json['validation'] as Map<String, dynamic>,
        ),
  options: (json['options'] as List<dynamic>?)
      ?.map((e) => e as String)
      .toList(),
  defaultValue: json['default'],
);

Map<String, dynamic> _$InputFieldDefinitionToJson(
  _InputFieldDefinition instance,
) => <String, dynamic>{
  'id': instance.id,
  'type': instance.type,
  'label': instance.label,
  'description': instance.description,
  'required': instance.required,
  'validation': instance.validation?.toJson(),
  'options': instance.options,
  'default': instance.defaultValue,
};
