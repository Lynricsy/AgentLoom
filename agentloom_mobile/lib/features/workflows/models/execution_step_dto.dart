// ignore_for_file: invalid_annotation_target

import 'package:freezed_annotation/freezed_annotation.dart';

import '../../../shared/utils/json_key_normalizer.dart';

part 'execution_step_dto.freezed.dart';
part 'execution_step_dto.g.dart';

/// 执行步骤 DTO（执行详情接口返回）
@freezed
abstract class ExecutionStepDto with _$ExecutionStepDto {
  const factory ExecutionStepDto({
    required String id,
    String? executionId,
    required String nodeId,
    int? stepOrder,
    required String status,
    String? nodeType,
    Map<String, dynamic>? nodeData,
    Map<String, dynamic>? result,
    Map<String, dynamic>? checkpointData,
    Object? errorMessage,
    String? startedAt,
    String? completedAt,
    String? createdAt,
    String? updatedAt,
  }) = _ExecutionStepDto;

  factory ExecutionStepDto.fromJson(Map<String, dynamic> json) =>
      _$ExecutionStepDtoFromJson(normalizeJsonMap(json));
}

extension ExecutionStepDtoX on ExecutionStepDto {
  String? get resolvedNodeLabel {
    final data = nodeData;
    if (data == null) {
      return null;
    }

    final label = data['label'];
    if (label is String && label.isNotEmpty) {
      return label;
    }

    final name = data['name'];
    if (name is String && name.isNotEmpty) {
      return name;
    }

    final title = data['title'];
    if (title is String && title.isNotEmpty) {
      return title;
    }

    return null;
  }

  String? get resolvedNodeType {
    final data = nodeData;
    if (data != null) {
      final rawNodeType = data['nodeType'];
      if (rawNodeType is String && rawNodeType.isNotEmpty) {
        return rawNodeType;
      }

      final rawType = data['type'];
      if (rawType is String && rawType.isNotEmpty) {
        return rawType;
      }
    }

    if (nodeType != null && nodeType!.isNotEmpty) {
      return nodeType;
    }

    return null;
  }

  String? get resolvedErrorMessage {
    final value = errorMessage;
    if (value is String && value.isNotEmpty) {
      return value;
    }

    if (value is Map<String, dynamic>) {
      final detail = value['detail'];
      if (detail is String && detail.isNotEmpty) {
        return detail;
      }

      final message = value['message'];
      if (message is String && message.isNotEmpty) {
        return message;
      }

      final title = value['title'];
      if (title is String && title.isNotEmpty) {
        return title;
      }
    }

    return null;
  }

  Map<String, dynamic>? get errorDetailMap {
    final value = errorMessage;
    return value is Map<String, dynamic> ? value : null;
  }
}
