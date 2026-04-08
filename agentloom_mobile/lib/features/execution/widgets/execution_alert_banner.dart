import 'package:flutter/material.dart';

import '../models/execution_state.dart';
import '../models/execution_status.dart';

/// 执行告警横幅
///
/// 仅在执行状态为 failed 或 cancelled 时显示，
/// 提供错误信息或取消提示。
class ExecutionAlertBanner extends StatelessWidget {
  const ExecutionAlertBanner({super.key, required this.snapshot});

  final ExecutionStateSnapshot snapshot;

  @override
  Widget build(BuildContext context) {
    final executionStatus = snapshot.executionStatus;

    if (executionStatus != ExecutionStatus.failed &&
        executionStatus != ExecutionStatus.cancelled) {
      return const SizedBox.shrink();
    }

    final isFailed = executionStatus == ExecutionStatus.failed;
    final color = isFailed ? Colors.red : Colors.orange;
    final icon = isFailed ? Icons.error : Icons.cancel;
    final message = isFailed ? _failedMessage() : '执行已取消';

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Container(
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(8),
          border: Border(left: BorderSide(color: color, width: 4)),
        ),
        padding: const EdgeInsets.all(12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, color: color, size: 20),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                message,
                style: Theme.of(
                  context,
                ).textTheme.bodyMedium?.copyWith(color: color),
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// 从 steps 中提取首个失败步骤的错误信息
  String _failedMessage() {
    final failedStep = snapshot.steps.cast<StepSnapshot?>().firstWhere(
      (step) => StepStatus.fromJson(step!.status) == StepStatus.failed,
      orElse: () => null,
    );

    if (failedStep == null) {
      return 'Execution failed';
    }

    final nodeName = failedStep.nodeName ?? failedStep.nodeId;
    final summary = failedStep.errorMessage;
    if (summary == null || summary.isEmpty) {
      return '$nodeName failed';
    }

    return '$nodeName failed: $summary';
  }
}
