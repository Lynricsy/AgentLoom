// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'conversation_plan.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_ConversationPlan _$ConversationPlanFromJson(Map<String, dynamic> json) =>
    _ConversationPlan(
      systemPrompt: json['systemPrompt'] as String,
      maxTurns: (json['maxTurns'] as num).toInt(),
    );

Map<String, dynamic> _$ConversationPlanToJson(_ConversationPlan instance) =>
    <String, dynamic>{
      'systemPrompt': instance.systemPrompt,
      'maxTurns': instance.maxTurns,
    };
