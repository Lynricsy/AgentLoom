import 'dart:convert';

import 'package:agentloom_mobile/features/execution/lib/output_content.dart';
import 'package:flutter/material.dart';
import 'package:flutter_smooth_markdown/flutter_smooth_markdown.dart';

class ExecutionOutputContentView extends StatelessWidget {
  const ExecutionOutputContentView({
    super.key,
    required this.format,
    required this.output,
    this.jsonValue,
    this.isStreaming = false,
    required this.placeholder,
  });

  final WorkflowOutputFormat format;
  final String output;
  final Object? jsonValue;
  final bool isStreaming;
  final String placeholder;

  @override
  Widget build(BuildContext context) {
    if (output.trim().isEmpty && jsonValue == null) {
      return _EmptyOutputCard(message: placeholder);
    }

    return switch (format) {
      WorkflowOutputFormat.markdown => _MarkdownOutputCard(content: output),
      WorkflowOutputFormat.json => _JsonOutputCard(
        output: output,
        jsonValue: jsonValue,
        isStreaming: isStreaming,
        placeholder: placeholder,
      ),
      WorkflowOutputFormat.plain => _PlainOutputCard(content: output),
    };
  }
}

class _MarkdownOutputCard extends StatelessWidget {
  const _MarkdownOutputCard({required this.content});

  final String content;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return DecoratedBox(
      decoration: _cardDecoration(theme),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: SmoothMarkdown(
          data: content,
          selectable: true,
          useEnhancedComponents: true,
          styleSheet: MarkdownStyleSheet.fromTheme(theme),
        ),
      ),
    );
  }
}

class _JsonOutputCard extends StatelessWidget {
  const _JsonOutputCard({
    required this.output,
    required this.jsonValue,
    required this.isStreaming,
    required this.placeholder,
  });

  final String output;
  final Object? jsonValue;
  final bool isStreaming;
  final String placeholder;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final parsed = parseJsonOutput(output);
    final hasStructuredValue = jsonValue != null || parsed.ok;
    final structuredValue = jsonValue ?? parsed.value;

    if (!hasStructuredValue) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _JsonFallbackBanner(isStreaming: isStreaming),
          const SizedBox(height: 12),
          if (output.trim().isEmpty)
            _EmptyOutputCard(message: placeholder)
          else
            _PlainOutputCard(content: output),
        ],
      );
    }

    return DecoratedBox(
      decoration: _cardDecoration(theme),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: ExecutionJsonTreeView(value: structuredValue),
      ),
    );
  }
}

class _JsonFallbackBanner extends StatelessWidget {
  const _JsonFallbackBanner({required this.isStreaming});

  final bool isStreaming;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: theme.colorScheme.tertiaryContainer,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: theme.colorScheme.outlineVariant),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(
              Icons.warning_amber_rounded,
              size: 18,
              color: theme.colorScheme.onTertiaryContainer,
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                isStreaming
                    ? 'JSON 仍在流式拼装，先按原文展示。'
                    : '当前输出不是合法 JSON，已回退为原文代码视图。',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onTertiaryContainer,
                  height: 1.45,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PlainOutputCard extends StatelessWidget {
  const _PlainOutputCard({required this.content});

  final String content;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return DecoratedBox(
      decoration: _cardDecoration(theme),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: SelectableText(
            content,
            style: theme.textTheme.bodyMedium?.copyWith(
              fontFamily: 'monospace',
              height: 1.55,
            ),
          ),
        ),
      ),
    );
  }
}

class _EmptyOutputCard extends StatelessWidget {
  const _EmptyOutputCard({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return DecoratedBox(
      decoration: _cardDecoration(theme),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Row(
          children: [
            Icon(
              Icons.inbox_outlined,
              color: theme.colorScheme.onSurfaceVariant,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                message,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                  height: 1.45,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class ExecutionJsonTreeView extends StatelessWidget {
  const ExecutionJsonTreeView({super.key, required this.value});

  final Object? value;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    if (value is Map) {
      final entries = (value as Map).entries.toList(growable: false);
      if (entries.isEmpty) {
        return const _JsonLeafRow(label: '{}', value: <String, dynamic>{});
      }

      return Column(
        children: [
          for (var index = 0; index < entries.length; index++) ...[
            _JsonNode(
              label: '${entries[index].key}',
              value: entries[index].value,
              depth: 0,
              initiallyExpanded: true,
            ),
            if (index != entries.length - 1)
              Divider(color: theme.colorScheme.outlineVariant, height: 1),
          ],
        ],
      );
    }

    if (value is List) {
      final items = value as List<Object?>;
      if (items.isEmpty) {
        return const _JsonLeafRow(label: '[]', value: <Object?>[]);
      }

      return Column(
        children: [
          for (var index = 0; index < items.length; index++) ...[
            _JsonNode(
              label: '[$index]',
              value: items[index],
              depth: 0,
              initiallyExpanded: true,
            ),
            if (index != items.length - 1)
              Divider(color: theme.colorScheme.outlineVariant, height: 1),
          ],
        ],
      );
    }

    return _JsonLeafRow(label: 'value', value: value);
  }
}

class _JsonNode extends StatelessWidget {
  const _JsonNode({
    required this.label,
    required this.value,
    required this.depth,
    this.initiallyExpanded = false,
  });

  final String label;
  final Object? value;
  final int depth;
  final bool initiallyExpanded;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final leftPadding = 12.0 + (depth * 14);

    if (value is Map) {
      final entries = (value as Map).entries.toList(growable: false);
      return Theme(
        data: theme.copyWith(dividerColor: Colors.transparent),
        child: ExpansionTile(
          initiallyExpanded: initiallyExpanded,
          tilePadding: EdgeInsets.fromLTRB(leftPadding, 6, 8, 6),
          childrenPadding: EdgeInsets.zero,
          dense: true,
          iconColor: theme.colorScheme.primary,
          collapsedIconColor: theme.colorScheme.onSurfaceVariant,
          title: _JsonHeaderRow(
            label: label,
            summary: '{${entries.length} 个键}',
          ),
          children: [
            for (var index = 0; index < entries.length; index++) ...[
              _JsonNode(
                label: '${entries[index].key}',
                value: entries[index].value,
                depth: depth + 1,
                initiallyExpanded: depth == 0,
              ),
              if (index != entries.length - 1)
                Divider(color: theme.colorScheme.outlineVariant, height: 1),
            ],
          ],
        ),
      );
    }

    if (value is List) {
      final items = value as List<Object?>;
      return Theme(
        data: theme.copyWith(dividerColor: Colors.transparent),
        child: ExpansionTile(
          initiallyExpanded: initiallyExpanded,
          tilePadding: EdgeInsets.fromLTRB(leftPadding, 6, 8, 6),
          childrenPadding: EdgeInsets.zero,
          dense: true,
          iconColor: theme.colorScheme.primary,
          collapsedIconColor: theme.colorScheme.onSurfaceVariant,
          title: _JsonHeaderRow(label: label, summary: '[${items.length} 项]'),
          children: [
            for (var index = 0; index < items.length; index++) ...[
              _JsonNode(
                label: '[$index]',
                value: items[index],
                depth: depth + 1,
                initiallyExpanded: false,
              ),
              if (index != items.length - 1)
                Divider(color: theme.colorScheme.outlineVariant, height: 1),
            ],
          ],
        ),
      );
    }

    return Padding(
      padding: EdgeInsets.fromLTRB(leftPadding, 12, 12, 12),
      child: _JsonLeafRow(label: label, value: value),
    );
  }
}

class _JsonHeaderRow extends StatelessWidget {
  const _JsonHeaderRow({required this.label, required this.summary});

  final String label;
  final String summary;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      children: [
        Expanded(
          child: Text(
            label,
            style: theme.textTheme.bodyMedium?.copyWith(
              fontFamily: 'monospace',
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
        const SizedBox(width: 8),
        Text(
          summary,
          style: theme.textTheme.bodySmall?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
            fontFamily: 'monospace',
          ),
        ),
      ],
    );
  }
}

class _JsonLeafRow extends StatelessWidget {
  const _JsonLeafRow({required this.label, required this.value});

  final String label;
  final Object? value;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return SelectableText.rich(
      TextSpan(
        children: [
          TextSpan(
            text: '$label: ',
            style: theme.textTheme.bodyMedium?.copyWith(
              fontFamily: 'monospace',
              fontWeight: FontWeight.w700,
            ),
          ),
          TextSpan(
            text: _formatJsonPrimitive(value),
            style: theme.textTheme.bodyMedium?.copyWith(
              fontFamily: 'monospace',
              color: _resolvePrimitiveColor(value, theme),
              height: 1.5,
            ),
          ),
        ],
      ),
    );
  }
}

String _formatJsonPrimitive(Object? value) {
  if (value is String) {
    return jsonEncode(value);
  }
  if (value is Map || value is List) {
    return stringifyOutputValue(value, pretty: true);
  }
  return '$value';
}

Color _resolvePrimitiveColor(Object? value, ThemeData theme) {
  if (value == null) {
    return theme.colorScheme.error;
  }
  if (value is num) {
    return theme.colorScheme.primary;
  }
  if (value is bool) {
    return theme.colorScheme.tertiary;
  }
  if (value is String) {
    return theme.colorScheme.secondary;
  }
  return theme.colorScheme.onSurface;
}

BoxDecoration _cardDecoration(ThemeData theme) {
  return BoxDecoration(
    color: theme.colorScheme.surfaceContainerLow,
    borderRadius: BorderRadius.circular(24),
    border: Border.all(color: theme.colorScheme.outlineVariant),
  );
}
