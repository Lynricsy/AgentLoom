import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../routes/route_names.dart';
import '../../../shared/providers/env_provider.dart';
import '../models/auth_state.dart';
import '../providers/auth_provider.dart';
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

    final authState = ref.read(authProvider).value;
    if (authState is AuthStateMfaRequired) {
      _passwordController.clear();
      context.go(
        '/mfa-verify',
        extra: {'mfaToken': authState.mfaToken, 'factors': authState.factors},
      );
    } else if (authState is AuthStateUnauthenticated) {
      _passwordController.clear();
    }
  }

  Future<void> _handleOAuthLogin(String provider) async {
    await ref.read(authProvider.notifier).signInWithOAuth(provider);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final authState = ref.watch(authProvider);
    final env = ref.watch(envProvider);
    final isLoading = authState.isLoading;

    String? errorMessage;
    final stateValue = authState.value;
    if (stateValue is AuthStateUnauthenticated) {
      errorMessage = stateValue.message;
    }

    return Scaffold(
      body: DecoratedBox(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              theme.scaffoldBackgroundColor,
              theme.colorScheme.surfaceContainerLow,
            ],
          ),
        ),
        child: SafeArea(
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    OutlinedButton.icon(
                      onPressed: () => context.pushNamed(RouteNames.serverConfig),
                      icon: const Icon(Icons.dns_rounded),
                      label: Text(env.displayHost),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: Center(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 20,
                      vertical: 24,
                    ),
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 520),
                      child: Card(
                        child: Padding(
                          padding: const EdgeInsets.fromLTRB(24, 26, 24, 24),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              Container(
                                width: 64,
                                height: 64,
                                decoration: BoxDecoration(
                                  gradient: LinearGradient(
                                    colors: [
                                      theme.colorScheme.primary,
                                      theme.colorScheme.secondary,
                                    ],
                                  ),
                                  borderRadius: BorderRadius.circular(22),
                                ),
                                child: const Icon(
                                  Icons.hub_rounded,
                                  color: Colors.white,
                                  size: 30,
                                ),
                              ),
                              const SizedBox(height: 20),
                              Text(
                                'AgentLoom',
                                style: theme.textTheme.headlineMedium,
                              ),
                              const SizedBox(height: 8),
                              Text(
                                '移动工作台',
                                style: theme.textTheme.titleMedium?.copyWith(
                                  color: theme.colorScheme.primary,
                                ),
                              ),
                              const SizedBox(height: 8),
                              Text(
                                '在移动端管理资源、运行工作流、与 Agent 对话，并在需要时继续跳转 Web Studio 进行画布编排。',
                                style: theme.textTheme.bodyMedium?.copyWith(
                                  color: theme.colorScheme.onSurfaceVariant,
                                ),
                              ),
                              const SizedBox(height: 28),
                              AuthTextField(
                                controller: _emailController,
                                label: '邮箱',
                                keyboardType: TextInputType.emailAddress,
                                enabled: !isLoading,
                              ),
                              const SizedBox(height: 16),
                              AuthTextField(
                                controller: _passwordController,
                                label: '密码',
                                obscureText: _obscurePassword,
                                onToggleVisibility: () {
                                  setState(
                                    () => _obscurePassword = !_obscurePassword,
                                  );
                                },
                                enabled: !isLoading,
                              ),
                              const SizedBox(height: 22),
                              FilledButton(
                                onPressed:
                                    (_isFormValid && !isLoading) ? _handleLogin : null,
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
                              if (errorMessage != null) ...[
                                const SizedBox(height: 14),
                                Text(
                                  errorMessage,
                                  textAlign: TextAlign.center,
                                  style: theme.textTheme.bodySmall?.copyWith(
                                    color: theme.colorScheme.error,
                                  ),
                                ),
                              ],
                              const SizedBox(height: 28),
                              Row(
                                children: [
                                  const Expanded(child: Divider()),
                                  Padding(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 16,
                                    ),
                                    child: Text(
                                      '或使用第三方登录',
                                      style: theme.textTheme.bodySmall,
                                    ),
                                  ),
                                  const Expanded(child: Divider()),
                                ],
                              ),
                              const SizedBox(height: 20),
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
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
