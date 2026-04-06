import 'package:agentloom_mobile/features/execution/lib/output_content.dart';
import 'package:agentloom_mobile/features/execution/lib/workflow_agent_runtime.dart';
import 'package:agentloom_mobile/features/execution/models/execution_runtime.dart';
import 'package:agentloom_mobile/features/execution/models/execution_state.dart';
import 'package:agentloom_mobile/features/execution/providers/execution_monitor_provider.dart';
import 'package:agentloom_mobile/features/execution/widgets/output_content_view.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

class WorkflowOutputViewerScreen extends ConsumerWidget {
  const WorkflowOutputViewerScreen({
    super.key,
    required this.executionId,
    required this.stepId,
  });

  final String executionId;
  final String stepId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final monitorAsync = ref.watch(executionMonitorProvider(executionId));

    return Scaffold(
      appBar: AppBar(title: const Text('输出详情')),
      body: monitorAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) =>
            _OutputViewerErrorState(message: '加载执行详情失败：$error'),
        data: (state) => _buildStateView(context, state),
      ),
    );
  }

  Widget _buildStateView(BuildContext context, ExecutionMonitorState state) {
    final snapshot = extractMonitorSnapshot(state);
    if (snapshot == null) {
      return const _OutputViewerErrorState(message: '当前执行尚未生成可读取的快照。');
    }

    final step = snapshot.steps
        .where((item) => item.stepId == stepId)
        .cast<StepSnapshot?>()
        .firstWhere((item) => item != null, orElse: () => null);
    if (step == null || !isWorkflowOutputNodeType(step.nodeType)) {
      return const _OutputViewerErrorState(message: '该节点不是可查看的输出步骤。');
    }

    final runtime = extractMonitorRuntime(state);
    final runtimeStep = runtime.stepById(step.stepId);
    final format = getWorkflowOutputFormat(step.nodeType);
    final output = extractWorkflowOutputText(step, runtimeStep);
    final jsonValue = extractWorkflowJsonValue(step, runtimeStep);

    return LayoutBuilder(
      builder: (context, constraints) {
        return Align(
          alignment: Alignment.topCenter,
          child: ConstrainedBox(
            constraints: BoxConstraints(
              maxWidth: constraints.maxWidth >= 960 ? 960 : double.infinity,
            ),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
              children: [
                _OutputViewerHeader(
                  step: step,
                  runtime: runtimeStep,
                  connectionMode: extractMonitorConnectionMode(state),
                  format: format,
                ),
                const SizedBox(height: 16),
                _OutputCapabilityCard(format: format),
                const SizedBox(height: 16),
                ExecutionOutputContentView(
                  format: format,
                  output: output,
                  jsonValue: jsonValue,
                  isStreaming: runtimeStep?.isStreaming ?? false,
                  placeholder: '该输出节点尚未产出内容。',
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _OutputViewerHeader extends StatelessWidget {
  const _OutputViewerHeader({
    required this.step,
    required this.runtime,
    required this.connectionMode,
    required this.format,
  });

  final StepSnapshot step;
  final ExecutionRuntimeStep? runtime;
  final ConnectionMode connectionMode;
  final WorkflowOutputFormat format;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final summary = summarizeExecutionStep(step, runtime);

    return DecoratedBox(
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerLow,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: theme.colorScheme.outlineVariant),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 40,
                  height: 40,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: theme.colorScheme.primaryContainer,
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Icon(
                    format == WorkflowOutputFormat.json
                        ? Icons.data_object_rounded
                        : Icons.article_outlined,
                    color: theme.colorScheme.onPrimaryContainer,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        step.nodeName ?? '输出节点',
                        style: theme.textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        step.nodeType ?? 'output',
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            Text(
              summary,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
                height: 1.5,
              ),
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                _HeaderPill(icon: Icons.bolt_outlined, label: step.status),
                _HeaderPill(
                  icon: Icons.sensors_outlined,
                  label: connectionMode.label,
                ),
                if (_formatDuration(step.startedAt, step.completedAt)
                    case final duration?)
                  _HeaderPill(icon: Icons.schedule_outlined, label: duration),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _HeaderPill extends StatelessWidget {
  const _HeaderPill({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 16, color: theme.colorScheme.onSurfaceVariant),
            const SizedBox(width: 6),
            Text(
              label,
              style: theme.textTheme.labelMedium?.copyWith(
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _OutputCapabilityCard extends StatelessWidget {
  const _OutputCapabilityCard({required this.format});

  final WorkflowOutputFormat format;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final title = switch (format) {
      WorkflowOutputFormat.markdown => 'Markdown 富渲染',
      WorkflowOutputFormat.json => '结构化 JSON 渲染',
      WorkflowOutputFormat.plain => '原文输出',
    };
    final description = switch (format) {
      WorkflowOutputFormat.markdown =>
        '支持 Markdown、LaTeX、Mermaid 和代码块，适合长文本、公式与图表输出。',
      WorkflowOutputFormat.json => '优先展示可折叠 JSON 结构；流式中间态或非法 JSON 会自动回退为原文。',
      WorkflowOutputFormat.plain => '按原文展示输出内容，保留多行与复制能力。',
    };

    return DecoratedBox(
      decoration: BoxDecoration(
        color: theme.colorScheme.secondaryContainer,
        borderRadius: BorderRadius.circular(24),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(
              Icons.auto_awesome_outlined,
              color: theme.colorScheme.onSecondaryContainer,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: theme.textTheme.titleSmall?.copyWith(
                      color: theme.colorScheme.onSecondaryContainer,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    description,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSecondaryContainer,
                      height: 1.45,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _OutputViewerErrorState extends StatelessWidget {
  const _OutputViewerErrorState({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.error_outline, color: theme.colorScheme.error, size: 36),
            const SizedBox(height: 12),
            Text(
              message,
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

String? _formatDuration(String? startedAt, String? completedAt) {
  final start = startedAt == null ? null : DateTime.tryParse(startedAt);
  final end = completedAt == null ? null : DateTime.tryParse(completedAt);
  if (start == null) {
    return null;
  }

  final effectiveEnd = end ?? DateTime.now().toUtc();
  final diff = effectiveEnd.difference(start.toUtc());
  if (diff.inSeconds < 1) {
    return '${diff.inMilliseconds} ms';
  }
  if (diff.inMinutes < 1) {
    return '${diff.inSeconds} s';
  }
  if (diff.inHours < 1) {
    final seconds = diff.inSeconds % 60;
    return '${diff.inMinutes}m ${seconds}s';
  }
  final minutes = diff.inMinutes % 60;
  return '${diff.inHours}h ${minutes}m';
}
