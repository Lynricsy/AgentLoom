import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers/pty_provider.dart';

/// 只读终端日志查看器
///
/// 功能：
/// - 顶部会话选择器（DropdownButton）
/// - 会话信息（command、status badge、exitCode）
/// - 暗色背景等宽字体 ListView.builder 输出
/// - 新输出自动滚动到底部
class PtyLogViewer extends ConsumerStatefulWidget {
  const PtyLogViewer({super.key});

  @override
  ConsumerState<PtyLogViewer> createState() => _PtyLogViewerState();
}

class _PtyLogViewerState extends ConsumerState<PtyLogViewer> {
  final ScrollController _scrollController = ScrollController();
  int _previousLineCount = 0;

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.jumpTo(_scrollController.position.maxScrollExtent);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final ptyState = ref.watch(ptyProvider);
    final sessions = ptyState.sessionList;

    // 当活跃会话有新输出时自动滚动
    final currentLineCount = ptyState.activeOutputLines.length;
    if (currentLineCount > _previousLineCount) {
      _scrollToBottom();
    }
    _previousLineCount = currentLineCount;

    if (sessions.isEmpty) {
      return const _EmptyState();
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // 会话选择器
        _SessionSelector(
          sessions: sessions,
          activeSessionId: ptyState.activeSessionId,
          onChanged: (id) {
            if (id != null) {
              ref.read(ptyProvider.notifier).setActiveSession(id);
            }
          },
        ),
        // 会话信息
        if (ptyState.activeSession != null)
          _SessionInfoBar(session: ptyState.activeSession!),
        // 终端输出区域
        Expanded(
          child: _TerminalOutput(
            lines: ptyState.activeOutputLines,
            scrollController: _scrollController,
          ),
        ),
      ],
    );
  }
}

/// 空状态提示
class _EmptyState extends StatelessWidget {
  const _EmptyState();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.terminal,
            size: 48,
            color: theme.colorScheme.onSurfaceVariant.withValues(alpha: 0.5),
          ),
          const SizedBox(height: 12),
          Text(
            '暂无终端会话',
            style: theme.textTheme.bodyLarge?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
        ],
      ),
    );
  }
}

/// 会话选择器
class _SessionSelector extends StatelessWidget {
  const _SessionSelector({
    required this.sessions,
    required this.activeSessionId,
    required this.onChanged,
  });

  final List<PtySessionState> sessions;
  final String? activeSessionId;
  final ValueChanged<String?> onChanged;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: DropdownButtonFormField<String>(
        initialValue: activeSessionId,
        decoration: InputDecoration(
          labelText: 'Terminal Session',
          isDense: true,
          border: const OutlineInputBorder(),
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 12,
            vertical: 10,
          ),
          prefixIcon: Icon(
            Icons.terminal,
            size: 20,
            color: theme.colorScheme.primary,
          ),
        ),
        items: sessions.map((session) {
          final label =
              session.info.title ?? session.info.command ?? session.info.id;
          return DropdownMenuItem<String>(
            value: session.info.id,
            child: Text(label, overflow: TextOverflow.ellipsis),
          );
        }).toList(),
        onChanged: onChanged,
      ),
    );
  }
}

/// 会话信息栏
class _SessionInfoBar extends StatelessWidget {
  const _SessionInfoBar({required this.session});

  final PtySessionState session;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final info = session.info;
    final statusColor = _statusColor(info.status);

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      child: Row(
        children: [
          // 命令
          if (info.command != null) ...[
            Icon(
              Icons.code,
              size: 14,
              color: theme.colorScheme.onSurfaceVariant,
            ),
            const SizedBox(width: 4),
            Flexible(
              child: Text(
                info.command!,
                style: theme.textTheme.bodySmall?.copyWith(
                  fontFamily: 'monospace',
                  color: theme.colorScheme.onSurfaceVariant,
                ),
                overflow: TextOverflow.ellipsis,
              ),
            ),
            const SizedBox(width: 12),
          ],
          // 状态徽章
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
            decoration: BoxDecoration(
              color: statusColor.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Text(
              info.status.name,
              style: theme.textTheme.labelSmall?.copyWith(
                color: statusColor,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          // 退出码
          if (session.exitCode != null) ...[
            const SizedBox(width: 8),
            Text(
              'exit: ${session.exitCode}',
              style: theme.textTheme.labelSmall?.copyWith(
                color: session.exitCode == 0 ? Colors.green : Colors.red,
                fontFamily: 'monospace',
              ),
            ),
          ],
          const Spacer(),
          // 行数
          Text(
            '${info.lineCount} lines',
            style: theme.textTheme.labelSmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
        ],
      ),
    );
  }

  Color _statusColor(PtySessionStatus status) {
    return switch (status) {
      PtySessionStatus.running => Colors.green,
      PtySessionStatus.exited => Colors.grey,
      PtySessionStatus.killing => Colors.orange,
      PtySessionStatus.killed => Colors.red,
    };
  }
}

/// 终端输出区域（暗色背景 + 等宽字体）
class _TerminalOutput extends StatelessWidget {
  const _TerminalOutput({required this.lines, required this.scrollController});

  final List<String> lines;
  final ScrollController scrollController;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        color: const Color(0xFF1E1E1E),
        borderRadius: BorderRadius.circular(8),
      ),
      clipBehavior: Clip.antiAlias,
      child: lines.isEmpty
          ? const Center(
              child: Text(
                'Waiting for output...',
                style: TextStyle(
                  color: Color(0xFF808080),
                  fontFamily: 'monospace',
                  fontSize: 13,
                ),
              ),
            )
          : ListView.builder(
              controller: scrollController,
              padding: const EdgeInsets.all(8),
              itemCount: lines.length,
              // 使用固定高度优化大量行的滚动性能
              itemExtent: 18.0,
              itemBuilder: (context, index) {
                return Text(
                  lines[index],
                  style: const TextStyle(
                    color: Color(0xFFD4D4D4),
                    fontFamily: 'monospace',
                    fontSize: 12,
                    height: 1.4,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.clip,
                );
              },
            ),
    );
  }
}
