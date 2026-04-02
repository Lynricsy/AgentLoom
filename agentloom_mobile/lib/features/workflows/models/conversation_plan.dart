import 'package:freezed_annotation/freezed_annotation.dart';

import 'json_compat.dart';

part 'conversation_plan.freezed.dart';
part 'conversation_plan.g.dart';

@freezed
abstract class ConversationPlan with _$ConversationPlan {
  const factory ConversationPlan({
    required String systemPrompt,
    required int maxTurns,
  }) = _ConversationPlan;

  factory ConversationPlan.fromJson(Map<String, dynamic> json) =>
      _$ConversationPlanFromJson(
        normalizeJsonAliases(
          json,
          aliases: const {
            'systemPrompt': ['system_prompt'],
            'maxTurns': ['max_turns'],
          },
        ),
      );
}
