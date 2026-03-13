import 'package:flutter/material.dart';

import '../providers/execution_monitor_provider.dart';

/// 连接模式指示器
///
/// 显示当前执行监控的连接模式（WebSocket / Polling / Reconnecting / Disconnected），
/// 通过颜色圆点 + 文字标签直观展示。
class ConnectionModeIndicator extends StatelessWidget {
  const ConnectionModeIndicator({super.key, required this.mode});

  final ConnectionMode mode;

  Color _dotColor() {
    return switch (mode) {
      ConnectionMode.websocket => Colors.green,
      ConnectionMode.reconnecting => Colors.amber,
      ConnectionMode.polling => Colors.orange,
      ConnectionMode.disconnected => Colors.red,
    };
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 8,
          height: 8,
          decoration: BoxDecoration(color: _dotColor(), shape: BoxShape.circle),
        ),
        const SizedBox(width: 4),
        Text(
          mode.label,
          style: theme.textTheme.bodySmall?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
          ),
        ),
      ],
    );
  }
}
