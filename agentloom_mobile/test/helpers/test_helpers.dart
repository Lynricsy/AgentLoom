import 'package:agentloom_mobile/features/execution/models/execution_event.dart';
import 'package:agentloom_mobile/features/execution/models/execution_state.dart';
import 'package:agentloom_mobile/features/execution/models/subscribe_ack.dart';
import 'package:agentloom_mobile/features/execution/services/execution_socket_service.dart';
import 'package:agentloom_mobile/features/workflows/models/execution_step_dto.dart';
import 'package:agentloom_mobile/features/workflows/models/input_field_definition.dart';
import 'package:agentloom_mobile/features/workflows/models/workflow_definition_dto.dart';
import 'package:agentloom_mobile/features/workflows/models/execution_summary_dto.dart';
import 'package:agentloom_mobile/features/workflows/models/workflow_input_schema.dart';
import 'package:agentloom_mobile/shared/models/paginated_response.dart';
import 'package:agentloom_mobile/features/workflows/api/workflow_api.dart';
import 'package:dio/dio.dart';
import 'package:mocktail/mocktail.dart';

/// Mock WorkflowApi
class MockWorkflowApi extends Mock implements WorkflowApi {}

/// Mock Dio
class MockDio extends Mock implements Dio {}

/// Mock ExecutionSocketService
class MockExecutionSocketService extends Mock
    implements ExecutionSocketService {}

/// 测试用 InputFieldValidation 工厂
InputFieldValidation createTestInputFieldValidation({
  int? minLength,
  int? maxLength,
  double? min,
  double? max,
}) {
  return InputFieldValidation.fromJson({
    'min_length': minLength,
    'max_length': maxLength,
    'min': min,
    'max': max,
  });
}

/// 测试用 InputFieldDefinition 工厂
InputFieldDefinition createTestInputFieldDefinition({
  String id = 'field-1',
  String type = 'text',
  String label = '测试字段',
  String? description = '这是一个测试字段',
  bool required = false,
  InputFieldValidation? validation,
  List<String>? options,
  Object? defaultValue,
}) {
  return InputFieldDefinition.fromJson({
    'id': id,
    'type': type,
    'label': label,
    'description': description,
    'required': required,
    'validation': validation?.toJson(),
    'options': options,
    'default': defaultValue,
  });
}

/// 测试用 WorkflowInputSchema 工厂
WorkflowInputSchema createTestWorkflowInputSchema({
  int version = 1,
  String collectionMode = 'form',
  List<InputFieldDefinition>? fields,
}) {
  return WorkflowInputSchema.fromJson({
    'version': version,
    'collection_mode': collectionMode,
    'fields': (fields ?? []).map((field) => field.toJson()).toList(),
  });
}

/// 测试用 ExecutionStateSnapshot 工厂
ExecutionStateSnapshot createTestStateSnapshot({
  String executionId = 'exec-test-001',
  String status = 'running',
  int completedSteps = 1,
  int totalSteps = 3,
  List<StepSnapshot>? steps,
  String snapshotAt = '2026-01-01T10:00:00.000Z',
  int? lastEventId = 5,
}) {
  return ExecutionStateSnapshot(
    executionId: executionId,
    status: status,
    completedSteps: completedSteps,
    totalSteps: totalSteps,
    steps:
        steps ??
        [
          const StepSnapshot(
            stepId: 'step-1',
            nodeId: 'node-1',
            nodeName: 'Node 1',
            nodeType: 'agent',
            status: 'completed',
            startedAt: '2026-01-01T10:00:00.000Z',
            completedAt: '2026-01-01T10:01:00.000Z',
          ),
          const StepSnapshot(
            stepId: 'step-2',
            nodeId: 'node-2',
            nodeName: 'Node 2',
            nodeType: 'agent',
            status: 'running',
            startedAt: '2026-01-01T10:01:00.000Z',
          ),
          const StepSnapshot(
            stepId: 'step-3',
            nodeId: 'node-3',
            nodeName: 'Node 3',
            nodeType: 'agent',
            status: 'pending',
          ),
        ],
    snapshotAt: snapshotAt,
    lastEventId: lastEventId,
  );
}

/// 测试用 SubscribeAck 工厂
SubscribeAck createTestSubscribeAck({
  String status = 'subscribed',
  ExecutionStateSnapshot? currentState,
  String? error,
}) {
  return SubscribeAck(
    status: status,
    currentState: currentState ?? createTestStateSnapshot(),
    error: error,
  );
}

/// 测试用 ExecutionEventEnvelope 工厂
ExecutionEventEnvelope createTestEventEnvelope({
  int eventId = 1,
  String event = 'execution.status.changed',
  String timestamp = '2026-01-01T10:00:00.000Z',
  String executionId = 'exec-test-001',
  String? tenantId = 'tenant-1',
  Map<String, dynamic>? data,
}) {
  return ExecutionEventEnvelope(
    eventId: eventId,
    event: event,
    timestamp: timestamp,
    executionId: executionId,
    tenantId: tenantId,
    data: data ?? {'status': 'running'},
  );
}

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
  List<ExecutionStepDto>? steps,
  Map<String, dynamic>? definitionSnapshot,
  Object? errorMessage,
  String? workflowName,
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
    'definition_snapshot': definitionSnapshot,
    'error_message': errorMessage,
    'steps': steps?.map((step) => step.toJson()).toList(),
    'created_at': createdAt,
    'updated_at': updatedAt,
  }).copyWith(workflowName: workflowName);
}

ExecutionStepDto createTestExecutionStep({
  String id = 'step-1',
  String executionId = 'exec-test-001',
  String nodeId = 'node-1',
  int? stepOrder = 1,
  String status = 'completed',
  String? nodeType = 'agent',
  Map<String, dynamic>? nodeData,
  Map<String, dynamic>? result,
  Map<String, dynamic>? checkpointData,
  Object? errorMessage,
  String? startedAt = '2026-01-01T10:00:00.000Z',
  String? completedAt = '2026-01-01T10:01:00.000Z',
  String? createdAt = '2026-01-01T10:00:00.000Z',
  String? updatedAt = '2026-01-01T10:01:00.000Z',
}) {
  return ExecutionStepDto.fromJson({
    'id': id,
    'execution_id': executionId,
    'node_id': nodeId,
    'step_order': stepOrder,
    'status': status,
    'node_type': nodeType,
    'node_data': nodeData ?? {'label': 'Node ${nodeId.toUpperCase()}'},
    'result': result,
    'checkpoint_data': checkpointData,
    'error_message': errorMessage,
    'started_at': startedAt,
    'completed_at': completedAt,
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
