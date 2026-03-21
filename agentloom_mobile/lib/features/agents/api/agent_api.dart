import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/models/paginated_response.dart';
import '../../../shared/providers/api_client_provider.dart';
import '../models/agent_conversation_dto.dart';
import '../models/agent_definition_dto.dart';
import '../models/conversation_message_dto.dart';

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
    final data = response.data as Map<String, dynamic>;
    return AgentDefinitionDto.fromJson(data);
  }

  /// 获取 Agent 对话列表
  Future<List<AgentConversationDto>> listConversations(
    String agentId, {
    int page = 1,
    int pageSize = 20,
  }) async {
    final response = await _dio.get(
      '/api/v1/agent-definitions/$agentId/conversations',
      queryParameters: {'page': page, 'page_size': pageSize},
    );
    final data = response.data as Map<String, dynamic>;
    final paginated = PaginatedResponse.fromJson(
      data,
      (json) => AgentConversationDto.fromJson(json! as Map<String, dynamic>),
    );
    return paginated.data;
  }

  /// 创建 Agent 对话
  Future<AgentConversationDto> createConversation(String agentId) async {
    final response = await _dio.post(
      '/api/v1/agent-definitions/$agentId/conversations',
    );
    final data = response.data as Map<String, dynamic>;
    return AgentConversationDto.fromJson(data);
  }

  /// 获取对话消息列表
  Future<PaginatedResponse<ConversationMessageDto>> getMessages(
    String conversationId, {
    int page = 1,
    int pageSize = 50,
  }) async {
    final response = await _dio.get(
      '/api/v1/agent-conversations/$conversationId/messages',
      queryParameters: {'page': page, 'page_size': pageSize},
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
    List<String>? attachments,
  }) async {
    final body = <String, dynamic>{'content': content};
    if (attachments != null && attachments.isNotEmpty) {
      body['attachments'] = attachments;
    }
    final response = await _dio.post(
      '/api/v1/agent-conversations/$conversationId/messages',
      data: body,
    );
    final data = response.data as Map<String, dynamic>;
    return ConversationMessageDto.fromJson(data);
  }
}

/// Agent API Provider
final agentApiProvider = Provider<AgentApi>((ref) {
  final dio = ref.watch(apiClientProvider);
  return AgentApi(dio);
});
