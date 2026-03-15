import 'package:flutter/material.dart';

import '../models/workflow_input_schema.dart';

/// 对话模式提示 Widget — 引导用户去 Web 端操作
class ConversationModePrompt extends StatelessWidget {
  final VoidCallback onBack;
  final WorkflowInputSchema? schema;

  const ConversationModePrompt({super.key, required this.onBack, this.schema});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final collectionMode = schema?.collectionMode;
    final isHybrid = collectionMode == 'hybrid';
    final conversationPlan = schema?.conversationPlan;
    final systemPrompt = conversationPlan?.systemPrompt.trim();
    final hasSystemPrompt = systemPrompt != null && systemPrompt.isNotEmpty;
    final maxTurnsLabel = conversationPlan == null
        ? null
        : '最多 ${conversationPlan.maxTurns} 轮对话';

    final modeMessage = switch (collectionMode) {
      'hybrid' => '此工作流使用混合模式（表单+对话）收集参数',
      'conversation' => '此工作流使用对话式交互模式收集参数',
      _ => null,
    };
    final legacyMessage = isHybrid ? null : '请在 Web 端启动此工作流以完成对话式参数收集。';

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
              isHybrid ? '此工作流需要混合式参数收集' : '此工作流需要对话式交互',
              style: theme.textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.w600,
              ),
              textAlign: TextAlign.center,
            ),
            if (modeMessage != null) ...[
              const SizedBox(height: 12),
              Text(
                modeMessage,
                style: theme.textTheme.titleMedium,
                textAlign: TextAlign.center,
              ),
            ],
            const SizedBox(height: 16),
            if (legacyMessage != null) ...[
              Text(
                legacyMessage,
                style: theme.textTheme.bodyLarge?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 12),
            ],
            Text(
              '请在 Web 端使用完整功能。',
              style: theme.textTheme.bodyLarge?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
              textAlign: TextAlign.center,
            ),
            if (hasSystemPrompt) ...[
              const SizedBox(height: 20),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: theme.colorScheme.surfaceContainerHighest,
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '系统提示词预览',
                      style: theme.textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(systemPrompt, style: theme.textTheme.bodyMedium),
                    const SizedBox(height: 8),
                    if (maxTurnsLabel != null)
                      Text(
                        maxTurnsLabel,
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                      ),
                  ],
                ),
              ),
            ],
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
