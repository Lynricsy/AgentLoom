import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../workflows/api/workflow_api.dart';
import '../../workflows/models/workflow_definition_dto.dart';

/// 最近工作流 Provider（Dashboard 用，获取 5 个已发布工作流）
final recentWorkflowsProvider = FutureProvider<List<WorkflowDefinitionDto>>((
  ref,
) async {
  final api = ref.read(workflowApiProvider);
  final result = await api.listWorkflows(pageSize: 5, status: 'published');
  return result.data;
});
