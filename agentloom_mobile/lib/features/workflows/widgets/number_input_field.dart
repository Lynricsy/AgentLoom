import 'package:flutter/material.dart';

import '../models/input_field_definition.dart';

/// 数字输入字段 Widget
class NumberInputField extends StatelessWidget {
  final InputFieldDefinition field;
  final TextEditingController controller;
  final ValueChanged<String> onChanged;

  const NumberInputField({
    super.key,
    required this.field,
    required this.controller,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: controller,
      keyboardType: const TextInputType.numberWithOptions(decimal: true),
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

    final number = double.tryParse(trimmed);
    if (number == null) {
      return '请输入有效数字';
    }

    final min = field.validation?.min;
    if (min != null && number < min) {
      return '不能小于 ${_formatNumber(min)}';
    }

    final max = field.validation?.max;
    if (max != null && number > max) {
      return '不能大于 ${_formatNumber(max)}';
    }

    return null;
  }

  String _formatNumber(double n) {
    return n == n.truncateToDouble() ? n.toInt().toString() : n.toString();
  }
}
