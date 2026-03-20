import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../features/auth/providers/auth_provider.dart';
import '../../../routes/route_names.dart';

/// 设置主页面 — 显示安全等设置分区
class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(title: const Text('设置')),
      body: ListView(
        children: [
          // 安全分区标题
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
            child: Text(
              '安全',
              style: theme.textTheme.titleSmall?.copyWith(
                color: theme.colorScheme.primary,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),

          // 修改密码
          ListTile(
            leading: const Icon(Icons.lock_outline),
            title: const Text('修改密码'),
            subtitle: const Text('更新您的账户密码'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.goNamed(RouteNames.changePassword),
          ),

          // MFA (双因素认证)
          ListTile(
            leading: const Icon(Icons.security_outlined),
            title: const Text('双因素认证'),
            subtitle: const Text('管理 TOTP 两步验证'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.goNamed(RouteNames.mfaManage),
          ),

          // 活跃会话
          ListTile(
            leading: const Icon(Icons.devices_outlined),
            title: const Text('活跃会话'),
            subtitle: const Text('查看和管理已登录设备'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.goNamed(RouteNames.sessions),
          ),

          const Divider(height: 32),

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

          // 退出登录
          ListTile(
            leading: Icon(Icons.logout, color: theme.colorScheme.error),
            title: Text(
              '退出登录',
              style: TextStyle(color: theme.colorScheme.error),
            ),
            onTap: () => _showLogoutConfirmDialog(context, ref),
          ),
        ],
      ),
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
}
