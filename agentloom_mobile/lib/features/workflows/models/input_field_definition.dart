import 'package:flutter/foundation.dart';

/// 输入字段显示条件
class InputFieldVisibility {
  const InputFieldVisibility({required this.fieldId, required this.equals});

  final String fieldId;
  final Object? equals;

  factory InputFieldVisibility.fromJson(Map<String, dynamic> json) {
    final fieldId = json['fieldId'] ?? json['field_id'];
    return InputFieldVisibility(
      fieldId: fieldId as String,
      equals: json['equals'],
    );
  }

  Map<String, dynamic> toJson() => {'fieldId': fieldId, 'equals': equals};

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is InputFieldVisibility &&
        other.fieldId == fieldId &&
        _jsonValueEquals(other.equals, equals);
  }

  @override
  int get hashCode => Object.hash(fieldId, _jsonValueHash(equals));
}

/// 输入字段校验规则
class InputFieldValidation {
  const InputFieldValidation({
    this.minLength,
    this.maxLength,
    this.min,
    this.max,
  });

  final int? minLength;
  final int? maxLength;
  final double? min;
  final double? max;

  factory InputFieldValidation.fromJson(Map<String, dynamic> json) {
    return InputFieldValidation(
      minLength: json['min_length'] as int?,
      maxLength: json['max_length'] as int?,
      min: _toDouble(json['min']),
      max: _toDouble(json['max']),
    );
  }

  Map<String, dynamic> toJson() => {
    'min_length': minLength,
    'max_length': maxLength,
    'min': min,
    'max': max,
  };

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is InputFieldValidation &&
        other.minLength == minLength &&
        other.maxLength == maxLength &&
        other.min == min &&
        other.max == max;
  }

  @override
  int get hashCode => Object.hash(minLength, maxLength, min, max);
}

/// 输入字段定义
class InputFieldDefinition {
  const InputFieldDefinition({
    required this.id,
    required this.type,
    required this.label,
    this.description,
    this.required = false,
    this.validation,
    this.options,
    this.defaultValue,
    this.visibility,
  });

  final String id;
  final String type;
  final String label;
  final String? description;
  final bool required;
  final InputFieldValidation? validation;
  final List<String>? options;
  final Object? defaultValue;
  final InputFieldVisibility? visibility;

  factory InputFieldDefinition.fromJson(Map<String, dynamic> json) {
    final validation = json['validation'];
    final options = json['options'];
    final visibility = json['visibility'];

    return InputFieldDefinition(
      id: json['id'] as String,
      type: json['type'] as String,
      label: json['label'] as String,
      description: json['description'] as String?,
      required: json['required'] as bool? ?? false,
      validation: validation is Map<String, dynamic>
          ? InputFieldValidation.fromJson(validation)
          : validation is Map
          ? InputFieldValidation.fromJson(validation.cast<String, dynamic>())
          : null,
      options: options is List
          ? options.map((option) => '$option').toList()
          : null,
      defaultValue: json['default'],
      visibility: visibility is Map<String, dynamic>
          ? InputFieldVisibility.fromJson(visibility)
          : visibility is Map
          ? InputFieldVisibility.fromJson(visibility.cast<String, dynamic>())
          : null,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'type': type,
    'label': label,
    'description': description,
    'required': required,
    'validation': validation?.toJson(),
    'options': options,
    'default': defaultValue,
    'visibility': visibility?.toJson(),
  };

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is InputFieldDefinition &&
        other.id == id &&
        other.type == type &&
        other.label == label &&
        other.description == description &&
        other.required == required &&
        other.validation == validation &&
        listEquals(other.options, options) &&
        other.visibility == visibility &&
        _jsonValueEquals(other.defaultValue, defaultValue);
  }

  @override
  int get hashCode => Object.hash(
    id,
    type,
    label,
    description,
    required,
    validation,
    options == null ? null : Object.hashAll(options!),
    visibility,
    _jsonValueHash(defaultValue),
  );
}

double? _toDouble(Object? value) {
  if (value is num) {
    return value.toDouble();
  }

  return null;
}

bool _jsonValueEquals(Object? left, Object? right) {
  if (identical(left, right)) return true;

  if (left is List && right is List) {
    if (left.length != right.length) return false;
    for (var index = 0; index < left.length; index++) {
      if (!_jsonValueEquals(left[index], right[index])) {
        return false;
      }
    }
    return true;
  }

  if (left is Map && right is Map) {
    if (left.length != right.length) return false;
    for (final entry in left.entries) {
      if (!right.containsKey(entry.key)) {
        return false;
      }
      if (!_jsonValueEquals(entry.value, right[entry.key])) {
        return false;
      }
    }
    return true;
  }

  return left == right;
}

int _jsonValueHash(Object? value) {
  if (value is List) {
    return Object.hashAll(value.map(_jsonValueHash));
  }

  if (value is Map) {
    final sortedKeys = value.keys.map((key) => '$key').toList()..sort();
    return Object.hashAll(
      sortedKeys.map((key) => Object.hash(key, _jsonValueHash(value[key]))),
    );
  }

  return value.hashCode;
}
