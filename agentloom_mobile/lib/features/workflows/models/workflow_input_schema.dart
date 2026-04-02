import 'package:freezed_annotation/freezed_annotation.dart';

import 'conversation_plan.dart';
import 'input_field_definition.dart';
import 'json_compat.dart';

part 'workflow_input_schema.freezed.dart';
part 'workflow_input_schema.g.dart';

/// 工作流输入参数 Schema
@freezed
abstract class WorkflowInputSchema with _$WorkflowInputSchema {
  const factory WorkflowInputSchema({
    @Default(1) int version,
    @Default('form') String collectionMode,
    @Default([]) List<InputFieldDefinition> fields,
    ConversationPlan? conversationPlan,
  }) = _WorkflowInputSchema;

  factory WorkflowInputSchema.fromJson(Map<String, dynamic> json) =>
      _$WorkflowInputSchemaFromJson(
        normalizeJsonAliases(
          json,
          aliases: const {
            'collectionMode': ['collection_mode'],
            'conversationPlan': ['conversation_plan'],
          },
        ),
      );
}
