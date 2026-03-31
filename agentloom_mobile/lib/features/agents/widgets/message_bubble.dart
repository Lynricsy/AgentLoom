import 'package:flutter/material.dart';
import 'package:flutter_markdown_plus/flutter_markdown_plus.dart';

import '../models/conversation_message_dto.dart';
import 'tool_call_card.dart';

class MessageBubble extends StatelessWidget {
  const MessageBubble({
    super.key,
    required this.message,
    this.onResolvePermission,
  });

  final ConversationMessageDto message;
  final Future<void> Function(String toolCallId, String action)?
  onResolvePermission;

  @override
  Widget build(BuildContext context) {
    final isUser = message.role == MessageRole.user;
    final theme = Theme.of(context);
    final segments = _resolvedSegments(message);

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
  final Future<void> Function(String toolCallId, String action)?
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
            .firstWhere(
              (item) => item != null,
              orElse: () => null,
            );
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

class _MessageMarkdown extends StatelessWidget {
  const _MessageMarkdown({
    required this.content,
    this.color,
  });

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
        p: theme.textTheme.bodyMedium?.copyWith(
          color: textColor,
          height: 1.45,
        ),
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
            left: BorderSide(
              color: theme.colorScheme.primary,
              width: 3,
            ),
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
    for (final toolCall in message.toolCalls) MessageSegment.toolCall(toolCall.id),
  ];
}
