import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/models/paginated_response.dart';
import '../api/workflow_api.dart';
import '../models/execution_summary_dto.dart';
import '../models/workflow_definition_dto.dart';

/// 工作流详情 Provider（按 ID 获取单个工作流）
final workflowDetailProvider =
    FutureProvider.family<WorkflowDefinitionDto, String>((ref, id) async {
      final api = ref.read(workflowApiProvider);
      return api.getWorkflow(id);
    });

/// 工作流执行记录 Provider（按工作流 ID 获取最近执行）
final workflowExecutionsProvider =
    FutureProvider.family<PaginatedResponse<ExecutionSummaryDto>, String>((
      ref,
      workflowId,
    ) async {
      final api = ref.read(workflowApiProvider);
      return api.listExecutions(workflowId, pageSize: 5);
    });
