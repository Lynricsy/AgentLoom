import 'package:flutter/material.dart';

import '../models/input_field_definition.dart';

/// 多选 FilterChip 字段 Widget
class MultiSelectField extends StatelessWidget {
  final InputFieldDefinition field;
  final List<String> selectedValues;
  final ValueChanged<List<String>> onChanged;

  const MultiSelectField({
    super.key,
    required this.field,
    required this.selectedValues,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    final options = field.options ?? [];
    final theme = Theme.of(context);

    return FormField<List<String>>(
      initialValue: selectedValues,
      validator: (value) {
        if (field.required && (value == null || value.isEmpty)) {
          return '至少需要选择一项';
        }
        return null;
      },
      autovalidateMode: AutovalidateMode.onUserInteraction,
      builder: (state) {
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              field.label,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
            if (field.description != null) ...[
              const SizedBox(height: 4),
              Text(
                field.description!,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
            ],
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 4,
              children: options.map((option) {
                final isSelected = selectedValues.contains(option);
                return FilterChip(
                  label: Text(option),
                  selected: isSelected,
                  onSelected: (selected) {
                    final newValues = List<String>.from(selectedValues);
                    if (selected) {
                      newValues.add(option);
                    } else {
                      newValues.remove(option);
                    }
                    onChanged(newValues);
                    state.didChange(newValues);
                  },
                );
              }).toList(),
            ),
            if (state.hasError) ...[
              const SizedBox(height: 8),
              Text(
                state.errorText!,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.error,
                ),
              ),
            ],
          ],
        );
      },
    );
  }
}
