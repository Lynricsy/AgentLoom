import 'package:flutter/material.dart';

import '../models/input_field_definition.dart';

/// 单选下拉字段 Widget
class SingleSelectField extends StatelessWidget {
  final InputFieldDefinition field;
  final String? currentValue;
  final ValueChanged<String?> onChanged;

  const SingleSelectField({
    super.key,
    required this.field,
    required this.currentValue,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    final options = field.options ?? [];

    return DropdownButtonFormField<String>(
      initialValue: currentValue,
      decoration: InputDecoration(
        labelText: field.label,
        helperText: field.description,
        border: const OutlineInputBorder(),
      ),
      items: options
          .map((opt) => DropdownMenuItem(value: opt, child: Text(opt)))
          .toList(),
      onChanged: onChanged,
      validator: (value) {
        if (field.required && (value == null || value.isEmpty)) {
          return '此字段为必填项';
        }
        return null;
      },
      autovalidateMode: AutovalidateMode.onUserInteraction,
    );
  }
}
