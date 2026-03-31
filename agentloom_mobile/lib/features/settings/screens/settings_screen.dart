import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../routes/route_names.dart';
import '../../../shared/providers/env_provider.dart';
import '../widgets/account_section.dart';

/// 设置主页面
class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final envSummary = ref.watch(envSummaryProvider);

    return Scaffold(
      appBar: AppBar(
        title: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.settings_rounded,
              size: 22,
              color: theme.colorScheme.onSurface,
            ),
            const SizedBox(width: 8),
            const Text('Settings'),
          ],
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
        children: [
          Card(
            child: ListTile(
              contentPadding: const EdgeInsets.symmetric(
                horizontal: 18,
                vertical: 8,
              ),
              leading: Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: theme.colorScheme.primary.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Icon(
                  Icons.dns_rounded,
                  color: theme.colorScheme.primary,
                ),
              ),
              title: const Text('连接与服务器'),
              subtitle: Text('当前连接：$envSummary'),
              trailing: const Icon(Icons.chevron_right_rounded),
              onTap: () => context.pushNamed(RouteNames.serverConfig),
            ),
          ),
          const SizedBox(height: 20),
          const _SectionTitle(
            title: '安全',
            subtitle: '管理认证、双因素验证和设备会话。',
          ),
          const SizedBox(height: 12),
          Card(
            child: Column(
              children: [
                ListTile(
                  leading: const Icon(Icons.lock_outline),
                  title: const Text('修改密码'),
                  subtitle: const Text('更新您的账户密码'),
                  trailing: const Icon(Icons.chevron_right_rounded),
                  onTap: () => context.goNamed(RouteNames.changePassword),
                ),
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(Icons.security_outlined),
                  title: const Text('双因素认证'),
                  subtitle: const Text('管理 TOTP 两步验证'),
                  trailing: const Icon(Icons.chevron_right_rounded),
                  onTap: () => context.goNamed(RouteNames.mfaManage),
                ),
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(Icons.devices_outlined),
                  title: const Text('活跃会话'),
                  subtitle: const Text('查看和管理已登录设备'),
                  trailing: const Icon(Icons.chevron_right_rounded),
                  onTap: () => context.goNamed(RouteNames.sessions),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          const AccountSection(),
        ],
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle({
    required this.title,
    required this.subtitle,
  });

  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: theme.textTheme.titleMedium,
        ),
        const SizedBox(height: 4),
        Text(
          subtitle,
          style: theme.textTheme.bodySmall,
        ),
      ],
    );
  }
}
