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

    // 监听成功状态，自动导航
    ref.listen(workflowLaunchProvider(widget.workflowId), (prev, next) {
      final value = next.value;
      if (value is WorkflowLaunchSuccess && context.mounted) {
        context.goNamed(
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
          // 从各种状态中提取 schema
          final schema = switch (state) {
            final WorkflowLaunchSchemaLoaded s => s.schema,
            final WorkflowLaunchSubmitting s => s.schema,
            final WorkflowLaunchError s => s.schema,
            _ => null,
          };

          if (schema == null) {
            return const Center(child: CircularProgressIndicator());
          }

          // 对话模式 → 引导到 Web 端
          if (schema.collectionMode == 'conversation') {
            return ConversationModePrompt(
              onBack: () => Navigator.of(context).pop(),
            );
          }

          // 空字段 → 无参数确认
          if (schema.fields.isEmpty) {
            return NoParamsConfirmation(
              workflowName: widget.workflowName,
              isSubmitting: _isSubmitting || state is WorkflowLaunchSubmitting,
              onConfirm: () => _handleSubmit(),
              onCancel: () => Navigator.of(context).pop(),
            );
          }

          // 渲染动态表单
          return _buildForm(schema.fields, state is WorkflowLaunchSubmitting);
        },
      ),
    );
  }

  Widget _buildForm(List<InputFieldDefinition> fields, bool isSubmitting) {
    // 初始化 controllers 和默认值
    for (final field in fields) {
      if (field.type == 'text' || field.type == 'number') {
        if (!_textControllers.containsKey(field.id)) {
          final defaultVal = field.defaultValue;
          final initText = defaultVal != null ? '$defaultVal' : '';
          _textControllers[field.id] = TextEditingController(text: initText);
          if (initText.isNotEmpty) {
            _formValues[field.id] = field.type == 'number'
                ? (double.tryParse(initText) ?? initText)
                : initText;
          }
        }
      } else if (field.type == 'single_select' ||
          field.type == 'multi_select') {
        if (!_formValues.containsKey(field.id)) {
          if (field.defaultValue != null) {
            _formValues[field.id] = field.defaultValue;
          } else if (field.type == 'multi_select') {
            _formValues[field.id] = <String>[];
          }
        }
      }
    }

    return Form(
      key: _formKey,
      child: Column(
        children: [
          Expanded(
            child: ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: fields.length,
              separatorBuilder: (_, __) => const SizedBox(height: 16),
              itemBuilder: (context, index) {
                final field = fields[index];
                return InputFieldBuilder(
                  field: field,
                  textController: _textControllers[field.id],
                  currentValue: _formValues[field.id],
                  onChanged: (value) {
                    setState(() {
                      if (field.type == 'number' && value is String) {
                        _formValues[field.id] = double.tryParse(value) ?? value;
                      } else {
                        _formValues[field.id] = value;
                      }
                    });
                  },
                );
              },
            ),
          ),
          // 底部提交按钮
          Padding(
            padding: const EdgeInsets.all(16),
            child: SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: (_isSubmitting || isSubmitting)
                    ? null
                    : _handleSubmit,
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

  Future<void> _handleSubmit() async {
    final formState = _formKey.currentState;
    if (formState != null && !formState.validate()) return;
    setState(() => _isSubmitting = true);

    // 构建提交数据
    final submitValues = <String, dynamic>{};
    for (final entry in _formValues.entries) {
      if (entry.value != null &&
          entry.value != '' &&
          !(entry.value is List && (entry.value as List).isEmpty)) {
        submitValues[entry.key] = entry.value;
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
