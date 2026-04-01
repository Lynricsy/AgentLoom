import 'package:agentloom_mobile/features/execution/lib/workflow_agent_runtime.dart';
import 'package:agentloom_mobile/features/execution/models/execution_runtime.dart';
import 'package:agentloom_mobile/features/execution/models/execution_state.dart';
import 'package:flutter/material.dart';

class ExecutionWaterfall extends StatelessWidget {
  const ExecutionWaterfall({
    super.key,
    required this.snapshot,
    required this.runtime,
    this.onOpenAgentStep,
  });

  final ExecutionStateSnapshot snapshot;
  final ExecutionMonitorRuntimeData runtime;
  final void Function(StepSnapshot step)? onOpenAgentStep;

  @override
  Widget build(BuildContext context) {
    final visibleSteps = _buildVisibleSteps(snapshot, runtime);
    if (visibleSteps.isEmpty) {
      return const Padding(
        padding: EdgeInsets.fromLTRB(16, 8, 16, 24),
        child: _EmptyWaterfallCard(
          title: '等待首个节点启动',
          description: '节点会在真正开始运行后按出现顺序依次加入瀑布流。',
        ),
      );
    }

    return ListView.separated(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      itemCount: visibleSteps.length,
      separatorBuilder: (_, __) => const SizedBox(height: 12),
      itemBuilder: (context, index) {
        final step = visibleSteps[index];
        final runtimeStep = runtime.stepById(step.stepId);
        final isAgent = isWorkflowAgentNodeType(step.nodeType);

        return _ExecutionStepCard(
          step: step,
          runtime: runtimeStep,
          index: index + 1,
          onTap: isAgent && onOpenAgentStep != null
              ? () => onOpenAgentStep!(step)
              : null,
        );
      },
    );
  }
}

List<StepSnapshot> _buildVisibleSteps(
  ExecutionStateSnapshot snapshot,
  ExecutionMonitorRuntimeData runtime,
) {
  final snapshotById = {for (final step in snapshot.steps) step.stepId: step};
  final ordered = <StepSnapshot>[];
  final seen = <String>{};

  for (final stepId in runtime.appearedStepIds) {
    final snapshotStep = snapshotById[stepId];
    if (snapshotStep != null) {
      ordered.add(snapshotStep);
      seen.add(stepId);
      continue;
    }

    final runtimeStep = runtime.stepById(stepId);
    if (runtimeStep == null) {
      continue;
    }
    ordered.add(
      StepSnapshot(
        stepId: runtimeStep.stepId,
        nodeId: runtimeStep.nodeId,
        nodeName: runtimeStep.nodeName,
        nodeType: runtimeStep.nodeType,
        status: runtimeStep.status,
        startedAt: runtimeStep.startedAt,
        completedAt: runtimeStep.completedAt,
        errorMessage: runtimeStep.errorMessage,
        errorDetail: runtimeStep.errorDetail,
        checkpointData: runtimeStep.checkpointData,
        result: runtimeStep.result,
      ),
    );
    seen.add(stepId);
  }

  for (final step in snapshot.steps) {
    if (seen.contains(step.stepId) || !_shouldShowStep(step)) {
      continue;
    }
    ordered.add(step);
    seen.add(step.stepId);
  }

  return ordered;
}

bool _shouldShowStep(StepSnapshot step) {
  return step.status != 'pending' ||
      step.startedAt != null ||
      step.completedAt != null ||
      (step.result?.isNotEmpty ?? false) ||
      (step.checkpointData?.isNotEmpty ?? false);
}

class _ExecutionStepCard extends StatelessWidget {
  const _ExecutionStepCard({
    required this.step,
    required this.runtime,
    required this.index,
    this.onTap,
  });

  final StepSnapshot step;
  final ExecutionRuntimeStep? runtime;
  final int index;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final status = _statusMeta(step.status, theme);
    final isAgent = isWorkflowAgentNodeType(step.nodeType);
    final summary = summarizeExecutionStep(step, runtime);
    final duration = _formatDuration(step.startedAt, step.completedAt);

    return InkWell(
      borderRadius: BorderRadius.circular(24),
      onTap: onTap,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: theme.colorScheme.surfaceContainerLow,
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: status.borderColor),
          boxShadow: [
            BoxShadow(
              color: theme.colorScheme.shadow.withValues(alpha: 0.04),
              blurRadius: 20,
              offset: const Offset(0, 8),
            ),
          ],
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
                    width: 34,
                    height: 34,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: status.badgeColor.withValues(alpha: 0.14),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Text(
                      '$index',
                      style: theme.textTheme.labelLarge?.copyWith(
                        color: status.badgeColor,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          step.nodeName ?? step.nodeId,
                          style: theme.textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          step.nodeType ?? 'node',
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: theme.colorScheme.onSurfaceVariant,
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (isAgent)
                    Icon(
                      Icons.chevron_right_rounded,
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                ],
              ),
              const SizedBox(height: 14),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  _StatusPill(
                    label: status.label,
                    backgroundColor: status.badgeColor.withValues(alpha: 0.14),
                    foregroundColor: status.badgeColor,
                  ),
                  if (duration != null)
                    _StatusPill(
                      label: duration,
                      backgroundColor:
                          theme.colorScheme.surfaceContainerHighest,
                      foregroundColor: theme.colorScheme.onSurfaceVariant,
                    ),
                  if (runtime?.retryAttempt != null &&
                      runtime?.retryMaxAttempts != null)
                    _StatusPill(
                      label:
                          '重试 ${runtime!.retryAttempt}/${runtime!.retryMaxAttempts}',
                      backgroundColor: theme.colorScheme.secondaryContainer,
                      foregroundColor: theme.colorScheme.onSecondaryContainer,
                    ),
                ],
              ),
              const SizedBox(height: 12),
              Text(
                summary,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                  height: 1.45,
                ),
              ),
              if (isAgent) ...[
                const SizedBox(height: 14),
                Row(
                  children: [
                    Icon(
                      Icons.auto_awesome_outlined,
                      size: 18,
                      color: theme.colorScheme.primary,
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        '打开后可查看 Agent 文本流、工具瀑布流、终端与工作区。',
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                      ),
                    ),
                  ],
                ),
              ] else if (runtime != null &&
                  runtime!.fileChanges.isNotEmpty) ...[
                const SizedBox(height: 14),
                Text(
                  '最近变更：${runtime!.fileChanges.last.path}',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                    fontFamily: 'monospace',
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _StatusPill extends StatelessWidget {
  const _StatusPill({
    required this.label,
    required this.backgroundColor,
    required this.foregroundColor,
  });

  final String label;
  final Color backgroundColor;
  final Color foregroundColor;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: backgroundColor,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        child: Text(
          label,
          style: Theme.of(context).textTheme.labelMedium?.copyWith(
            color: foregroundColor,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
    );
  }
}

class _EmptyWaterfallCard extends StatelessWidget {
  const _EmptyWaterfallCard({required this.title, required this.description});

  final String title;
  final String description;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerLow,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: theme.colorScheme.outlineVariant),
      ),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          children: [
            Icon(
              Icons.stream_outlined,
              size: 28,
              color: theme.colorScheme.onSurfaceVariant,
            ),
            const SizedBox(height: 12),
            Text(
              title,
              style: theme.textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.w800,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text(
              description,
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
                height: 1.45,
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}

({String label, Color badgeColor, Color borderColor}) _statusMeta(
  String status,
  ThemeData theme,
) {
  return switch (status) {
    'running' => (
      label: '运行中',
      badgeColor: theme.colorScheme.primary,
      borderColor: theme.colorScheme.primary.withValues(alpha: 0.32),
    ),
    'queued' => (
      label: '排队中',
      badgeColor: theme.colorScheme.tertiary,
      borderColor: theme.colorScheme.tertiary.withValues(alpha: 0.3),
    ),
    'completed' => (
      label: '已完成',
      badgeColor: Colors.green.shade700,
      borderColor: Colors.green.shade200,
    ),
    'failed' => (
      label: '失败',
      badgeColor: theme.colorScheme.error,
      borderColor: theme.colorScheme.error.withValues(alpha: 0.35),
    ),
    'cancelled' => (
      label: '已取消',
      badgeColor: theme.colorScheme.outline,
      borderColor: theme.colorScheme.outlineVariant,
    ),
    'skipped' => (
      label: '已跳过',
      badgeColor: theme.colorScheme.outline,
      borderColor: theme.colorScheme.outlineVariant,
    ),
    'waiting_intervention' => (
      label: '等待人工',
      badgeColor: Colors.orange.shade700,
      borderColor: Colors.orange.shade200,
    ),
    _ => (
      label: '待开始',
      badgeColor: theme.colorScheme.outline,
      borderColor: theme.colorScheme.outlineVariant,
    ),
  };
}

String? _formatDuration(String? startedAt, String? completedAt) {
  final started = startedAt == null ? null : DateTime.tryParse(startedAt);
  if (started == null) {
    return null;
  }

  final ended = completedAt == null
      ? DateTime.now()
      : DateTime.tryParse(completedAt);
  if (ended == null) {
    return null;
  }

  final duration = ended.difference(started);
  if (duration.inHours > 0) {
    return '${duration.inHours}h ${duration.inMinutes.remainder(60)}m';
  }
  if (duration.inMinutes > 0) {
    return '${duration.inMinutes}m ${duration.inSeconds.remainder(60)}s';
  }
  return '${duration.inSeconds}s';
}
