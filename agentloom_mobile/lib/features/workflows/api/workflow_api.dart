import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../agents/models/conversation_message_dto.dart';
import '../../../shared/models/paginated_response.dart';
import '../../../shared/providers/api_client_provider.dart';
import '../../../shared/utils/json_key_normalizer.dart';
import '../models/execution_summary_dto.dart';
import '../models/workflow_definition_dto.dart';
import '../models/workflow_input_schema.dart';

/// 工作流 API 客户端
class WorkflowApi {
  final Dio _dio;

  WorkflowApi(this._dio);

  /// 获取工作流列表（分页 + 筛选）
  Future<PaginatedResponse<WorkflowDefinitionDto>> listWorkflows({
    int page = 1,
    int pageSize = 20,
    String? status,
    String? sourceKind,
    String? search,
  }) async {
    final queryParams = <String, dynamic>{'page': page, 'pageSize': pageSize};
    if (status != null) queryParams['status'] = status;
    if (sourceKind != null && sourceKind.isNotEmpty) {
      queryParams['sourceKind'] = sourceKind;
    }
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

  Future<void> convertSourceToManual(String workflowId) async {
    await _dio.post(
      '/api/v1/resource-sources/workflow_definition/$workflowId/convert-to-manual',
      data: const <String, dynamic>{},
    );
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

  /// 获取工作流输入参数 Schema
  Future<WorkflowInputSchema> getInputSchema(String workflowId) async {
    final response = await _dio.get(
      '/api/v1/workflow-definitions/$workflowId/input-schema',
    );
    final body = response.data as Map<String, dynamic>;
    final data = body['data'] as Map<String, dynamic>;
    return WorkflowInputSchema.fromJson(normalizeJsonMap(data));
  }

  /// 触发执行工作流
  Future<Map<String, dynamic>> runWorkflow(
    String workflowId, {
    Map<String, dynamic>? inputParams,
    int? schemaVersion,
    String? launchSource,
  }) async {
    final body = <String, dynamic>{};
    if (inputParams != null) body['inputParams'] = inputParams;
    if (schemaVersion != null) body['schemaVersion'] = schemaVersion;
    if (launchSource != null) body['launchSource'] = launchSource;

    final response = await _dio.post(
      '/api/v1/workflow-definitions/$workflowId/run',
      data: body.isNotEmpty ? body : const <String, dynamic>{},
    );
    return response.data as Map<String, dynamic>;
  }

  /// 获取单次执行详情（用于 REST 初始快照 + 轮询降级）
  Future<ExecutionSummaryDto> getExecution(String executionId) async {
    final response = await _dio.get('/api/v1/executions/$executionId');
    final body = response.data as Map<String, dynamic>;
    return ExecutionSummaryDto.fromJson(body['data'] as Map<String, dynamic>);
  }

  Future<List<WorkspaceFileNode>> getExecutionStepWorkspaceTree(
    String executionId,
    String stepId,
  ) async {
    final response = await _dio.get(
      '/api/v1/executions/$executionId/steps/$stepId/workspace/tree',
    );
    final body = response.data;
    if (body is! List) {
      return const <WorkspaceFileNode>[];
    }

    return body
        .whereType<Map<Object?, Object?>>()
        .map(
          (node) => WorkspaceFileNode.fromJson(
            node.map((key, value) => MapEntry('$key', value)),
          ),
        )
        .toList(growable: false);
  }

  Future<WorkspaceFileContent> getExecutionStepWorkspaceFile(
    String executionId,
    String stepId,
    String filePath,
  ) async {
    final encodedPath = Uri.encodeComponent(
      filePath,
    ).replaceAll('%2F', '/').replaceAll('%5C', '/');
    final response = await _dio.get(
      '/api/v1/executions/$executionId/steps/$stepId/workspace/files/$encodedPath',
    );

    final body = response.data as Map<String, dynamic>;
    return WorkspaceFileContent.fromJson(body);
  }

}

/// 工作流 API Provider
final workflowApiProvider = Provider<WorkflowApi>((ref) {
  final dio = ref.watch(apiClientProvider);
  return WorkflowApi(dio);
});
