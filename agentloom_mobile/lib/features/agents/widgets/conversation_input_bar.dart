import 'package:flutter/material.dart';

import '../conversation_attachment_payload.dart';

class ConversationInputBar extends StatelessWidget {
  const ConversationInputBar({
    super.key,
    required this.controller,
    required this.onSend,
    required this.onPickFile,
    required this.onPickImage,
    required this.isBusy,
    this.onCancel,
    this.hintText,
    this.attachments = const <ConversationDraftAttachment>[],
    this.onRemoveAttachment,
  });

  final TextEditingController controller;
  final VoidCallback onSend;
  final VoidCallback onPickFile;
  final VoidCallback onPickImage;
  final VoidCallback? onCancel;
  final bool isBusy;
  final String? hintText;
  final List<ConversationDraftAttachment> attachments;
  final ValueChanged<int>? onRemoveAttachment;

  bool _canSend(String text) {
    return text.trim().isNotEmpty || attachments.isNotEmpty;
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return SafeArea(
      top: false,
      child: Container(
        padding: const EdgeInsets.fromLTRB(12, 8, 8, 12),
        decoration: BoxDecoration(
          color: theme.colorScheme.surface,
          border: Border(
            top: BorderSide(color: theme.colorScheme.outlineVariant),
          ),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (attachments.isNotEmpty)
              Align(
                alignment: Alignment.centerLeft,
                child: Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (var index = 0; index < attachments.length; index++)
                      _AttachmentChip(
                        attachment: attachments[index],
                        onRemove: onRemoveAttachment == null || isBusy
                            ? null
                            : () => onRemoveAttachment!(index),
                      ),
                  ],
                ),
              ),
            if (attachments.isNotEmpty) const SizedBox(height: 10),
            Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                IconButton(
                  tooltip: '上传文件',
                  onPressed: isBusy ? null : onPickFile,
                  icon: const Icon(Icons.attach_file),
                ),
                IconButton(
                  tooltip: '上传图片',
                  onPressed: isBusy ? null : onPickImage,
                  icon: const Icon(Icons.image_outlined),
                ),
                Expanded(
                  child: TextField(
                    controller: controller,
                    minLines: 1,
                    maxLines: 6,
                    enabled: !isBusy,
                    textInputAction: TextInputAction.send,
                    onSubmitted: (value) {
                      if (_canSend(value)) {
                        onSend();
                      }
                    },
                    decoration: InputDecoration(
                      hintText:
                          hintText ?? (isBusy ? 'Agent 正在处理中…' : '输入消息…'),
                      filled: true,
                      fillColor: theme.colorScheme.surfaceContainerHighest,
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(22),
                        borderSide: BorderSide.none,
                      ),
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 12,
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                AnimatedSwitcher(
                  duration: const Duration(milliseconds: 180),
                  child: isBusy
                      ? (onCancel != null
                            ? IconButton.filledTonal(
                                key: const ValueKey('cancel-button'),
                                onPressed: onCancel,
                                icon: const Icon(Icons.stop),
                              )
                            : const IconButton.filledTonal(
                                key: ValueKey('busy-button'),
                                onPressed: null,
                                icon: SizedBox(
                                  width: 18,
                                  height: 18,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                  ),
                                ),
                              ))
                      : ValueListenableBuilder<TextEditingValue>(
                          valueListenable: controller,
                          builder: (context, value, _) {
                            final canSend = _canSend(value.text);
                            return IconButton.filled(
                              key: const ValueKey('send-button'),
                              onPressed: canSend ? onSend : null,
                              icon: const Icon(Icons.send),
                            );
                          },
                        ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _AttachmentChip extends StatelessWidget {
  const _AttachmentChip({
    required this.attachment,
    this.onRemove,
  });

  final ConversationDraftAttachment attachment;
  final VoidCallback? onRemove;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      constraints: const BoxConstraints(maxWidth: 260),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerLow,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: theme.colorScheme.outlineVariant),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            attachment.kind == 'image'
                ? Icons.image_outlined
                : Icons.insert_drive_file_outlined,
            size: 18,
            color: theme.colorScheme.onSurfaceVariant,
          ),
          const SizedBox(width: 8),
          Flexible(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  attachment.fileName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.labelLarge?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  '${attachment.mimeType} · ${_formatBytes(attachment.sizeBytes)}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.labelSmall?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
              ],
            ),
          ),
          if (onRemove != null) ...[
            const SizedBox(width: 8),
            IconButton(
              tooltip: '移除附件',
              visualDensity: VisualDensity.compact,
              onPressed: onRemove,
              icon: const Icon(Icons.close, size: 18),
            ),
          ],
        ],
      ),
    );
  }
}

String _formatBytes(int bytes) {
  if (bytes < 1024) {
    return '$bytes B';
  }
  if (bytes < 1024 * 1024) {
    return '${(bytes / 1024).toStringAsFixed(1)} KB';
  }
  return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
}
