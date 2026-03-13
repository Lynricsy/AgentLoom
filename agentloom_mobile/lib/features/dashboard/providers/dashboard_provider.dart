import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../workflows/api/workflow_api.dart';
import '../../workflows/models/execution_summary_dto.dart';
import '../../workflows/models/workflow_definition_dto.dart';

/// 最近工作流 Provider（Dashboard 用，获取 5 个已发布工作流）
final recentWorkflowsProvider = FutureProvider<List<WorkflowDefinitionDto>>((
  ref,
) async {
  final api = ref.read(workflowApiProvider);
  final result = await api.listWorkflows(pageSize: 5, status: 'published');
  return result.data;
});

DateTime _parseExecutionCreatedAt(ExecutionSummaryDto execution) {
  return DateTime.tryParse(execution.createdAt) ??
      DateTime.fromMillisecondsSinceEpoch(0);
}

/// 最近执行 Provider（Dashboard 用）
final recentExecutionsProvider = FutureProvider<List<ExecutionSummaryDto>>((
  ref,
) async {
  final api = ref.read(workflowApiProvider);
  final workflows = await ref.read(recentWorkflowsProvider.future);

  final executionGroups = await Future.wait(
    workflows.map((workflow) async {
      final result = await api.listExecutions(workflow.id, pageSize: 5);
      return result.data
          .map((execution) => execution.copyWith(workflowName: workflow.name))
          .toList(growable: false);
    }),
  );

  final flattened =
      executionGroups.expand((group) => group).toList(growable: false)..sort(
        (left, right) => _parseExecutionCreatedAt(
          right,
        ).compareTo(_parseExecutionCreatedAt(left)),
      );

  if (flattened.length <= 5) {
    return flattened;
  }

  return flattened.take(5).toList(growable: false);
});
