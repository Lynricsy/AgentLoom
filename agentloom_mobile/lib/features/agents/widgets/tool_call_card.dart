import 'dart:convert';

import 'package:flutter/material.dart';

import '../models/conversation_message_dto.dart';

class ToolCallCard extends StatefulWidget {
  const ToolCallCard({
    super.key,
    required this.toolCall,
    this.defaultExpanded = false,
    this.onResolvePermission,
  });

  final ConversationToolCallDto toolCall;
  final bool defaultExpanded;
  final Future<void> Function(String toolCallId, String action)?
  onResolvePermission;

  @override
  State<ToolCallCard> createState() => _ToolCallCardState();
}

class _ToolCallCardState extends State<ToolCallCard> {
  bool _expanded = false;
  String? _submittingAction;

  @override
  void initState() {
    super.initState();
    _expanded = widget.defaultExpanded;
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final accentColor = _statusColor(theme, widget.toolCall.status);
    final awaitingPermission =
        widget.toolCall.status == ConversationToolStatus.awaitingPermission;

    return Container(
      margin: const EdgeInsets.symmetric(vertical: 6),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerLow,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: awaitingPermission
              ? theme.colorScheme.tertiary.withValues(alpha: 0.35)
              : theme.colorScheme.outlineVariant,
        ),
      ),
      child: Column(
        children: [
          InkWell(
            borderRadius: BorderRadius.circular(20),
            onTap: () => setState(() => _expanded = !_expanded),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(
                    _toolIcon(widget.toolCall.tool),
                    size: 18,
                    color: accentColor,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                _summaryText(widget.toolCall),
                                style: theme.textTheme.bodyMedium?.copyWith(
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                            _ToolStatusBadge(toolCall: widget.toolCall),
                          ],
                        ),
                        const SizedBox(height: 4),
                        Text(
                          widget.toolCall.tool,
                          style: theme.textTheme.labelMedium?.copyWith(
                            color: theme.colorScheme.onSurfaceVariant,
                            fontFamily: 'monospace',
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  Icon(
                    _expanded ? Icons.expand_less : Icons.expand_more,
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ],
              ),
            ),
          ),
          if (awaitingPermission) _PermissionSection(
            toolCall: widget.toolCall,
            submittingAction: _submittingAction,
            onResolvePermission: widget.onResolvePermission,
            onSubmittingChanged: (value) {
              if (!mounted) {
                return;
              }
              setState(() => _submittingAction = value);
            },
          ),
          if (_expanded)
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
              child: Column(
                children: [
                  Divider(
                    height: 20,
                    color: theme.colorScheme.outlineVariant.withValues(
                      alpha: 0.5,
                    ),
                  ),
                  _ToolDetail(toolCall: widget.toolCall),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _PermissionSection extends StatelessWidget {
  const _PermissionSection({
    required this.toolCall,
    required this.submittingAction,
    required this.onResolvePermission,
    required this.onSubmittingChanged,
  });

  final ConversationToolCallDto toolCall;
  final String? submittingAction;
  final Future<void> Function(String toolCallId, String action)?
  onResolvePermission;
  final ValueChanged<String?> onSubmittingChanged;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final description = toolCall.permissionRequest?.description;
    final resourcePaths = toolCall.permissionRequest?.resourcePaths ?? const [];

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: theme.colorScheme.tertiaryContainer.withValues(alpha: 0.4),
          borderRadius: BorderRadius.circular(16),
        ),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(
                    Icons.shield_outlined,
                    size: 16,
                    color: theme.colorScheme.tertiary,
                  ),
                  const SizedBox(width: 8),
                  Text(
                    '需要授权',
                    style: theme.textTheme.labelLarge?.copyWith(
                      color: theme.colorScheme.onTertiaryContainer,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
              if (description != null) ...[
                const SizedBox(height: 10),
                Text(
                  description,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.onTertiaryContainer,
                  ),
                ),
              ],
              if (resourcePaths.isNotEmpty) ...[
                const SizedBox(height: 10),
                _CodePanel(
                  label: '资源路径',
                  content: resourcePaths.join('\n'),
                ),
              ],
              const SizedBox(height: 12),
              Row(
                children: [
                  FilledButton.tonalIcon(
                    onPressed: onResolvePermission == null || submittingAction != null
                        ? null
                        : () => _resolve('approve'),
                    icon: submittingAction == 'approve'
                        ? const SizedBox(
                            width: 14,
                            height: 14,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.check),
                    label: const Text('批准'),
                  ),
                  const SizedBox(width: 10),
                  OutlinedButton.icon(
                    onPressed: onResolvePermission == null || submittingAction != null
                        ? null
                        : () => _resolve('deny'),
                    icon: submittingAction == 'deny'
                        ? const SizedBox(
                            width: 14,
                            height: 14,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.close),
                    label: const Text('拒绝'),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _resolve(String action) async {
    if (onResolvePermission == null) {
      return;
    }
    onSubmittingChanged(action);
    try {
      await onResolvePermission!(toolCall.id, action);
    } finally {
      onSubmittingChanged(null);
    }
  }
}

class _ToolDetail extends StatelessWidget {
  const _ToolDetail({required this.toolCall});

  final ConversationToolCallDto toolCall;

  @override
  Widget build(BuildContext context) {
    final category = _toolCategory(toolCall.tool);
    switch (category) {
      case _ToolCategory.bash:
      case _ToolCategory.pty:
        return _CommandToolDetail(toolCall: toolCall);
      case _ToolCategory.read:
        return _ReadToolDetail(toolCall: toolCall);
      case _ToolCategory.edit:
        return _EditToolDetail(toolCall: toolCall);
      case _ToolCategory.write:
        return _WriteToolDetail(toolCall: toolCall);
      case _ToolCategory.find:
      case _ToolCategory.grep:
      case _ToolCategory.ls:
      case _ToolCategory.memory:
      case _ToolCategory.knowledge:
      case _ToolCategory.other:
        return _StructuredToolDetail(toolCall: toolCall);
    }
  }
}

class _CommandToolDetail extends StatelessWidget {
  const _CommandToolDetail({required this.toolCall});

  final ConversationToolCallDto toolCall;

  @override
  Widget build(BuildContext context) {
    final args = _asMap(toolCall.args);
    final command = _firstString(args, const ['command', 'cmd', 'data']);
    final output = _prettyPrint(toolCall.result ?? toolCall.error);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (command != null)
          _CodePanel(
            label: '命令',
            content: command,
            backgroundColor: const Color(0xFF0F172A),
            textColor: const Color(0xFFE2E8F0),
          ),
        if (output.isNotEmpty) ...[
          const SizedBox(height: 12),
          _CodePanel(
            label: toolCall.error == null ? '输出' : '错误',
            content: output,
            backgroundColor: toolCall.error == null
                ? const Color(0xFF101927)
                : const Color(0xFF2A0F17),
            textColor: toolCall.error == null
                ? const Color(0xFFB6E3FF)
                : const Color(0xFFFFC4D2),
          ),
        ],
      ],
    );
  }
}

class _ReadToolDetail extends StatelessWidget {
  const _ReadToolDetail({required this.toolCall});

  final ConversationToolCallDto toolCall;

  @override
  Widget build(BuildContext context) {
    final args = _asMap(toolCall.args);
    final path = _firstString(args, const ['path']) ?? '未知文件';
    final content = _prettyPrint(toolCall.result ?? toolCall.error);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _MetadataRow(label: '文件', value: path),
        if (content.isNotEmpty) ...[
          const SizedBox(height: 12),
          _CodePanel(label: '内容', content: content),
        ],
      ],
    );
  }
}

class _EditToolDetail extends StatelessWidget {
  const _EditToolDetail({required this.toolCall});

  final ConversationToolCallDto toolCall;

  @override
  Widget build(BuildContext context) {
    final args = _asMap(toolCall.args);
    final path = _firstString(args, const ['path']) ?? '未知文件';
    final edits = _normalizeEditEntries(args);
    if (edits.isEmpty) {
      return _StructuredToolDetail(toolCall: toolCall);
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _MetadataRow(label: '文件', value: path),
        const SizedBox(height: 12),
        for (var index = 0; index < edits.length; index++) ...[
          if (edits.length > 1)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Text(
                '修改 ${index + 1}',
                style: Theme.of(context).textTheme.labelLarge?.copyWith(
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          _DiffPreview(
            before: edits[index].before,
            after: edits[index].after,
          ),
          if (index < edits.length - 1) const SizedBox(height: 12),
        ],
      ],
    );
  }
}

class _WriteToolDetail extends StatelessWidget {
  const _WriteToolDetail({required this.toolCall});

  final ConversationToolCallDto toolCall;

  @override
  Widget build(BuildContext context) {
    final args = _asMap(toolCall.args);
    final path = _firstString(args, const ['path']) ?? '未知文件';
    final content = _firstString(args, const ['content', 'text']) ??
        _prettyPrint(toolCall.result);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _MetadataRow(label: '文件', value: path),
        if (content.isNotEmpty) ...[
          const SizedBox(height: 12),
          _CodePanel(label: '写入内容', content: content),
        ],
      ],
    );
  }
}

class _StructuredToolDetail extends StatelessWidget {
  const _StructuredToolDetail({required this.toolCall});

  final ConversationToolCallDto toolCall;

  @override
  Widget build(BuildContext context) {
    final argsText = _prettyPrint(toolCall.args);
    final resultText = _prettyPrint(toolCall.result);
    final errorText = toolCall.error;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (argsText.isNotEmpty)
          _CodePanel(label: '输入', content: argsText),
        if (resultText.isNotEmpty) ...[
          const SizedBox(height: 12),
          _CodePanel(label: '输出', content: resultText),
        ],
        if (errorText != null && errorText.isNotEmpty) ...[
          const SizedBox(height: 12),
          _CodePanel(
            label: '错误',
            content: errorText,
            backgroundColor: const Color(0xFF2A0F17),
            textColor: const Color(0xFFFFC4D2),
          ),
        ],
      ],
    );
  }
}

class _DiffPreview extends StatelessWidget {
  const _DiffPreview({required this.before, required this.after});

  final String before;
  final String after;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final vertical = constraints.maxWidth < 640;
        final children = [
          Expanded(
            child: _CodePanel(
              label: '原文',
              content: before,
              backgroundColor: const Color(0xFF2A0F17),
              textColor: const Color(0xFFFFD8E1),
            ),
          ),
          const SizedBox(width: 12, height: 12),
          Expanded(
            child: _CodePanel(
              label: '修改后',
              content: after,
              backgroundColor: const Color(0xFF102312),
              textColor: const Color(0xFFD6FFE1),
            ),
          ),
        ];

        if (vertical) {
          return Column(
            children: [
              children[0],
              children[1],
              children[2],
            ],
          );
        }

        return Row(children: children);
      },
    );
  }
}

class _CodePanel extends StatelessWidget {
  const _CodePanel({
    required this.label,
    required this.content,
    this.backgroundColor,
    this.textColor,
  });

  final String label;
  final String content;
  final Color? backgroundColor;
  final Color? textColor;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: theme.textTheme.labelLarge?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 8),
        DecoratedBox(
          decoration: BoxDecoration(
            color: backgroundColor ?? theme.colorScheme.surfaceContainerHighest,
            borderRadius: BorderRadius.circular(16),
          ),
          child: SizedBox(
            width: double.infinity,
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.all(12),
              child: SelectableText(
                content.isEmpty ? '暂无内容' : content,
                style: theme.textTheme.bodySmall?.copyWith(
                  fontFamily: 'monospace',
                  height: 1.45,
                  color: textColor ?? theme.colorScheme.onSurface,
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _MetadataRow extends StatelessWidget {
  const _MetadataRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          '$label：',
          style: theme.textTheme.bodySmall?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
            fontWeight: FontWeight.w700,
          ),
        ),
        Expanded(
          child: SelectableText(
            value,
            style: theme.textTheme.bodySmall?.copyWith(
              fontFamily: 'monospace',
            ),
          ),
        ),
      ],
    );
  }
}

class _ToolStatusBadge extends StatelessWidget {
  const _ToolStatusBadge({required this.toolCall});

  final ConversationToolCallDto toolCall;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final color = _statusColor(theme, toolCall.status);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        _statusLabel(toolCall.status),
        style: theme.textTheme.labelSmall?.copyWith(
          color: color,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

enum _ToolCategory {
  bash,
  pty,
  read,
  write,
  edit,
  find,
  grep,
  ls,
  memory,
  knowledge,
  other,
}

class _EditEntry {
  const _EditEntry({required this.before, required this.after});

  final String before;
  final String after;
}

_ToolCategory _toolCategory(String tool) {
  final lower = tool.toLowerCase();
  if (lower == 'bash' || lower == 'exec_command' || lower.contains('terminal')) {
    return _ToolCategory.bash;
  }
  if (lower == 'pty' || lower == 'pty_write') {
    return _ToolCategory.pty;
  }
  if (lower == 'read' || lower.contains('read_file')) {
    return _ToolCategory.read;
  }
  if (lower == 'write' || lower.contains('write_file')) {
    return _ToolCategory.write;
  }
  if (lower == 'edit') {
    return _ToolCategory.edit;
  }
  if (lower == 'find') {
    return _ToolCategory.find;
  }
  if (lower == 'grep') {
    return _ToolCategory.grep;
  }
  if (lower == 'ls' || lower.contains('list')) {
    return _ToolCategory.ls;
  }
  if (lower.contains('memory')) {
    return _ToolCategory.memory;
  }
  if (lower.contains('knowledge')) {
    return _ToolCategory.knowledge;
  }
  return _ToolCategory.other;
}

IconData _toolIcon(String tool) {
  return switch (_toolCategory(tool)) {
    _ToolCategory.bash || _ToolCategory.pty => Icons.terminal,
    _ToolCategory.read => Icons.description_outlined,
    _ToolCategory.write => Icons.edit_note_outlined,
    _ToolCategory.edit => Icons.edit_outlined,
    _ToolCategory.find || _ToolCategory.grep => Icons.search,
    _ToolCategory.ls => Icons.folder_open_outlined,
    _ToolCategory.memory => Icons.psychology_outlined,
    _ToolCategory.knowledge => Icons.menu_book_outlined,
    _ToolCategory.other => Icons.build_outlined,
  };
}

Color _statusColor(ThemeData theme, ConversationToolStatus status) {
  return switch (status) {
    ConversationToolStatus.completed => const Color(0xFF0F9D58),
    ConversationToolStatus.failed || ConversationToolStatus.denied => theme.colorScheme.error,
    ConversationToolStatus.awaitingPermission => theme.colorScheme.tertiary,
    ConversationToolStatus.pending || ConversationToolStatus.inProgress => theme.colorScheme.primary,
  };
}

String _statusLabel(ConversationToolStatus status) {
  return switch (status) {
    ConversationToolStatus.pending => '等待中',
    ConversationToolStatus.awaitingPermission => '待授权',
    ConversationToolStatus.denied => '已拒绝',
    ConversationToolStatus.inProgress => '进行中',
    ConversationToolStatus.completed => '已完成',
    ConversationToolStatus.failed => '失败',
  };
}

String _summaryText(ConversationToolCallDto toolCall) {
  final args = _asMap(toolCall.args);
  return switch (_toolCategory(toolCall.tool)) {
    _ToolCategory.bash || _ToolCategory.pty =>
      _firstString(args, const ['command', 'cmd', 'data']) ??
          toolCall.tool,
    _ToolCategory.read => '读取 ${_firstString(args, const ['path']) ?? '文件'}',
    _ToolCategory.write => '写入 ${_firstString(args, const ['path']) ?? '文件'}',
    _ToolCategory.edit => '编辑 ${_firstString(args, const ['path']) ?? '文件'}',
    _ToolCategory.find || _ToolCategory.grep =>
      '${toolCall.tool} ${_firstString(args, const ['pattern', 'query', 'path']) ?? ''}'
          .trim(),
    _ToolCategory.ls => '列出 ${_firstString(args, const ['path']) ?? '目录'}',
    _ToolCategory.memory => '记忆操作',
    _ToolCategory.knowledge => '知识检索',
    _ToolCategory.other => toolCall.tool,
  };
}

Map<String, dynamic> _asMap(Object? value) {
  if (value is Map<String, dynamic>) {
    return value;
  }
  if (value is Map<Object?, Object?>) {
    return value.map((key, entry) => MapEntry('$key', entry));
  }
  if (value is String) {
    try {
      final decoded = jsonDecode(value);
      if (decoded is Map<String, dynamic>) {
        return decoded;
      }
      if (decoded is Map<Object?, Object?>) {
        return decoded.map((key, entry) => MapEntry('$key', entry));
      }
    } catch (_) {}
  }
  return <String, dynamic>{};
}

String? _firstString(Map<String, dynamic> value, List<String> keys) {
  for (final key in keys) {
    final item = value[key];
    if (item is String && item.trim().isNotEmpty) {
      return item;
    }
  }
  return null;
}

String _prettyPrint(Object? value) {
  if (value == null) {
    return '';
  }
  if (value is String) {
    return value;
  }
  try {
    return const JsonEncoder.withIndent('  ').convert(value);
  } catch (_) {
    return value.toString();
  }
}

List<_EditEntry> _normalizeEditEntries(Map<String, dynamic> args) {
  final edits = args['edits'];
  if (edits is List) {
    return edits.map((item) {
      final value = _asMap(item);
      return _EditEntry(
        before: _firstString(value, const ['oldText', 'old_text']) ?? '',
        after: _firstString(value, const ['newText', 'new_text']) ?? '',
      );
    }).toList(growable: false);
  }

  final before = _firstString(args, const ['oldText', 'old_text']);
  final after = _firstString(args, const ['newText', 'new_text']);
  if (before == null && after == null) {
    return const <_EditEntry>[];
  }

  return <_EditEntry>[
    _EditEntry(before: before ?? '', after: after ?? ''),
  ];
}
