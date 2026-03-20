import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../models/auth_tokens.dart';
import '../providers/auth_provider.dart';

/// OAuth 回调处理屏幕
///
/// 通过 `agentloom://auth/callback?access_token=...&refresh_token=...` 深链触发。
/// 提取 tokens → 调用 [AuthNotifier.handleOAuthCallback] → 跳转 Dashboard。
/// 若 tokens 缺失或处理失败，则跳转 /login。
class AuthCallbackScreen extends ConsumerStatefulWidget {
  const AuthCallbackScreen({
    required this.accessToken,
    required this.refreshToken,
    super.key,
  });

  final String? accessToken;
  final String? refreshToken;

  @override
  ConsumerState<AuthCallbackScreen> createState() => _AuthCallbackScreenState();
}

class _AuthCallbackScreenState extends ConsumerState<AuthCallbackScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _handleCallback());
  }

  Future<void> _handleCallback() async {
    final accessToken = widget.accessToken;
    final refreshToken = widget.refreshToken;

    if (accessToken == null ||
        accessToken.isEmpty ||
        refreshToken == null ||
        refreshToken.isEmpty) {
      if (mounted) context.go('/login');
      return;
    }

    final tokens = AuthTokens(
      accessToken: accessToken,
      refreshToken: refreshToken,
      expiresIn: 3600,
    );

    try {
      await ref.read(authProvider.notifier).handleOAuthCallback(tokens);
      if (mounted) context.go('/dashboard');
    } catch (_) {
      if (mounted) context.go('/login');
    }
  }

  @override
  Widget build(BuildContext context) {
    return const Scaffold(body: Center(child: CircularProgressIndicator()));
  }
}
