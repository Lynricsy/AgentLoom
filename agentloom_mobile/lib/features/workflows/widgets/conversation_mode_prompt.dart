import 'package:flutter/material.dart';

/// 对话模式提示 Widget — 引导用户去 Web 端操作
class ConversationModePrompt extends StatelessWidget {
  final VoidCallback onBack;

  const ConversationModePrompt({super.key, required this.onBack});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.chat_outlined,
              size: 64,
              color: theme.colorScheme.tertiary,
            ),
            const SizedBox(height: 24),
            Text(
              '此工作流需要对话式交互',
              style: theme.textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.w600,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            Text(
              '请在 Web 端启动此工作流以完成对话式参数收集。',
              style: theme.textTheme.bodyLarge?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 32),
            OutlinedButton.icon(
              onPressed: onBack,
              icon: const Icon(Icons.arrow_back),
              label: const Text('返回'),
            ),
          ],
        ),
      ),
    );
  }
}
