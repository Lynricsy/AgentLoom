// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'workflow_input_schema.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_WorkflowInputSchema _$WorkflowInputSchemaFromJson(Map<String, dynamic> json) =>
    _WorkflowInputSchema(
      version: (json['version'] as num?)?.toInt() ?? 1,
      collectionMode: json['collection_mode'] as String? ?? 'form',
      fields:
          (json['fields'] as List<dynamic>?)
              ?.map(
                (e) => InputFieldDefinition.fromJson(e as Map<String, dynamic>),
              )
              .toList() ??
          const [],
      conversationPlan: json['conversation_plan'] == null
          ? null
          : ConversationPlan.fromJson(
              json['conversation_plan'] as Map<String, dynamic>,
            ),
    );

Map<String, dynamic> _$WorkflowInputSchemaToJson(
  _WorkflowInputSchema instance,
) => <String, dynamic>{
  'version': instance.version,
  'collection_mode': instance.collectionMode,
  'fields': instance.fields.map((e) => e.toJson()).toList(),
  'conversation_plan': instance.conversationPlan?.toJson(),
};
