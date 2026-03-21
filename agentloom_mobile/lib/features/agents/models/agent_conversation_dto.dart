import 'package:freezed_annotation/freezed_annotation.dart';

part 'agent_conversation_dto.freezed.dart';
part 'agent_conversation_dto.g.dart';

/// Agent 对话 DTO
@freezed
abstract class AgentConversationDto with _$AgentConversationDto {
  const factory AgentConversationDto({
    required String id,
    @JsonKey(name: 'agent_definition_id') required String agentDefinitionId,
    @JsonKey(name: 'organization_id') required String organizationId,
    required String status,
    String? title,
    @JsonKey(name: 'created_at') required String createdAt,
    @JsonKey(name: 'updated_at') required String updatedAt,
    @JsonKey(name: 'created_by') String? createdBy,
  }) = _AgentConversationDto;

  factory AgentConversationDto.fromJson(Map<String, dynamic> json) =>
      _$AgentConversationDtoFromJson(json);
}
