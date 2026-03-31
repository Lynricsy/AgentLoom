import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/models/paginated_response.dart';
import '../../../shared/providers/api_client_provider.dart';
import '../models/agent_conversation_dto.dart';
import '../models/agent_definition_dto.dart';
import '../models/conversation_message_dto.dart';

Map<String, dynamic> _unwrapDataEnvelope(Response<dynamic> response) {
  final body = response.data as Map<String, dynamic>;
  final data = body['data'];

  if (data is Map<String, dynamic>) {
    return data;
  }

  if (data is Map<Object?, Object?>) {
    return data.map((key, value) => MapEntry('$key', value));
  }

  return body;
}

List<WorkspaceFileNode> _workspaceNodesFromResponse(Response<dynamic> response) {
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

/// Agent API 客户端
class AgentApi {
  final Dio _dio;

  AgentApi(this._dio);

  /// 获取 Agent 列表（分页）
  Future<PaginatedResponse<AgentDefinitionDto>> listAgents({
    int page = 1,
    int pageSize = 20,
    String? status,
    String? search,
  }) async {
    final queryParams = <String, dynamic>{'page': page, 'page_size': pageSize};
    if (status != null) queryParams['status'] = status;
    if (search != null && search.isNotEmpty) queryParams['search'] = search;

    final response = await _dio.get(
      '/api/v1/agent-definitions',
      queryParameters: queryParams,
    );
    final data = response.data as Map<String, dynamic>;
    return PaginatedResponse.fromJson(
      data,
      (json) => AgentDefinitionDto.fromJson(json! as Map<String, dynamic>),
    );
  }

  /// 获取单个 Agent 详情
  Future<AgentDefinitionDto> getAgent(String agentId) async {
    final response = await _dio.get('/api/v1/agent-definitions/$agentId');
    return AgentDefinitionDto.fromJson(_unwrapDataEnvelope(response));
  }

  /// 获取 Agent 对话列表
  Future<List<AgentConversationDto>> listConversations(
    String agentId, {
    int page = 1,
    int pageSize = 20,
    String? status,
  }) async {
    final response = await _dio.get(
      '/api/v1/agent-definitions/$agentId/conversations',
      queryParameters: {
        'page': page,
        'limit': pageSize,
        if (status != null && status.isNotEmpty) 'status': status,
      },
    );
    final data = response.data as Map<String, dynamic>;
    final paginated = PaginatedResponse.fromJson(
      data,
      (json) => AgentConversationDto.fromJson(json! as Map<String, dynamic>),
    );
    return paginated.data;
  }

  /// 创建 Agent 对话
  Future<AgentConversationDto> createConversation(
    String agentId, {
    String? title,
    Map<String, dynamic>? metadata,
  }) async {
    final body = <String, dynamic>{};
    if (title != null && title.isNotEmpty) {
      body['title'] = title;
    }
    if (metadata != null && metadata.isNotEmpty) {
      body['metadata'] = metadata;
    }

    final response = await _dio.post(
      '/api/v1/agent-definitions/$agentId/conversations',
      data: body.isEmpty ? null : body,
    );
    return AgentConversationDto.fromJson(_unwrapDataEnvelope(response));
  }

  /// 获取对话消息列表
  Future<PaginatedResponse<ConversationMessageDto>> getMessages(
    String conversationId, {
    int page = 1,
    int pageSize = 50,
  }) async {
    final response = await _dio.get(
      '/api/v1/agent-conversations/$conversationId/messages',
      queryParameters: {'page': page, 'limit': pageSize},
    );
    final data = response.data as Map<String, dynamic>;
    return PaginatedResponse.fromJson(
      data,
      (json) => ConversationMessageDto.fromJson(json! as Map<String, dynamic>),
    );
  }

  /// 发送消息
  Future<ConversationMessageDto> sendMessage(
    String conversationId, {
    required String content,
    String role = 'user',
    String contentType = 'text',
    Map<String, dynamic>? metadata,
  }) async {
    final body = <String, dynamic>{
      'content': content,
      'role': role,
      'contentType': contentType,
    };
    if (metadata != null && metadata.isNotEmpty) {
      body['metadata'] = metadata;
    }
    final response = await _dio.post(
      '/api/v1/agent-conversations/$conversationId/messages',
      data: body,
    );
    return ConversationMessageDto.fromJson(_unwrapDataEnvelope(response));
  }

  Future<void> cancelConversation(String conversationId) async {
    await _dio.post('/api/v1/agent-conversations/$conversationId/cancel');
  }

  Future<void> resolveToolPermission(
    String conversationId,
    String toolCallId, {
    required String action,
  }) async {
    await _dio.post(
      '/api/v1/agent-conversations/$conversationId/tool-permissions/$toolCallId/resolve',
      data: {'action': action},
    );
  }

  Future<List<WorkspaceFileNode>> getWorkspaceTree(String conversationId) async {
    final response = await _dio.get(
      '/api/v1/agent-conversations/$conversationId/workspace/tree',
    );
    return _workspaceNodesFromResponse(response);
  }

  Future<WorkspaceFileContent> getWorkspaceFile(
    String conversationId,
    String filePath,
  ) async {
    final encodedPath = Uri.encodeComponent(filePath)
        .replaceAll('%2F', '/')
        .replaceAll('%5C', '/');
    final response = await _dio.get(
      '/api/v1/agent-conversations/$conversationId/workspace/files/$encodedPath',
    );

    final body = response.data as Map<String, dynamic>;
    return WorkspaceFileContent.fromJson(body);
  }
}

/// Agent API Provider
final agentApiProvider = Provider<AgentApi>((ref) {
  final dio = ref.watch(apiClientProvider);
  return AgentApi(dio);
});
