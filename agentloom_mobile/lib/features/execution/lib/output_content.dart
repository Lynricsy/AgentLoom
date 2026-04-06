import 'dart:convert';

import '../models/execution_runtime.dart';
import '../models/execution_state.dart';

enum WorkflowOutputFormat { markdown, json, plain }

class ParsedJsonOutput {
  const ParsedJsonOutput._({required this.ok, this.value});

  const ParsedJsonOutput.success(Object? value)
    : this._(ok: true, value: value);

  const ParsedJsonOutput.failure() : this._(ok: false);

  final bool ok;
  final Object? value;
}

bool isWorkflowTextOutputNodeType(String? nodeType) =>
    nodeType == 'text-output';

bool isWorkflowJsonOutputNodeType(String? nodeType) =>
    nodeType == 'json-output';

bool isWorkflowOutputNodeType(String? nodeType) {
  return isWorkflowTextOutputNodeType(nodeType) ||
      isWorkflowJsonOutputNodeType(nodeType);
}

WorkflowOutputFormat getWorkflowOutputFormat(String? nodeType) {
  switch (nodeType) {
    case 'text-output':
      return WorkflowOutputFormat.markdown;
    case 'json-output':
      return WorkflowOutputFormat.json;
    default:
      return WorkflowOutputFormat.plain;
  }
}

ParsedJsonOutput parseJsonOutput(String output) {
  final trimmed = output.trim();
  if (trimmed.isEmpty) {
    return const ParsedJsonOutput.failure();
  }

  try {
    return ParsedJsonOutput.success(jsonDecode(trimmed));
  } catch (_) {
    return const ParsedJsonOutput.failure();
  }
}

Object? extractWorkflowJsonValue(
  StepSnapshot step,
  ExecutionRuntimeStep? runtime,
) {
  final runtimeValue = _extractStructuredJson(runtime?.result);
  if (runtimeValue != null) {
    return runtimeValue;
  }

  final stepValue = _extractStructuredJson(step.result);
  if (stepValue != null) {
    return stepValue;
  }

  final parsed = parseJsonOutput(extractWorkflowOutputText(step, runtime));
  return parsed.ok ? parsed.value : null;
}

String extractWorkflowOutputText(
  StepSnapshot step,
  ExecutionRuntimeStep? runtime,
) {
  if (runtime != null && runtime.output.trim().isNotEmpty) {
    return runtime.output;
  }

  final runtimeText = _extractStringOutput(runtime?.result);
  if (runtimeText != null) {
    return runtimeText;
  }

  final stepText = _extractStringOutput(step.result);
  if (stepText != null) {
    return stepText;
  }

  final runtimeJson = _extractStructuredJson(runtime?.result);
  if (runtimeJson != null) {
    return stringifyOutputValue(runtimeJson, pretty: true);
  }

  final stepJson = _extractStructuredJson(step.result);
  if (stepJson != null) {
    return stringifyOutputValue(stepJson, pretty: true);
  }

  return '';
}

String? buildOutputPreviewText({
  required WorkflowOutputFormat format,
  String? output,
  Object? jsonValue,
  bool isStreaming = false,
  required int maxChars,
}) {
  final rawPreview = switch (format) {
    WorkflowOutputFormat.json when jsonValue != null => stringifyOutputValue(
      jsonValue,
      pretty: true,
    ),
    WorkflowOutputFormat.json
        when !isStreaming && output != null && output.trim().isNotEmpty =>
      (() {
        final parsed = parseJsonOutput(output);
        return parsed.ok
            ? stringifyOutputValue(parsed.value, pretty: true)
            : output;
      })(),
    _ => output,
  };

  if (rawPreview == null || rawPreview.trim().isEmpty) {
    return null;
  }

  final normalized = rawPreview
      .replaceAll(RegExp(r'```[\w-]*\n?'), '')
      .replaceAll('```', '')
      .replaceAll(RegExp(r'\n{3,}'), '\n\n')
      .trim();

  if (normalized.isEmpty) {
    return null;
  }

  return normalized.length > maxChars
      ? '${normalized.substring(0, maxChars)}…'
      : normalized;
}

String stringifyOutputValue(Object? value, {bool pretty = false}) {
  if (value is String) {
    return value;
  }

  if (value == null) {
    return '';
  }

  try {
    return pretty
        ? const JsonEncoder.withIndent('  ').convert(value)
        : jsonEncode(value);
  } catch (_) {
    return value.toString();
  }
}

String? _extractStringOutput(Map<String, dynamic>? result) {
  if (result == null || result.isEmpty) {
    return null;
  }

  for (final key in const ['content', 'output', 'text', 'value', 'json']) {
    final value = result[key];
    if (value is String && value.trim().isNotEmpty) {
      return value;
    }
  }

  return null;
}

Object? _extractStructuredJson(Map<String, dynamic>? result) {
  if (result == null || result.isEmpty) {
    return null;
  }

  if (result.containsKey('json')) {
    final value = result['json'];
    if (value is! String) {
      return value;
    }
  }

  if (result.containsKey('value')) {
    final value = result['value'];
    if (value is! String) {
      return value;
    }
  }

  return null;
}
