import 'package:freezed_annotation/freezed_annotation.dart';

part 'agent_conversation_dto.freezed.dart';
part 'agent_conversation_dto.g.dart';

Map<String, dynamic> _conversationMetadataFromJson(Object? value) {
  if (value is Map<String, dynamic>) {
    return value;
  }
  if (value is Map) {
    return value.map((key, item) => MapEntry('$key', item));
  }
  return <String, dynamic>{};
}

/// Agent 对话 DTO
@freezed
abstract class AgentConversationDto with _$AgentConversationDto {
  const factory AgentConversationDto({
    required String id,
    required String agentDefinitionId,
    required String status,
    String? title,
    @JsonKey(fromJson: _conversationMetadataFromJson)
    @Default(<String, dynamic>{})
    Map<String, dynamic> metadata,
    required String createdAt,
    required String updatedAt,
    String? createdBy,
    String? organizationId,
  }) = _AgentConversationDto;

  factory AgentConversationDto.fromJson(Map<String, dynamic> json) =>
      _$AgentConversationDtoFromJson(json);
}
