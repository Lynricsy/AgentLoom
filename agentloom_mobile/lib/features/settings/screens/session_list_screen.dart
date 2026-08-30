import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/settings_api.dart';
import '../providers/settings_provider.dart';

/// 活跃会话列表页面
class SessionListScreen extends ConsumerWidget {
  const SessionListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sessionsAsync = ref.watch(sessionListProvider);
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(title: const Text('活跃会话')),
      body: RefreshIndicator(
        onRefresh: () => ref.read(sessionListProvider.notifier).refresh(),
        child: sessionsAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) => _buildErrorView(context, ref, error.toString()),
          data: (sessions) => _buildSessionList(context, ref, sessions, theme),
        ),
      ),
    );
  }

  Widget _buildErrorView(BuildContext context, WidgetRef ref, String error) {
    return ListView(
      children: [
        const SizedBox(height: 120),
        Center(
          child: Column(
            children: [
              Icon(
                Icons.error_outline,
                size: 48,
                color: Theme.of(context).colorScheme.error,
              ),
              const SizedBox(height: 16),
              Text('加载失败: $error'),
              const SizedBox(height: 16),
              OutlinedButton(
                onPressed: () =>
                    ref.read(sessionListProvider.notifier).refresh(),
                child: const Text('重试'),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildSessionList(
    BuildContext context,
    WidgetRef ref,
    List<SessionInfo> sessions,
    ThemeData theme,
  ) {
    if (sessions.isEmpty) {
      return ListView(
        children: const [
          SizedBox(height: 120),
          Center(child: Text('暂无活跃会话')),
        ],
      );
    }

    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemCount: sessions.length,
      separatorBuilder: (_, _) => const Divider(height: 1),
      itemBuilder: (context, index) {
        final session = sessions[index];
        return _SessionTile(session: session);
      },
    );
  }
}

/// 单个会话卡片
class _SessionTile extends ConsumerWidget {
  const _SessionTile({required this.session});
  final SessionInfo session;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);

    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: Icon(
        session.isCurrent ? Icons.phone_android : Icons.devices_other,
        color: session.isCurrent
            ? theme.colorScheme.primary
            : theme.colorScheme.onSurfaceVariant,
      ),
      title: Row(
        children: [
          Expanded(child: Text(session.deviceInfo)),
          if (session.isCurrent)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(
                color: theme.colorScheme.primaryContainer,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(
                '当前',
                style: theme.textTheme.labelSmall?.copyWith(
                  color: theme.colorScheme.onPrimaryContainer,
                ),
              ),
            ),
        ],
      ),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (session.ipAddress.isNotEmpty) Text('IP: ${session.ipAddress}'),
          if (session.lastActiveAt.isNotEmpty)
            Text(
              '最近活跃: ${_formatTime(session.lastActiveAt)}',
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
        ],
      ),
      trailing: session.isCurrent
          ? null
          : IconButton(
              icon: Icon(Icons.logout, color: theme.colorScheme.error),
              tooltip: '注销此会话',
              onPressed: () => _confirmRevoke(context, ref),
            ),
    );
  }

  void _confirmRevoke(BuildContext context, WidgetRef ref) {
    showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('注销会话'),
        content: Text('确定要注销设备 "${session.deviceInfo}" 的会话吗？'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: const Text('取消'),
          ),
          TextButton(
            onPressed: () async {
              Navigator.of(dialogContext).pop();
              try {
                await ref
                    .read(sessionListProvider.notifier)
                    .revokeSession(session.id);
                if (!context.mounted) return;
                ScaffoldMessenger.of(
                  context,
                ).showSnackBar(const SnackBar(content: Text('会话已注销')));
              } catch (e) {
                if (!context.mounted) return;
                ScaffoldMessenger.of(
                  context,
                ).showSnackBar(SnackBar(content: Text('注销失败: $e')));
              }
            },
            child: const Text('注销'),
          ),
        ],
      ),
    );
  }

  String _formatTime(String isoTime) {
    try {
      final dt = DateTime.parse(isoTime);
      final local = dt.toLocal();
      return '${local.year}-${_pad(local.month)}-${_pad(local.day)} '
          '${_pad(local.hour)}:${_pad(local.minute)}';
    } catch (_) {
      return isoTime;
    }
  }

  String _pad(int n) => n.toString().padLeft(2, '0');
}
