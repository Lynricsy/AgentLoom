import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/models/paginated_response.dart';
import '../../../shared/providers/api_client_provider.dart';
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

  /// 获取工作流输入参数 Schema
  Future<WorkflowInputSchema> getInputSchema(String workflowId) async {
    final response = await _dio.get(
      '/api/v1/workflow-definitions/$workflowId/input-schema',
    );
    final body = response.data as Map<String, dynamic>;
    final data = body['data'] as Map<String, dynamic>;
    return WorkflowInputSchema.fromJson(_normalizeInputSchema(data));
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
      data: body.isNotEmpty ? body : null,
    );
    return response.data as Map<String, dynamic>;
  }

  /// 获取单次执行详情（用于 REST 初始快照 + 轮询降级）
  Future<ExecutionSummaryDto> getExecution(String executionId) async {
    final response = await _dio.get('/api/v1/executions/$executionId');
    final body = response.data as Map<String, dynamic>;
    return ExecutionSummaryDto.fromJson(body['data'] as Map<String, dynamic>);
  }

  Map<String, dynamic> _normalizeInputSchema(Map<String, dynamic> payload) {
    final normalized = Map<String, dynamic>.from(payload);

    final collectionMode =
        normalized['collection_mode'] ?? normalized['collectionMode'];
    if (collectionMode != null) {
      normalized['collection_mode'] = collectionMode;
    }

    final fields = normalized['fields'];
    if (fields is List) {
      normalized['fields'] = fields.map((field) {
        if (field is! Map) {
          return field;
        }

        final normalizedField = Map<String, dynamic>.from(
          field.cast<String, dynamic>(),
        );
        final validation = normalizedField['validation'];

        if (validation is Map) {
          final normalizedValidation = Map<String, dynamic>.from(
            validation.cast<String, dynamic>(),
          );

          final minLength =
              normalizedValidation['min_length'] ??
              normalizedValidation['minLength'];
          final maxLength =
              normalizedValidation['max_length'] ??
              normalizedValidation['maxLength'];

          if (minLength != null) {
            normalizedValidation['min_length'] = minLength;
          }
          if (maxLength != null) {
            normalizedValidation['max_length'] = maxLength;
          }

          normalizedField['validation'] = normalizedValidation;
        }

        final visibility = normalizedField['visibility'];
        if (visibility is Map) {
          final normalizedVisibility = Map<String, dynamic>.from(
            visibility.cast<String, dynamic>(),
          );
          final fieldId =
              normalizedVisibility['fieldId'] ??
              normalizedVisibility['field_id'];

          if (fieldId != null) {
            normalizedVisibility['fieldId'] = fieldId;
          }

          normalizedField['visibility'] = normalizedVisibility;
        }

        return normalizedField;
      }).toList();
    }

    return normalized;
  }
}

/// 工作流 API Provider
final workflowApiProvider = Provider<WorkflowApi>((ref) {
  final dio = ref.watch(apiClientProvider);
  return WorkflowApi(dio);
});
