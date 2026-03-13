import 'package:flutter/material.dart';

import '../models/execution_state.dart';
import '../models/execution_status.dart';
import 'step_timeline_item.dart';

/// 步骤时间线
///
/// 按运行状态排序后展示所有执行步骤，步骤间用垂直连接线连接。
class StepTimeline extends StatelessWidget {
  const StepTimeline({super.key, required this.steps});

  final List<StepSnapshot> steps;

  @override
  Widget build(BuildContext context) {
    if (steps.isEmpty) {
      return Padding(
        padding: const EdgeInsets.all(16),
        child: Center(
          child: Text(
            'No steps yet',
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
              color: Theme.of(context).colorScheme.onSurfaceVariant,
            ),
          ),
        ),
      );
    }

    final sorted = _sortSteps(steps);

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (int i = 0; i < sorted.length; i++) ...[
            StepTimelineItem(step: sorted[i], isLast: i == sorted.length - 1),
            // 步骤间连接线（最后一个不加）
            if (i < sorted.length - 1)
              Padding(
                padding: const EdgeInsets.only(left: 11),
                child: Container(
                  width: 2,
                  height: 24,
                  color: Colors.grey.shade300,
                ),
              ),
          ],
        ],
      ),
    );
  }

  /// 排序：running 优先 → startedAt 非空次之 → pending 最后
  List<StepSnapshot> _sortSteps(List<StepSnapshot> steps) {
    final list = List<StepSnapshot>.from(steps);
    list.sort((a, b) {
      final statusA = StepStatus.fromJson(a.status);
      final statusB = StepStatus.fromJson(b.status);

      // running 排最前
      if (statusA == StepStatus.running && statusB != StepStatus.running) {
        return -1;
      }
      if (statusB == StepStatus.running && statusA != StepStatus.running) {
        return 1;
      }

      // 有 startedAt 的排前面
      if (a.startedAt != null && b.startedAt == null) return -1;
      if (b.startedAt != null && a.startedAt == null) return 1;

      // 都有 startedAt 按时间排序
      if (a.startedAt != null && b.startedAt != null) {
        return a.startedAt!.compareTo(b.startedAt!);
      }

      // pending 保持原序
      return 0;
    });
    return list;
  }
}
