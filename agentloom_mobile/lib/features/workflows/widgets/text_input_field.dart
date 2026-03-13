import 'package:flutter/material.dart';

import '../models/input_field_definition.dart';

/// 文本输入字段 Widget
class TextInputField extends StatelessWidget {
  final InputFieldDefinition field;
  final TextEditingController controller;
  final ValueChanged<String> onChanged;

  const TextInputField({
    super.key,
    required this.field,
    required this.controller,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    final maxLength = field.validation?.maxLength;
    final isMultiline = maxLength != null && maxLength > 200;

    return TextFormField(
      controller: controller,
      maxLines: isMultiline ? 5 : 1,
      maxLength: maxLength,
      decoration: InputDecoration(
        labelText: field.label,
        helperText: field.description,
        border: const OutlineInputBorder(),
      ),
      onChanged: onChanged,
      validator: (value) => _validate(value),
      autovalidateMode: AutovalidateMode.onUserInteraction,
    );
  }

  String? _validate(String? value) {
    final trimmed = value?.trim() ?? '';

    if (field.required && trimmed.isEmpty) {
      return '此字段为必填项';
    }

    if (trimmed.isEmpty) return null;

    final minLen = field.validation?.minLength;
    if (minLen != null && trimmed.length < minLen) {
      return '至少需要 $minLen 个字符';
    }

    final maxLen = field.validation?.maxLength;
    if (maxLen != null && trimmed.length > maxLen) {
      return '最多 $maxLen 个字符';
    }

    return null;
  }
}
