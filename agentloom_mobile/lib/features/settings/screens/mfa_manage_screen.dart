import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../routes/route_names.dart';
import '../api/settings_api.dart';
import '../providers/settings_provider.dart';

/// MFA 管理页面 — 查看状态、启用/禁用双因素认证
class MfaManageScreen extends ConsumerWidget {
  const MfaManageScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final securityAsync = ref.watch(securityInfoProvider);
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(title: const Text('双因素认证')),
      body: securityAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                Icons.error_outline,
                size: 48,
                color: theme.colorScheme.error,
              ),
              const SizedBox(height: 16),
              Text('加载失败: $error'),
              const SizedBox(height: 16),
              OutlinedButton(
                onPressed: () =>
                    ref.read(securityInfoProvider.notifier).refresh(),
                child: const Text('重试'),
              ),
            ],
          ),
        ),
        data: (info) => _buildContent(context, ref, info, theme),
      ),
    );
  }

  Widget _buildContent(
    BuildContext context,
    WidgetRef ref,
    dynamic info,
    ThemeData theme,
  ) {
    final mfaEnabled = info.mfaEnabled as bool;
    final mfaType = info.mfaType as String?;
    final mfaEnrolledAt = info.mfaEnrolledAt as String?;

    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // 状态卡片
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  Icon(
                    mfaEnabled ? Icons.verified_user : Icons.shield_outlined,
                    size: 48,
                    color: mfaEnabled
                        ? theme.colorScheme.primary
                        : theme.colorScheme.onSurfaceVariant,
                  ),
                  const SizedBox(height: 12),
                  Text(
                    mfaEnabled ? '双因素认证已启用' : '双因素认证未启用',
                    style: theme.textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    mfaEnabled ? '您的账户受到额外安全保护' : '启用双因素认证以增强账户安全',
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                    textAlign: TextAlign.center,
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),

          // MFA 详情（已启用时显示）
          if (mfaEnabled) ...[
            ListTile(
              leading: const Icon(Icons.category_outlined),
              title: const Text('认证类型'),
              subtitle: Text(mfaType?.toUpperCase() ?? 'TOTP'),
            ),
            if (mfaEnrolledAt != null && mfaEnrolledAt.isNotEmpty)
              ListTile(
                leading: const Icon(Icons.calendar_today_outlined),
                title: const Text('启用时间'),
                subtitle: Text(_formatTime(mfaEnrolledAt)),
              ),
            const Divider(height: 32),
          ],

          const Spacer(),

          // 操作按钮
          if (mfaEnabled)
            OutlinedButton.icon(
              onPressed: () => _confirmDisableMfa(context, ref),
              icon: const Icon(Icons.security_outlined),
              label: const Text('禁用双因素认证'),
              style: OutlinedButton.styleFrom(
                foregroundColor: theme.colorScheme.error,
                side: BorderSide(color: theme.colorScheme.error),
              ),
            )
          else
            FilledButton.icon(
              onPressed: () => context.pushNamed(RouteNames.mfaEnroll),
              icon: const Icon(Icons.security),
              label: const Text('启用双因素认证'),
            ),
        ],
      ),
    );
  }

  void _confirmDisableMfa(BuildContext context, WidgetRef ref) {
    final codeController = TextEditingController();

    showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('禁用双因素认证'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('请输入 TOTP 验证码以确认禁用双因素认证。\n此操作将降低账户安全性。'),
            const SizedBox(height: 16),
            TextField(
              controller: codeController,
              keyboardType: TextInputType.number,
              maxLength: 6,
              decoration: const InputDecoration(
                labelText: '验证码',
                border: OutlineInputBorder(),
                counterText: '',
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () {
              codeController.dispose();
              Navigator.of(dialogContext).pop();
            },
            child: const Text('取消'),
          ),
          TextButton(
            onPressed: () async {
              final code = codeController.text.trim();
              if (code.length != 6) return;

              codeController.dispose();
              Navigator.of(dialogContext).pop();

              // 调用 MFA disable API
              try {
                final api = ref.read(settingsApiProvider);
                await api.disableMfa(code);
              } catch (_) {
                // 错误由 refresh 处理
              }

              // 刷新安全信息
              await ref.read(securityInfoProvider.notifier).refresh();

              if (!context.mounted) return;
              ScaffoldMessenger.of(
                context,
              ).showSnackBar(const SnackBar(content: Text('双因素认证已禁用')));
            },
            child: const Text('确认禁用'),
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
