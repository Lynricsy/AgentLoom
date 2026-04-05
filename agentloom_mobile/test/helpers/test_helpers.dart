import 'package:agentloom_mobile/features/agents/api/agent_api.dart';
import 'package:agentloom_mobile/features/agents/models/agent_definition_dto.dart';
import 'package:agentloom_mobile/features/agents/models/agent_conversation_dto.dart';
import 'package:agentloom_mobile/features/agents/models/conversation_message_dto.dart';
import 'package:agentloom_mobile/features/execution/models/execution_event.dart';
import 'package:agentloom_mobile/features/execution/models/execution_state.dart';
import 'package:agentloom_mobile/features/execution/models/subscribe_ack.dart';
import 'package:agentloom_mobile/features/execution/services/execution_socket_service.dart';
import 'package:agentloom_mobile/features/memory/api/memory_api.dart';
import 'package:agentloom_mobile/features/memory/models/memory_instance.dart';
import 'package:agentloom_mobile/features/memory/models/memory_node.dart';
import 'package:agentloom_mobile/features/memory/models/memory_audit_entry.dart';
import 'package:agentloom_mobile/features/memory/models/memory_version.dart';
import 'package:agentloom_mobile/features/resources/api/resources_api.dart';
import 'package:agentloom_mobile/features/workflows/models/execution_step_dto.dart';
import 'package:agentloom_mobile/features/workflows/models/conversation_plan.dart';
import 'package:agentloom_mobile/features/workflows/models/input_field_definition.dart';
import 'package:agentloom_mobile/features/workflows/models/workflow_definition_dto.dart';
import 'package:agentloom_mobile/features/workflows/models/execution_summary_dto.dart';
import 'package:agentloom_mobile/features/workflows/models/workflow_input_schema.dart';
import 'package:agentloom_mobile/shared/models/paginated_response.dart';
import 'package:agentloom_mobile/features/workflows/api/workflow_api.dart';
import 'package:dio/dio.dart';
import 'package:mocktail/mocktail.dart';

/// Mock AgentApi
class MockAgentApi extends Mock implements AgentApi {}

/// Mock MemoryApi
class MockMemoryApi extends Mock implements MemoryApi {}

/// Mock WorkflowApi
class MockWorkflowApi extends Mock implements WorkflowApi {}

/// Mock ResourcesApi
class MockResourcesApi extends Mock implements ResourcesApi {}

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

/// 测试用 InputFieldVisibility 工厂
InputFieldVisibility createTestInputFieldVisibility({
  String fieldId = 'field-1',
  Object? equals,
}) {
  return InputFieldVisibility.fromJson({'field_id': fieldId, 'equals': equals});
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
  InputFieldVisibility? visibility,
  String? collectionHint,
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
    'visibility': visibility?.toJson(),
    'collection_hint': collectionHint,
  });
}

/// 测试用 WorkflowInputSchema 工厂
WorkflowInputSchema createTestWorkflowInputSchema({
  int version = 1,
  String collectionMode = 'form',
  List<InputFieldDefinition>? fields,
  ConversationPlan? conversationPlan,
}) {
  return WorkflowInputSchema(
    version: version,
    collectionMode: collectionMode,
    fields: fields ?? const [],
    conversationPlan: conversationPlan,
  );
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
  int? publishedReleaseNumber,
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
    'published_release_number': publishedReleaseNumber,
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

/// 测试用 AgentDefinitionDto 工厂
AgentDefinitionDto createTestAgent({
  String id = 'agent-test-001',
  String organizationId = 'org-001',
  String name = 'Test Agent',
  String? slug,
  String? description = 'A test agent for unit tests',
  String status = 'published',
  String runtimeMode = 'sandbox',
  String? systemPrompt,
  String? modelId = 'gpt-4',
  String? autonomyMode = 'semi_autonomous',
  int? maxIterations = 10,
  int? timeoutSeconds = 300,
  int? version = 1,
  String? workspaceSnapshotId,
  String createdAt = '2026-01-01T00:00:00.000Z',
  String updatedAt = '2026-01-01T00:00:00.000Z',
  List<Map<String, dynamic>> nodes = const [],
}) {
  return AgentDefinitionDto(
    id: id,
    organizationId: organizationId,
    name: name,
    slug: slug ?? name.toLowerCase().replaceAll(' ', '-'),
    description: description,
    status: status,
    runtimeMode: runtimeMode,
    systemPrompt: systemPrompt,
    modelId: modelId,
    autonomyMode: autonomyMode,
    maxIterations: maxIterations,
    timeoutSeconds: timeoutSeconds,
    version: version,
    workspaceSnapshotId: workspaceSnapshotId,
    createdAt: createdAt,
    updatedAt: updatedAt,
    nodes: nodes,
  );
}

/// 测试用 Agent 分页列表工厂
PaginatedResponse<AgentDefinitionDto> createTestAgentList({
  List<AgentDefinitionDto>? agents,
  int total = 2,
  int page = 1,
  int pageSize = 20,
  int totalPages = 1,
}) {
  return PaginatedResponse(
    data:
        agents ??
        [
          createTestAgent(id: 'agent-1', name: 'Agent Alpha'),
          createTestAgent(
            id: 'agent-2',
            name: 'Agent Beta',
            status: 'draft',
            description: 'Beta agent description',
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

/// 测试用 AgentConversationDto 工厂
AgentConversationDto createTestConversation({
  String id = 'conv-001',
  String agentDefinitionId = 'agent-test-001',
  String organizationId = 'org-001',
  String status = 'active',
  String? title = 'Test Conversation',
  String createdAt = '2026-01-01T00:00:00.000Z',
  String updatedAt = '2026-01-01T00:00:00.000Z',
  String? createdBy,
}) {
  return AgentConversationDto(
    id: id,
    agentDefinitionId: agentDefinitionId,
    organizationId: organizationId,
    status: status,
    title: title,
    createdAt: createdAt,
    updatedAt: updatedAt,
    createdBy: createdBy,
  );
}

/// 测试用 ConversationMessageDto 工厂
ConversationMessageDto createTestMessage({
  String id = 'msg-001',
  String conversationId = 'conv-001',
  MessageRole role = MessageRole.user,
  required String content,
  String createdAt = '2026-01-01T00:00:00.000Z',
}) {
  return ConversationMessageDto(
    id: id,
    conversationId: conversationId,
    role: role,
    content: content,
    createdAt: createdAt,
    segments: <MessageSegment>[MessageSegment.text(content)],
  );
}

// ==================== Memory 测试工厂 ====================

/// 测试用 MemoryInstanceDto 工厂
MemoryInstanceDto createTestMemoryInstance({
  String id = 'mem-inst-1',
  String name = 'Test Memory',
  String? description = 'A test memory instance',
  Map<String, dynamic>? config,
  String status = 'active',
  int nodeCount = 5,
  int edgeCount = 3,
  String createdAt = '2026-01-01T00:00:00.000Z',
  String updatedAt = '2026-01-15T12:00:00.000Z',
}) {
  return MemoryInstanceDto(
    id: id,
    name: name,
    description: description,
    config: config ?? {'type': 'knowledge_graph'},
    status: status,
    nodeCount: nodeCount,
    edgeCount: edgeCount,
    createdAt: createdAt,
    updatedAt: updatedAt,
  );
}

/// 测试用 MemoryInstanceDto 列表工厂
List<MemoryInstanceDto> createTestMemoryInstanceList({int count = 3}) {
  return List.generate(
    count,
    (i) => createTestMemoryInstance(
      id: 'mem-inst-$i',
      name: 'Memory Instance $i',
      nodeCount: i * 2 + 1,
      edgeCount: i + 1,
    ),
  );
}

/// 测试用 MemoryNodeDto 工厂
MemoryNodeDto createTestMemoryNode({
  String id = 'mem-node-1',
  String instanceId = 'mem-inst-1',
  String contentType = 'text',
  int disclosureLevel = 0,
  Map<String, dynamic>? metadata,
  String createdAt = '2026-01-01T00:00:00.000Z',
}) {
  return MemoryNodeDto(
    id: id,
    instanceId: instanceId,
    contentType: contentType,
    disclosureLevel: disclosureLevel,
    metadata: metadata,
    createdAt: createdAt,
  );
}

/// 测试用 MemoryNodeDto 列表工厂
List<MemoryNodeDto> createTestMemoryNodeList({
  int count = 3,
  String instanceId = 'mem-inst-1',
}) {
  return List.generate(
    count,
    (i) => createTestMemoryNode(
      id: 'mem-node-$i',
      instanceId: instanceId,
      contentType: 'text',
    ),
  );
}

/// 测试用 MemoryVersionDto 工厂
MemoryVersionDto createTestMemoryVersion({
  String id = 'mem-ver-1',
  String nodeId = 'mem-node-1',
  String content = 'Version content text.',
  int versionNumber = 1,
  String? changeType = 'created',
  bool deprecated = false,
  String createdAt = '2026-01-01T00:00:00.000Z',
}) {
  return MemoryVersionDto(
    id: id,
    nodeId: nodeId,
    content: content,
    versionNumber: versionNumber,
    changeType: changeType,
    deprecated: deprecated,
    createdAt: createdAt,
  );
}

/// 测试用 MemoryVersionDto 列表工厂
List<MemoryVersionDto> createTestMemoryVersionList({
  int count = 3,
  String nodeId = 'mem-node-1',
}) {
  return List.generate(
    count,
    (i) => createTestMemoryVersion(
      id: 'mem-ver-$i',
      nodeId: nodeId,
      content: 'Version $i content.',
      versionNumber: i + 1,
      changeType: i == 0 ? 'created' : 'updated',
    ),
  );
}

// ==================== Memory 审计日志测试工厂 ====================

/// 测试用 MemoryAuditEntryDto 工厂
MemoryAuditEntryDto createTestMemoryAuditEntry({
  String id = 'audit-1',
  String action = 'create_node',
  String userId = 'user-001',
  String? targetNodeId = 'mem-node-1',
  String? targetVersionId = 'mem-ver-1',
  Map<String, dynamic>? metadata,
  DateTime? createdAt,
}) {
  return MemoryAuditEntryDto(
    id: id,
    action: action,
    userId: userId,
    targetNodeId: targetNodeId,
    targetVersionId: targetVersionId,
    metadata: metadata ?? {'nodeName': 'Test Node', 'versionNumber': 1},
    createdAt: createdAt ?? DateTime.now().subtract(const Duration(hours: 1)),
  );
}

/// 测试用 MemoryAuditEntryDto 列表工厂
List<MemoryAuditEntryDto> createTestMemoryAuditEntryList({int count = 5}) {
  const actions = [
    'create_node',
    'update_version',
    'delete_path',
    'review_approved',
    'review_rejected',
    'rollback',
  ];
  return List.generate(
    count,
    (i) => createTestMemoryAuditEntry(
      id: 'audit-$i',
      action: actions[i % actions.length],
      targetNodeId: 'mem-node-$i',
      targetVersionId: i.isEven ? 'mem-ver-$i' : null,
      metadata: {'nodeName': 'Node $i', 'versionNumber': i + 1},
      createdAt: DateTime.now().subtract(Duration(hours: i + 1)),
    ),
  );
}
