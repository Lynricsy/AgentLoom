import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../routes/route_names.dart';
import '../widgets/account_section.dart';

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

          // 账户分区 — 邮箱、关联账号、退出登录、退出所有设备
          const AccountSection(),
        ],
      ),
    );
  }
}
