import 'package:freezed_annotation/freezed_annotation.dart';

part 'conversation_plan.freezed.dart';
part 'conversation_plan.g.dart';

@freezed
abstract class ConversationPlan with _$ConversationPlan {
  const factory ConversationPlan({
    @JsonKey(name: 'system_prompt') required String systemPrompt,
    @JsonKey(name: 'max_turns') required int maxTurns,
  }) = _ConversationPlan;

  factory ConversationPlan.fromJson(Map<String, dynamic> json) =>
      _$ConversationPlanFromJson(json);
}
