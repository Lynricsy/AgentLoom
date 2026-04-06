import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../routes/route_names.dart';
import '../models/input_field_definition.dart';
import '../providers/workflow_launch_provider.dart';
import '../widgets/conversation_mode_prompt.dart';
import '../widgets/input_field_builder.dart';
import '../widgets/no_params_confirmation.dart';

/// 参数输入页面 — 动态表单
class ParameterInputScreen extends ConsumerStatefulWidget {
  final String workflowId;
  final String workflowName;

  const ParameterInputScreen({
    super.key,
    required this.workflowId,
    required this.workflowName,
  });

  @override
  ConsumerState<ParameterInputScreen> createState() =>
      _ParameterInputScreenState();
}

class _ParameterInputScreenState extends ConsumerState<ParameterInputScreen> {
  final _formKey = GlobalKey<FormState>();
  final _textControllers = <String, TextEditingController>{};
  final _formValues = <String, dynamic>{};
  bool _isSubmitting = false;

  @override
  void dispose() {
    for (final controller in _textControllers.values) {
      controller.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final launchState = ref.watch(workflowLaunchProvider(widget.workflowId));

    ref.listen(workflowLaunchProvider(widget.workflowId), (prev, next) {
      final value = next.value;
      if (value is WorkflowLaunchSuccess && context.mounted) {
        context.pushReplacementNamed(
          RouteNames.executionMonitor,
          pathParameters: {'executionId': value.executionId},
        );
      }
      if (value is WorkflowLaunchError && context.mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(value.message)));
        setState(() => _isSubmitting = false);
      }
    });

    return Scaffold(
      appBar: AppBar(title: Text('运行 ${widget.workflowName}')),
      body: launchState.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                Icons.error_outline,
                size: 48,
                color: Theme.of(context).colorScheme.error,
              ),
              const SizedBox(height: 16),
              Text('加载参数失败', style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 8),
              Text('$error', style: Theme.of(context).textTheme.bodySmall),
              const SizedBox(height: 16),
              TextButton(
                onPressed: () =>
                    ref.invalidate(workflowLaunchProvider(widget.workflowId)),
                child: const Text('重试'),
              ),
            ],
          ),
        ),
        data: (state) {
          final schema = switch (state) {
            final WorkflowLaunchSchemaLoaded s => s.schema,
            final WorkflowLaunchSubmitting s => s.schema,
            final WorkflowLaunchError s => s.schema,
            _ => null,
          };

          if (schema == null) {
            return const Center(child: CircularProgressIndicator());
          }

          if (schema.collectionMode != 'form') {
            return ConversationModePrompt(
              schema: schema,
              onBack: () => Navigator.of(context).pop(),
            );
          }

          final visibleFields = _getVisibleFields(schema.fields);
          if (visibleFields.isEmpty) {
            return NoParamsConfirmation(
              workflowName: widget.workflowName,
              isSubmitting: _isSubmitting || state is WorkflowLaunchSubmitting,
              onConfirm: () => _handleSubmit(schema.fields),
              onCancel: () => Navigator.of(context).pop(),
            );
          }

          return _buildForm(
            allFields: schema.fields,
            visibleFields: visibleFields,
            isSubmitting: state is WorkflowLaunchSubmitting,
          );
        },
      ),
    );
  }

  Widget _buildForm({
    required List<InputFieldDefinition> allFields,
    required List<InputFieldDefinition> visibleFields,
    required bool isSubmitting,
  }) {
    for (final field in visibleFields) {
      if (field.type == 'text' || field.type == 'number') {
        _ensureTextController(field);
      }
    }

    return Form(
      key: _formKey,
      child: Column(
        children: [
          Expanded(
            child: ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: visibleFields.length,
              separatorBuilder: (_, __) => const SizedBox(height: 16),
              itemBuilder: (context, index) {
                final field = visibleFields[index];
                return InputFieldBuilder(
                  field: field,
                  textController: _textControllers[field.id],
                  currentValue: _resolveFieldValue(field),
                  onChanged: (value) {
                    setState(() {
                      _formValues[field.id] = _normalizeFieldValue(
                        field,
                        value,
                      );
                    });
                  },
                );
              },
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: (_isSubmitting || isSubmitting)
                    ? null
                    : () => _handleSubmit(allFields),
                icon: (_isSubmitting || isSubmitting)
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Icon(Icons.play_arrow),
                label: const Text('启动运行'),
              ),
            ),
          ),
        ],
      ),
    );
  }

  TextEditingController _ensureTextController(InputFieldDefinition field) {
    return _textControllers.putIfAbsent(field.id, () {
      final currentValue = _formValues.containsKey(field.id)
          ? _formValues[field.id]
          : field.defaultValue;
      return TextEditingController(
        text: currentValue == null ? '' : '$currentValue',
      );
    });
  }

  List<InputFieldDefinition> _getVisibleFields(
    List<InputFieldDefinition> fields,
  ) {
    final fieldsById = {for (final field in fields) field.id: field};
    final visibilityCache = <String, bool>{};

    bool isVisible(String fieldId, Set<String> path) {
      final cached = visibilityCache[fieldId];
      if (cached != null) {
        return cached;
      }

      final field = fieldsById[fieldId];
      if (field == null) {
        visibilityCache[fieldId] = false;
        return false;
      }

      final visibility = field.visibility;
      if (visibility == null) {
        visibilityCache[fieldId] = true;
        return true;
      }

      if (path.contains(fieldId)) {
        visibilityCache[fieldId] = false;
        return false;
      }

      final nextPath = {...path, fieldId};
      final controllerVisible = isVisible(visibility.fieldId, nextPath);
      if (!controllerVisible) {
        visibilityCache[fieldId] = false;
        return false;
      }

      final controllerField = fieldsById[visibility.fieldId];
      if (controllerField == null) {
        visibilityCache[fieldId] = false;
        return false;
      }

      final resolvedValue = _resolveFieldValue(controllerField);
      final visible = resolvedValue == visibility.equals;
      visibilityCache[fieldId] = visible;
      return visible;
    }

    return fields.where((field) => isVisible(field.id, <String>{})).toList();
  }

  dynamic _resolveFieldValue(InputFieldDefinition field) {
    final sourceValue = _formValues.containsKey(field.id)
        ? _formValues[field.id]
        : field.defaultValue;
    return _normalizeFieldValue(field, sourceValue);
  }

  dynamic _normalizeFieldValue(InputFieldDefinition field, dynamic value) {
    switch (field.type) {
      case 'number':
        if (value is num) {
          return value.toDouble();
        }
        if (value is String) {
          final trimmed = value.trim();
          if (trimmed.isEmpty) {
            return '';
          }
          return double.tryParse(trimmed) ?? value;
        }
        return value;
      case 'text':
        if (value == null) {
          return null;
        }
        return value is String ? value : '$value';
      case 'single_select':
        if (value == null) {
          return null;
        }
        return value is String ? value : '$value';
      case 'multi_select':
        if (value is List) {
          return value.map((item) => '$item').toList();
        }
        return value;
      default:
        return value;
    }
  }

  Future<void> _handleSubmit(List<InputFieldDefinition> allFields) async {
    final formState = _formKey.currentState;
    if (formState != null && !formState.validate()) return;
    setState(() => _isSubmitting = true);

    final visibleFields = _getVisibleFields(allFields);
    final submitValues = <String, dynamic>{};
    for (final field in visibleFields) {
      final value = _resolveFieldValue(field);
      if (value != null && value != '' && !(value is List && value.isEmpty)) {
        submitValues[field.id] = value;
      }
    }

    final executionId = await ref
        .read(workflowLaunchProvider(widget.workflowId).notifier)
        .submit(submitValues);

    if (executionId == null && mounted) {
      setState(() => _isSubmitting = false);
    }
  }
}
