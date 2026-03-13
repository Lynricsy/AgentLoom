import 'package:freezed_annotation/freezed_annotation.dart';

import 'input_field_definition.dart';

part 'workflow_input_schema.freezed.dart';
part 'workflow_input_schema.g.dart';

/// 工作流输入参数 Schema
@freezed
abstract class WorkflowInputSchema with _$WorkflowInputSchema {
  const factory WorkflowInputSchema({
    @Default(1) int version,
    @Default('form') @JsonKey(name: 'collection_mode') String collectionMode,
    @Default([]) List<InputFieldDefinition> fields,
  }) = _WorkflowInputSchema;

  factory WorkflowInputSchema.fromJson(Map<String, dynamic> json) =>
      _$WorkflowInputSchemaFromJson(json);
}
