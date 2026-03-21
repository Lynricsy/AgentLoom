import 'package:flutter/material.dart';

import '../models/conversation_message_dto.dart';

/// 底部计算机状态横幅 (Manus 风格)
///
/// 左侧: 计算机缩略图（最新终端行）
/// 右侧: 工具调用意图
class ComputerBanner extends StatelessWidget {
  final String? latestTerminalLine;
  final ToolCallEventData? activeToolCall;
  final bool isSandboxActive;
  final VoidCallback? onTap;

  const ComputerBanner({
    super.key,
    this.latestTerminalLine,
    this.activeToolCall,
    this.isSandboxActive = false,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    if (!isSandboxActive &&
        latestTerminalLine == null &&
        activeToolCall == null) {
      return const SizedBox.shrink();
    }

    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        decoration: BoxDecoration(
          color: theme.colorScheme.surfaceContainerHighest,
          border: Border(
            top: BorderSide(
              color: theme.colorScheme.outlineVariant,
              width: 0.5,
            ),
          ),
        ),
        child: Row(
          children: [
            // 左侧: 计算机缩略图
            Container(
              width: 36,
              height: 28,
              decoration: BoxDecoration(
                color: const Color(0xFF1E1E1E),
                borderRadius: BorderRadius.circular(4),
              ),
              padding: const EdgeInsets.all(4),
              child: Text(
                latestTerminalLine ?? '> _',
                style: const TextStyle(
                  color: Color(0xFF4EC9B0),
                  fontSize: 6,
                  fontFamily: 'monospace',
                  height: 1.2,
                ),
                maxLines: 2,
                overflow: TextOverflow.clip,
              ),
            ),
            const SizedBox(width: 12),

            // 中间: 状态文本
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (activeToolCall != null) ...[
                    Text(
                      activeToolCall!.toolName,
                      style: theme.textTheme.bodySmall?.copyWith(
                        fontWeight: FontWeight.w600,
                        color: theme.colorScheme.onSurface,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ] else if (latestTerminalLine != null) ...[
                    Text(
                      latestTerminalLine!,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                        fontFamily: 'monospace',
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ] else ...[
                    Text(
                      'Sandbox active',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ],
                ],
              ),
            ),

            // 右侧: 展开图标
            Icon(
              Icons.expand_less,
              size: 20,
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ],
        ),
      ),
    );
  }
}
