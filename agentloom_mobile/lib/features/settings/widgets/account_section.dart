import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../features/auth/models/auth_state.dart';
import '../../../features/auth/providers/auth_provider.dart';
import '../providers/settings_provider.dart';

/// 设置页面 - 账户分区
///
/// 显示当前用户邮箱、已关联的 OAuth 提供商、退出登录和退出所有设备功能。
class AccountSection extends ConsumerWidget {
  const AccountSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final authState = ref.watch(authProvider);
    final securityInfoAsync = ref.watch(securityInfoProvider);
    final revokeAllState = ref.watch(revokeAllSessionsProvider);

    // 从认证状态提取邮箱
    String? email;
    final authValue = authState.value;
    if (authValue is AuthStateAuthenticated) {
      email = authValue.user.email;
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // 账户分区标题
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
          child: Text(
            '账户',
            style: theme.textTheme.titleSmall?.copyWith(
              color: theme.colorScheme.primary,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),

        // 邮箱信息
        if (email != null && email.isNotEmpty)
          ListTile(
            leading: const Icon(Icons.email_outlined),
            title: const Text('邮箱'),
            subtitle: Text(
              email,
              style: TextStyle(
                color: theme.colorScheme.onSurface.withValues(alpha: 0.6),
              ),
            ),
          ),

        // 已关联的 OAuth 提供商
        securityInfoAsync.when(
          data: (info) {
            if (info.linkedProviders.isEmpty) return const SizedBox.shrink();
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, 4),
                  child: Text(
                    '关联账号',
                    style: theme.textTheme.labelMedium?.copyWith(
                      color: theme.colorScheme.onSurface.withValues(alpha: 0.5),
                    ),
                  ),
                ),
                ...info.linkedProviders.map(
                  (p) => ListTile(
                    leading: const Icon(Icons.link_outlined),
                    title: Text(_providerDisplayName(p)),
                    dense: true,
                  ),
                ),
              ],
            );
          },
          loading: () => const SizedBox.shrink(),
          error: (_, __) => const SizedBox.shrink(),
        ),

        // 退出登录
        ListTile(
          leading: Icon(Icons.logout, color: theme.colorScheme.error),
          title: Text('退出登录', style: TextStyle(color: theme.colorScheme.error)),
          onTap: () => _showLogoutConfirmDialog(context, ref),
        ),

        // 退出所有设备
        ListTile(
          leading: revokeAllState is RevokeAllSessionsLoading
              ? SizedBox(
                  width: 24,
                  height: 24,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: theme.colorScheme.error,
                  ),
                )
              : Icon(Icons.devices_outlined, color: theme.colorScheme.error),
          title: Text(
            '退出所有设备',
            style: TextStyle(color: theme.colorScheme.error),
          ),
          subtitle: const Text('在所有已登录设备上退出'),
          onTap: revokeAllState is RevokeAllSessionsLoading
              ? null
              : () => _showRevokeAllConfirmDialog(context, ref),
        ),
      ],
    );
  }

  void _showLogoutConfirmDialog(BuildContext context, WidgetRef ref) {
    showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('确认退出'),
        content: const Text('确定要退出登录吗？'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: const Text('取消'),
          ),
          TextButton(
            onPressed: () {
              Navigator.of(dialogContext).pop();
              ref.read(authProvider.notifier).logout();
            },
            child: const Text('退出'),
          ),
        ],
      ),
    );
  }

  void _showRevokeAllConfirmDialog(BuildContext context, WidgetRef ref) {
    showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('退出所有设备'),
        content: const Text('确定要在所有设备上退出登录吗？此操作将注销所有活跃会话。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: const Text('取消'),
          ),
          TextButton(
            onPressed: () {
              Navigator.of(dialogContext).pop();
              _revokeAllAndLogout(context, ref);
            },
            style: TextButton.styleFrom(
              foregroundColor: Theme.of(dialogContext).colorScheme.error,
            ),
            child: const Text('退出所有设备'),
          ),
        ],
      ),
    );
  }

  Future<void> _revokeAllAndLogout(BuildContext context, WidgetRef ref) async {
    await ref.read(revokeAllSessionsProvider.notifier).revokeAll();
    if (!context.mounted) return;
    await ref.read(authProvider.notifier).logout();
  }

  /// 将提供商标识符转换为友好显示名称
  String _providerDisplayName(String provider) {
    switch (provider.toLowerCase()) {
      case 'google':
        return 'Google';
      case 'github':
        return 'GitHub';
      case 'facebook':
        return 'Facebook';
      case 'apple':
        return 'Apple';
      case 'microsoft':
        return 'Microsoft';
      default:
        return provider;
    }
  }
}
