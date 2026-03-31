// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'workflow_input_schema.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_WorkflowInputSchema _$WorkflowInputSchemaFromJson(Map<String, dynamic> json) =>
    _WorkflowInputSchema(
      version: (json['version'] as num?)?.toInt() ?? 1,
      collectionMode: json['collectionMode'] as String? ?? 'form',
      fields:
          (json['fields'] as List<dynamic>?)
              ?.map(
                (e) => InputFieldDefinition.fromJson(e as Map<String, dynamic>),
              )
              .toList() ??
          const [],
      conversationPlan: json['conversationPlan'] == null
          ? null
          : ConversationPlan.fromJson(
              json['conversationPlan'] as Map<String, dynamic>,
            ),
    );

Map<String, dynamic> _$WorkflowInputSchemaToJson(
  _WorkflowInputSchema instance,
) => <String, dynamic>{
  'version': instance.version,
  'collectionMode': instance.collectionMode,
  'fields': instance.fields.map((e) => e.toJson()).toList(),
  'conversationPlan': instance.conversationPlan?.toJson(),
};
