import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../providers/auth_provider.dart';
import '../models/auth_state.dart';
import '../widgets/auth_text_field.dart';
import '../widgets/oauth_button.dart';

/// 登录页面
class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _obscurePassword = true;
  bool _isFormValid = false;

  @override
  void initState() {
    super.initState();
    _emailController.addListener(_validateForm);
    _passwordController.addListener(_validateForm);
  }

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  void _validateForm() {
    final emailValid = _isEmailValid(_emailController.text);
    final passwordValid = _passwordController.text.isNotEmpty;
    final newValid = emailValid && passwordValid;
    if (newValid != _isFormValid) {
      setState(() => _isFormValid = newValid);
    }
  }

  bool _isEmailValid(String email) {
    return RegExp(r'^[^@]+@[^@]+\.[^@]+').hasMatch(email);
  }

  Future<void> _handleLogin() async {
    await ref
        .read(authProvider.notifier)
        .login(_emailController.text.trim(), _passwordController.text);

    if (!mounted) return;

    // 检查登录后状态
    final authState = ref.read(authProvider).value;
    if (authState is AuthStateMfaRequired) {
      // MFA 挑战 → 导航到 MFA 验证页面
      _passwordController.clear();
      if (mounted) {
        context.go(
          '/mfa-verify',
          extra: {'mfaToken': authState.mfaToken, 'factors': authState.factors},
        );
      }
    } else if (authState is AuthStateUnauthenticated) {
      // 登录失败 → 清空密码
      _passwordController.clear();
    }
  }

  Future<void> _handleOAuthLogin(String provider) async {
    await ref.read(authProvider.notifier).signInWithOAuth(provider);
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authProvider);
    final isLoading = authState.isLoading;

    // 提取错误消息（MFA 状态不再显示错误，而是导航到 MFA 验证页面）
    String? errorMessage;
    final stateValue = authState.value;
    if (stateValue is AuthStateUnauthenticated) {
      errorMessage = stateValue.message;
    }

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const SizedBox(height: 48),
                // 应用标题
                Text(
                  'AgentLoom',
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.headlineLarge?.copyWith(
                    fontWeight: FontWeight.bold,
                    color: Theme.of(context).colorScheme.primary,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  '多智能体工作流编排平台',
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
                ),
                const SizedBox(height: 48),
                // 邮箱输入框
                AuthTextField(
                  controller: _emailController,
                  label: '邮箱',
                  keyboardType: TextInputType.emailAddress,
                  enabled: !isLoading,
                ),
                const SizedBox(height: 16),
                // 密码输入框
                AuthTextField(
                  controller: _passwordController,
                  label: '密码',
                  obscureText: _obscurePassword,
                  onToggleVisibility: () {
                    setState(() => _obscurePassword = !_obscurePassword);
                  },
                  enabled: !isLoading,
                ),
                const SizedBox(height: 24),
                // 登录按钮
                FilledButton(
                  onPressed: (_isFormValid && !isLoading) ? _handleLogin : null,
                  style: FilledButton.styleFrom(
                    minimumSize: const Size.fromHeight(48),
                  ),
                  child: isLoading
                      ? const SizedBox(
                          height: 20,
                          width: 20,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : const Text('登录'),
                ),
                // 错误提示
                if (errorMessage != null) ...[
                  const SizedBox(height: 16),
                  Text(
                    errorMessage,
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.error,
                      fontSize: 14,
                    ),
                  ),
                ],
                const SizedBox(height: 32),
                // OAuth 分隔线
                Row(
                  children: [
                    const Expanded(child: Divider()),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: Text(
                        '或',
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: Theme.of(context).colorScheme.onSurfaceVariant,
                        ),
                      ),
                    ),
                    const Expanded(child: Divider()),
                  ],
                ),
                const SizedBox(height: 24),
                // Google OAuth 按钮
                OAuthButton(
                  provider: 'google',
                  label: '使用 Google 登录',
                  icon: Icons.g_mobiledata,
                  backgroundColor: const Color(0xFF4285F4),
                  foregroundColor: Colors.white,
                  isLoading: isLoading,
                  onPressed: () => _handleOAuthLogin('google'),
                ),
                const SizedBox(height: 12),
                // GitHub OAuth 按钮
                OAuthButton(
                  provider: 'github',
                  label: '使用 GitHub 登录',
                  icon: Icons.code,
                  backgroundColor: const Color(0xFF24292E),
                  foregroundColor: Colors.white,
                  isLoading: isLoading,
                  onPressed: () => _handleOAuthLogin('github'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
