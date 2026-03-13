import 'package:flutter/material.dart';

import '../models/input_field_definition.dart';
import 'multi_select_field.dart';
import 'number_input_field.dart';
import 'single_select_field.dart';
import 'text_input_field.dart';

/// 根据字段类型分发对应 Widget
class InputFieldBuilder extends StatelessWidget {
  final InputFieldDefinition field;
  final TextEditingController? textController;
  final dynamic currentValue;
  final ValueChanged<dynamic> onChanged;

  const InputFieldBuilder({
    super.key,
    required this.field,
    this.textController,
    required this.currentValue,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return switch (field.type) {
      'text' => TextInputField(
        field: field,
        controller: textController!,
        onChanged: (v) => onChanged(v),
      ),
      'number' => NumberInputField(
        field: field,
        controller: textController!,
        onChanged: (v) => onChanged(v),
      ),
      'single_select' => SingleSelectField(
        field: field,
        currentValue: currentValue as String?,
        onChanged: (v) => onChanged(v),
      ),
      'multi_select' => MultiSelectField(
        field: field,
        selectedValues: (currentValue is List)
            ? (currentValue as List).cast<String>()
            : <String>[],
        onChanged: (v) => onChanged(v),
      ),
      _ => const SizedBox.shrink(),
    };
  }
}
