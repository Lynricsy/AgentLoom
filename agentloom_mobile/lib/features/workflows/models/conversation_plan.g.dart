// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'conversation_plan.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_ConversationPlan _$ConversationPlanFromJson(Map<String, dynamic> json) =>
    _ConversationPlan(
      systemPrompt: json['system_prompt'] as String,
      maxTurns: (json['max_turns'] as num).toInt(),
    );

Map<String, dynamic> _$ConversationPlanToJson(_ConversationPlan instance) =>
    <String, dynamic>{
      'system_prompt': instance.systemPrompt,
      'max_turns': instance.maxTurns,
    };
