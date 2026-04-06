import 'package:flutter/material.dart';

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
  });

  final TextEditingController controller;
  final VoidCallback onSend;
  final VoidCallback onPickFile;
  final VoidCallback onPickImage;
  final VoidCallback? onCancel;
  final bool isBusy;
  final String? hintText;

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
        child: Row(
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
                onSubmitted: (_) => onSend(),
                decoration: InputDecoration(
                  hintText: hintText ?? (isBusy ? 'Agent 正在处理中…' : '输入消息…'),
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
                              child: CircularProgressIndicator(strokeWidth: 2),
                            ),
                          ))
                  : IconButton.filled(
                      key: const ValueKey('send-button'),
                      onPressed: onSend,
                      icon: const Icon(Icons.send),
                    ),
            ),
          ],
        ),
      ),
    );
  }
}
