import 'package:agentloom_mobile/features/workflows/models/workflow_definition_dto.dart';
import 'package:agentloom_mobile/features/workflows/models/execution_summary_dto.dart';
import 'package:agentloom_mobile/shared/models/paginated_response.dart';
import 'package:agentloom_mobile/features/workflows/api/workflow_api.dart';
import 'package:dio/dio.dart';
import 'package:mocktail/mocktail.dart';

/// Mock WorkflowApi
class MockWorkflowApi extends Mock implements WorkflowApi {}

/// Mock Dio
class MockDio extends Mock implements Dio {}

/// 测试用 WorkflowDefinitionDto 工厂
WorkflowDefinitionDto createTestWorkflow({
  String id = 'wf-test-001',
  String name = 'Test Workflow',
  String slug = 'test-workflow',
  String? description = 'A test workflow description',
  String status = 'published',
  int version = 1,
  Map<String, dynamic>? metadata,
  String? createdBy = 'user-001',
  String? updatedBy = 'user-001',
  String createdAt = '2026-01-01T00:00:00.000Z',
  String updatedAt = '2026-01-02T00:00:00.000Z',
}) {
  return WorkflowDefinitionDto.fromJson({
    'id': id,
    'name': name,
    'slug': slug,
    'description': description,
    'status': status,
    'version': version,
    'metadata': metadata,
    'created_by': createdBy,
    'updated_by': updatedBy,
    'created_at': createdAt,
    'updated_at': updatedAt,
  });
}

/// 测试用 ExecutionSummaryDto 工厂
ExecutionSummaryDto createTestExecution({
  String id = 'exec-test-001',
  String workflowId = 'wf-test-001',
  String status = 'completed',
  String? triggerType = 'manual',
  int? totalSteps = 3,
  int? completedSteps = 3,
  String? startedAt = '2026-01-01T10:00:00.000Z',
  String? completedAt = '2026-01-01T10:05:00.000Z',
  String? failedAt,
  String createdAt = '2026-01-01T10:00:00.000Z',
  String updatedAt = '2026-01-01T10:05:00.000Z',
}) {
  return ExecutionSummaryDto.fromJson({
    'id': id,
    'workflow_id': workflowId,
    'status': status,
    'trigger_type': triggerType,
    'total_steps': totalSteps,
    'completed_steps': completedSteps,
    'started_at': startedAt,
    'completed_at': completedAt,
    'failed_at': failedAt,
    'created_at': createdAt,
    'updated_at': updatedAt,
  });
}

/// 测试用 PaginatedResponse 工厂
PaginatedResponse<WorkflowDefinitionDto> createTestWorkflowList({
  List<WorkflowDefinitionDto>? workflows,
  int total = 2,
  int page = 1,
  int pageSize = 20,
  int totalPages = 1,
}) {
  return PaginatedResponse(
    data:
        workflows ??
        [
          createTestWorkflow(id: 'wf-1', name: 'Workflow 1'),
          createTestWorkflow(id: 'wf-2', name: 'Workflow 2', status: 'draft'),
        ],
    meta: PaginationMeta(
      total: total,
      page: page,
      pageSize: pageSize,
      totalPages: totalPages,
    ),
  );
}

PaginatedResponse<ExecutionSummaryDto> createTestExecutionList({
  List<ExecutionSummaryDto>? executions,
  int total = 2,
  int page = 1,
  int pageSize = 5,
  int totalPages = 1,
}) {
  return PaginatedResponse(
    data:
        executions ??
        [
          createTestExecution(id: 'exec-1'),
          createTestExecution(
            id: 'exec-2',
            status: 'failed',
            completedSteps: 1,
            failedAt: '2026-01-01T10:02:00.000Z',
            completedAt: null,
          ),
        ],
    meta: PaginationMeta(
      total: total,
      page: page,
      pageSize: pageSize,
      totalPages: totalPages,
    ),
  );
}
