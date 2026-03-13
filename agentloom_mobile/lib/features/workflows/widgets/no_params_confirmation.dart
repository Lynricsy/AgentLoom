import 'package:flutter/material.dart';

/// 无参数工作流确认 Widget
class NoParamsConfirmation extends StatelessWidget {
  final String workflowName;
  final bool isSubmitting;
  final VoidCallback onConfirm;
  final VoidCallback onCancel;

  const NoParamsConfirmation({
    super.key,
    required this.workflowName,
    required this.isSubmitting,
    required this.onConfirm,
    required this.onCancel,
  });

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
              Icons.play_circle_outline,
              size: 64,
              color: theme.colorScheme.primary,
            ),
            const SizedBox(height: 24),
            Text(
              workflowName,
              style: theme.textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.w600,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            Text(
              '此工作流无需参数输入，是否直接启动？',
              style: theme.textTheme.bodyLarge?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 32),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                OutlinedButton(
                  onPressed: isSubmitting ? null : onCancel,
                  child: const Text('取消'),
                ),
                const SizedBox(width: 16),
                FilledButton.icon(
                  onPressed: isSubmitting ? null : onConfirm,
                  icon: isSubmitting
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : const Icon(Icons.play_arrow),
                  label: const Text('启动运行'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
