import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_markdown_plus/flutter_markdown_plus.dart';

import '../models/conversation_message_dto.dart';
import 'tool_call_card.dart';

class MessageBubble extends StatelessWidget {
  const MessageBubble({
    super.key,
    required this.message,
    this.onResolvePermission,
    this.onRestartConversation,
  });

  final ConversationMessageDto message;
  final Future<void> Function(
    String toolCallId,
    String action, {
    String? rememberScope,
  })?
  onResolvePermission;
  final Future<void> Function()? onRestartConversation;

  @override
  Widget build(BuildContext context) {
    final isUser = message.role == MessageRole.user;
    final theme = Theme.of(context);
    final segments = _resolvedSegments(message);
    final incompleteError = _incompleteErrorMessage(message);
    final restartSuggestion = _extractRestartSuggestion(message);

    if (isUser) {
      return Align(
        alignment: Alignment.centerRight,
        child: Container(
          constraints: BoxConstraints(
            maxWidth: MediaQuery.of(context).size.width * 0.82,
          ),
          margin: const EdgeInsets.fromLTRB(56, 6, 16, 6),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          decoration: BoxDecoration(
            color: theme.colorScheme.primary,
            borderRadius: const BorderRadius.only(
              topLeft: Radius.circular(20),
              topRight: Radius.circular(20),
              bottomLeft: Radius.circular(20),
              bottomRight: Radius.circular(6),
            ),
          ),
          child: _MessageMarkdown(
            content: message.content,
            color: theme.colorScheme.onPrimary,
          ),
        ),
      );
    }

    final surfaceColor = switch (message.role) {
      MessageRole.system => theme.colorScheme.secondaryContainer,
      MessageRole.tool => theme.colorScheme.tertiaryContainer,
      _ => theme.colorScheme.surfaceContainerLow,
    };

    return Align(
      alignment: Alignment.centerLeft,
      child: Container(
        constraints: BoxConstraints(
          maxWidth: MediaQuery.of(context).size.width * 0.9,
        ),
        margin: const EdgeInsets.fromLTRB(16, 6, 40, 6),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: surfaceColor,
          borderRadius: const BorderRadius.only(
            topLeft: Radius.circular(20),
            topRight: Radius.circular(20),
            bottomLeft: Radius.circular(6),
            bottomRight: Radius.circular(20),
          ),
          border: Border.all(color: theme.colorScheme.outlineVariant),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _MessageHeader(role: message.role),
            const SizedBox(height: 10),
            for (var index = 0; index < segments.length; index++) ...[
              _MessageSegmentView(
                message: message,
                segment: segments[index],
                onResolvePermission: onResolvePermission,
              ),
              if (index < segments.length - 1) const SizedBox(height: 10),
            ],
            if (segments.isEmpty && message.content.trim().isNotEmpty)
              _MessageMarkdown(content: message.content),
            if (message.isStreaming) ...[
              const SizedBox(height: 10),
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  SizedBox(
                    width: 14,
                    height: 14,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: theme.colorScheme.primary,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    '实时生成中',
                    style: theme.textTheme.labelMedium?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                ],
              ),
            ],
            if (incompleteError != null) ...[
              const SizedBox(height: 10),
              DecoratedBox(
                decoration: BoxDecoration(
                  color: theme.colorScheme.errorContainer.withValues(
                    alpha: 0.7,
                  ),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 10,
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(
                        Icons.error_outline,
                        size: 16,
                        color: theme.colorScheme.onErrorContainer,
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          '本轮在输出过程中中断：$incompleteError',
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: theme.colorScheme.onErrorContainer,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
            if (restartSuggestion != null && onRestartConversation != null) ...[
              const SizedBox(height: 10),
              _RestartConversationCard(
                publishedVersionNumber: restartSuggestion.publishedVersionNumber,
                onRestartConversation: onRestartConversation!,
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _MessageHeader extends StatelessWidget {
  const _MessageHeader({required this.role});

  final MessageRole role;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final (label, icon) = switch (role) {
      MessageRole.system => ('系统', Icons.settings_outlined),
      MessageRole.tool => ('工具', Icons.build_outlined),
      _ => ('Agent', Icons.auto_awesome_outlined),
    };

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 14, color: theme.colorScheme.onSurfaceVariant),
        const SizedBox(width: 6),
        Text(
          label,
          style: theme.textTheme.labelMedium?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
            fontWeight: FontWeight.w700,
          ),
        ),
      ],
    );
  }
}

class _MessageSegmentView extends StatelessWidget {
  const _MessageSegmentView({
    required this.message,
    required this.segment,
    required this.onResolvePermission,
  });

  final ConversationMessageDto message;
  final MessageSegment segment;
  final Future<void> Function(
    String toolCallId,
    String action, {
    String? rememberScope,
  })?
  onResolvePermission;

  @override
  Widget build(BuildContext context) {
    switch (segment.kind) {
      case MessageSegmentKind.text:
        return _MessageMarkdown(content: segment.content ?? '');
      case MessageSegmentKind.thinking:
        return _ThinkingBlock(content: segment.content ?? '');
      case MessageSegmentKind.toolCall:
        final toolCall = message.toolCalls
            .where((item) => item.id == segment.toolCallId)
            .cast<ConversationToolCallDto?>()
            .firstWhere((item) => item != null, orElse: () => null);
        if (toolCall == null) {
          return const SizedBox.shrink();
        }
        return ToolCallCard(
          toolCall: toolCall,
          defaultExpanded: toolCall.status.isActive,
          onResolvePermission: onResolvePermission,
        );
    }
  }
}

class _ThinkingBlock extends StatelessWidget {
  const _ThinkingBlock({required this.content});

  final String content;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: theme.colorScheme.tertiaryContainer.withValues(alpha: 0.55),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  Icons.psychology_outlined,
                  size: 14,
                  color: theme.colorScheme.onTertiaryContainer,
                ),
                const SizedBox(width: 6),
                Text(
                  '思考过程',
                  style: theme.textTheme.labelMedium?.copyWith(
                    color: theme.colorScheme.onTertiaryContainer,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            _MessageMarkdown(
              content: content,
              color: theme.colorScheme.onTertiaryContainer,
            ),
          ],
        ),
      ),
    );
  }
}

class _RestartConversationCard extends StatefulWidget {
  const _RestartConversationCard({
    required this.onRestartConversation,
    this.publishedVersionNumber,
  });

  final Future<void> Function() onRestartConversation;
  final int? publishedVersionNumber;

  @override
  State<_RestartConversationCard> createState() =>
      _RestartConversationCardState();
}

class _RestartConversationCardState extends State<_RestartConversationCard> {
  bool _submitting = false;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return DecoratedBox(
      decoration: BoxDecoration(
        color: theme.colorScheme.primaryContainer.withValues(alpha: 0.55),
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
                  Icons.upgrade_outlined,
                  size: 16,
                  color: theme.colorScheme.onPrimaryContainer,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    widget.publishedVersionNumber != null
                        ? 'Agent 已升级到 v${widget.publishedVersionNumber}'
                        : 'Agent 已升级到最新已发布版本',
                    style: theme.textTheme.labelLarge?.copyWith(
                      color: theme.colorScheme.onPrimaryContainer,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              '重启后会新建会话，并继承完整消息历史与已记住的自进化授权策略。',
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onPrimaryContainer,
              ),
            ),
            const SizedBox(height: 12),
            FilledButton.tonalIcon(
              onPressed: _submitting
                  ? null
                  : () async {
                      setState(() => _submitting = true);
                      try {
                        await widget.onRestartConversation();
                      } finally {
                        if (mounted) {
                          setState(() => _submitting = false);
                        }
                      }
                    },
              icon: _submitting
                  ? const SizedBox(
                      width: 14,
                      height: 14,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.refresh),
              label: Text(_submitting ? '重启中…' : '重启到新版本'),
            ),
          ],
        ),
      ),
    );
  }
}

class _MessageMarkdown extends StatelessWidget {
  const _MessageMarkdown({required this.content, this.color});

  final String content;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final textColor = color ?? theme.colorScheme.onSurface;
    return MarkdownBody(
      data: content.isEmpty ? ' ' : content,
      selectable: true,
      shrinkWrap: true,
      styleSheet: MarkdownStyleSheet.fromTheme(theme).copyWith(
        p: theme.textTheme.bodyMedium?.copyWith(color: textColor, height: 1.45),
        pPadding: EdgeInsets.zero,
        code: theme.textTheme.bodySmall?.copyWith(
          fontFamily: 'monospace',
          color: textColor,
        ),
        codeblockDecoration: BoxDecoration(
          color: theme.colorScheme.surfaceContainerHighest.withValues(
            alpha: 0.85,
          ),
          borderRadius: BorderRadius.circular(14),
        ),
        blockquote: theme.textTheme.bodyMedium?.copyWith(
          color: textColor.withValues(alpha: 0.85),
        ),
        blockquotePadding: const EdgeInsets.all(12),
        blockquoteDecoration: BoxDecoration(
          border: Border(
            left: BorderSide(color: theme.colorScheme.primary, width: 3),
          ),
        ),
      ),
    );
  }
}

List<MessageSegment> _resolvedSegments(ConversationMessageDto message) {
  if (message.segments.isNotEmpty) {
    return message.segments;
  }

  return <MessageSegment>[
    if (message.content.trim().isNotEmpty) MessageSegment.text(message.content),
    for (final toolCall in message.toolCalls)
      MessageSegment.toolCall(toolCall.id),
  ];
}

String? _incompleteErrorMessage(ConversationMessageDto message) {
  if (message.isStreaming || message.metadata['incomplete'] != true) {
    return null;
  }

  final error = message.metadata['errorMessage'];
  if (error is String && error.trim().isNotEmpty) {
    return error;
  }

  return null;
}

({int? publishedVersionNumber})? _extractRestartSuggestion(
  ConversationMessageDto message,
) {
  for (final toolCall in message.toolCalls) {
    final root = _asRestartMap(toolCall.result);
    final data = _asRestartMap(root?['data']);
    final suggestion = _asRestartMap(data?['restartSuggestion']);
    if (suggestion == null || suggestion['available'] != true) {
      continue;
    }

    return (
      publishedVersionNumber: suggestion['publishedVersionNumber'] is int
          ? suggestion['publishedVersionNumber'] as int
          : null,
    );
  }

  return null;
}

Map<String, dynamic>? _asRestartMap(Object? value) {
  if (value is String) {
    try {
      return _asRestartMap(jsonDecode(value));
    } catch (_) {
      return null;
    }
  }
  if (value is Map<String, dynamic>) {
    final content = value['content'];
    if (content is List) {
      final text = content
          .map((item) {
            final entry = item is Map<String, dynamic>
                ? item
                : item is Map<Object?, Object?>
                ? item.map((key, data) => MapEntry('$key', data))
                : <String, dynamic>{};
            return entry['type'] == 'text' && entry['text'] is String
                ? entry['text'] as String
                : null;
          })
          .whereType<String>()
          .join();
      if (text.isNotEmpty) {
        final parsed = _asRestartMap(text);
        if (parsed != null) {
          return parsed;
        }
      }
    }
  }
  if (value is Map<String, dynamic>) {
    return value;
  }
  if (value is Map<Object?, Object?>) {
    return _asRestartMap(value.map((key, item) => MapEntry('$key', item)));
  }
  return null;
}
