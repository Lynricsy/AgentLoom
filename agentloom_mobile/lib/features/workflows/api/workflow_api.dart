import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/models/paginated_response.dart';
import '../../../shared/providers/api_client_provider.dart';
import '../models/execution_summary_dto.dart';
import '../models/workflow_definition_dto.dart';

/// 工作流 API 客户端
class WorkflowApi {
  final Dio _dio;

  WorkflowApi(this._dio);

  /// 获取工作流列表（分页 + 筛选）
  Future<PaginatedResponse<WorkflowDefinitionDto>> listWorkflows({
    int page = 1,
    int pageSize = 20,
    String? status,
    String? search,
  }) async {
    final queryParams = <String, dynamic>{'page': page, 'pageSize': pageSize};
    if (status != null) queryParams['status'] = status;
    if (search != null && search.isNotEmpty) queryParams['search'] = search;

    final response = await _dio.get(
      '/api/v1/workflow-definitions',
      queryParameters: queryParams,
    );

    return PaginatedResponse<WorkflowDefinitionDto>.fromJson(
      response.data as Map<String, dynamic>,
      (json) => WorkflowDefinitionDto.fromJson(json! as Map<String, dynamic>),
    );
  }

  /// 获取单个工作流详情
  Future<WorkflowDefinitionDto> getWorkflow(String id) async {
    final response = await _dio.get('/api/v1/workflow-definitions/$id');
    final body = response.data as Map<String, dynamic>;
    return WorkflowDefinitionDto.fromJson(body['data'] as Map<String, dynamic>);
  }

  /// 获取工作流的执行记录列表
  Future<PaginatedResponse<ExecutionSummaryDto>> listExecutions(
    String workflowId, {
    int page = 1,
    int pageSize = 5,
  }) async {
    final response = await _dio.get(
      '/api/v1/workflow-definitions/$workflowId/executions',
      queryParameters: {'page': page, 'pageSize': pageSize},
    );

    return PaginatedResponse<ExecutionSummaryDto>.fromJson(
      response.data as Map<String, dynamic>,
      (json) => ExecutionSummaryDto.fromJson(json! as Map<String, dynamic>),
    );
  }

  /// 触发执行工作流
  Future<Map<String, dynamic>> runWorkflow(String workflowId) async {
    final response = await _dio.post(
      '/api/v1/workflow-definitions/$workflowId/run',
    );
    return response.data as Map<String, dynamic>;
  }
}

/// 工作流 API Provider
final workflowApiProvider = Provider<WorkflowApi>((ref) {
  final dio = ref.watch(apiClientProvider);
  return WorkflowApi(dio);
});
