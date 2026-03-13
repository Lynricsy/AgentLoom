import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers/auth_provider.dart';
import '../models/auth_state.dart';
import '../widgets/auth_text_field.dart';

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
    if (authState is AuthStateUnauthenticated ||
        authState is AuthStateMfaRequired) {
      // 失败或 MFA → 清空密码
      _passwordController.clear();
    }
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authProvider);
    final isLoading = authState.isLoading;

    // 提取错误消息
    String? errorMessage;
    final stateValue = authState.value;
    if (stateValue is AuthStateUnauthenticated) {
      errorMessage = stateValue.message;
    } else if (stateValue is AuthStateMfaRequired) {
      errorMessage = '此账户需要多因素认证，请在 Web 端登录';
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
                // TODO(oauth): 后续 Story 添加 OAuth 按钮区域
              ],
            ),
          ),
        ),
      ),
    );
  }
}
