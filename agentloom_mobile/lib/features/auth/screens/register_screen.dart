import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../routes/route_names.dart';
import '../../../shared/providers/env_provider.dart';
import '../api/auth_api.dart';
import '../models/auth_state.dart';
import '../providers/auth_provider.dart';
import '../widgets/auth_text_field.dart';

class RegisterScreen extends ConsumerStatefulWidget {
  const RegisterScreen({super.key});

  @override
  ConsumerState<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends ConsumerState<RegisterScreen> {
  static final RegExp _emailRegex = RegExp(r'^[^@]+@[^@]+\.[^@]+');
  static final RegExp _uppercaseRegex = RegExp(r'[A-Z]');
  static final RegExp _lowercaseRegex = RegExp(r'[a-z]');
  static final RegExp _numberRegex = RegExp(r'[0-9]');

  final _displayNameController = TextEditingController();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _confirmPasswordController = TextEditingController();

  bool _obscurePassword = true;
  bool _obscureConfirmPassword = true;
  bool _isFormValid = false;

  @override
  void initState() {
    super.initState();
    _displayNameController.addListener(_validateForm);
    _emailController.addListener(_validateForm);
    _passwordController.addListener(_validateForm);
    _confirmPasswordController.addListener(_validateForm);
  }

  @override
  void dispose() {
    _displayNameController.dispose();
    _emailController.dispose();
    _passwordController.dispose();
    _confirmPasswordController.dispose();
    super.dispose();
  }

  bool _isEmailValid(String email) {
    return _emailRegex.hasMatch(email);
  }

  String? _displayNameError(String value) {
    if (value.trim().length > 100) {
      return '显示名称最多 100 个字符';
    }
    return null;
  }

  String? _emailError(String value) {
    if (value.isEmpty) {
      return '请输入邮箱';
    }
    if (!_isEmailValid(value)) {
      return '请输入有效的邮箱地址';
    }
    return null;
  }

  String? _passwordError(String value) {
    if (value.isEmpty) {
      return '请输入密码';
    }
    if (value.length < 8) {
      return '密码至少 8 个字符';
    }
    if (!_uppercaseRegex.hasMatch(value)) {
      return '密码需包含至少一个大写字母';
    }
    if (!_lowercaseRegex.hasMatch(value)) {
      return '密码需包含至少一个小写字母';
    }
    if (!_numberRegex.hasMatch(value)) {
      return '密码需包含至少一个数字';
    }
    return null;
  }

  String? _confirmPasswordError(String value) {
    if (value.isEmpty) {
      return '请再次输入密码';
    }
    if (value != _passwordController.text) {
      return '两次输入的密码不一致';
    }
    return null;
  }

  void _validateForm() {
    final isValid =
        _displayNameError(_displayNameController.text) == null &&
        _emailError(_emailController.text.trim()) == null &&
        _passwordError(_passwordController.text) == null &&
        _confirmPasswordError(_confirmPasswordController.text) == null;

    if (isValid != _isFormValid) {
      setState(() => _isFormValid = isValid);
    }
  }

  Uri _buildWebOnboardingUri(String studioBaseUrl) {
    final baseUri = Uri.parse(studioBaseUrl);
    final pathSegments = [
      ...baseUri.pathSegments.where((segment) => segment.isNotEmpty),
      'login',
    ];

    return baseUri.replace(
      pathSegments: pathSegments,
      queryParameters: {'returnUrl': '/onboarding'},
    );
  }

  Future<void> _openWebOnboarding() async {
    final env = ref.read(envProvider);
    final targetUri = _buildWebOnboardingUri(env.studioBaseUrl);
    final launched = await launchUrl(
      targetUri,
      mode: LaunchMode.externalApplication,
    );

    if (!mounted || launched) {
      return;
    }

    ScaffoldMessenger.of(
      context,
    ).showSnackBar(const SnackBar(content: Text('无法打开 Web Studio，请检查设备浏览器设置')));
  }

  Future<void> _showRegistrationSuccessDialog({
    required bool emailConfirmationRequired,
  }) async {
    final shouldOpenWeb = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) {
        final title = emailConfirmationRequired ? '注册成功，请先确认邮箱' : '账号已创建';
        final message = emailConfirmationRequired
            ? '我们已经创建了你的账号。请先完成邮箱确认，然后前往 Web Studio 登录并继续首次组织初始化。移动端暂不支持首登组织设置。'
            : '你的账号已经创建成功。首次组织初始化仍需在 Web Studio 完成，建议现在前往 Web Studio 登录并继续 onboarding。完成后再回到移动端登录即可。';

        return AlertDialog(
          title: Text(title),
          content: Text(message),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(false),
              child: const Text('返回登录'),
            ),
            FilledButton.icon(
              onPressed: () => Navigator.of(dialogContext).pop(true),
              icon: const Icon(Icons.open_in_browser),
              label: const Text('前往 Web Studio'),
            ),
          ],
        );
      },
    );

    if (!mounted) {
      return;
    }

    if (shouldOpenWeb == true) {
      await _openWebOnboarding();
    }

    if (!mounted) {
      return;
    }

    context.goNamed(RouteNames.login);
  }

  Future<void> _handleRegister() async {
    final result = await ref
        .read(authProvider.notifier)
        .register(
          _emailController.text.trim(),
          _passwordController.text,
          displayName: _displayNameController.text,
        );

    if (!mounted || result == null) {
      return;
    }

    await _showRegistrationSuccessDialog(
      emailConfirmationRequired: result is AuthRegisterEmailConfirmation,
    );
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

    final emailText = _emailController.text.trim();
    final displayNameText = _displayNameController.text;
    final passwordText = _passwordController.text;
    final confirmPasswordText = _confirmPasswordController.text;

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
                      onPressed: () =>
                          context.pushNamed(RouteNames.serverConfig),
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
                                  Icons.person_add_alt_1_rounded,
                                  color: Colors.white,
                                  size: 30,
                                ),
                              ),
                              const SizedBox(height: 20),
                              Text(
                                '创建账号',
                                style: theme.textTheme.headlineMedium,
                              ),
                              const SizedBox(height: 8),
                              Text(
                                '先完成账号注册，再到 Web Studio 完成首次组织初始化。',
                                style: theme.textTheme.bodyMedium?.copyWith(
                                  color: theme.colorScheme.onSurfaceVariant,
                                ),
                              ),
                              const SizedBox(height: 20),
                              Container(
                                padding: const EdgeInsets.all(14),
                                decoration: BoxDecoration(
                                  color:
                                      theme.colorScheme.surfaceContainerHighest,
                                  borderRadius: BorderRadius.circular(16),
                                ),
                                child: Row(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Icon(
                                      Icons.open_in_browser_outlined,
                                      color: theme.colorScheme.primary,
                                    ),
                                    const SizedBox(width: 12),
                                    Expanded(
                                      child: Text(
                                        '移动端当前只负责创建账号。首次组织创建仍需在 Web Studio 完成，避免留下没有 tenant 的半初始化会话。',
                                        style: theme.textTheme.bodyMedium
                                            ?.copyWith(
                                              color: theme
                                                  .colorScheme
                                                  .onSurfaceVariant,
                                            ),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              const SizedBox(height: 24),
                              AuthTextField(
                                controller: _displayNameController,
                                label: '显示名称（可选）',
                                enabled: !isLoading,
                                errorText: _displayNameError(displayNameText),
                              ),
                              const SizedBox(height: 16),
                              AuthTextField(
                                controller: _emailController,
                                label: '邮箱',
                                keyboardType: TextInputType.emailAddress,
                                enabled: !isLoading,
                                errorText: _emailError(emailText),
                              ),
                              const SizedBox(height: 16),
                              AuthTextField(
                                controller: _passwordController,
                                label: '密码',
                                obscureText: _obscurePassword,
                                enabled: !isLoading,
                                errorText: _passwordError(passwordText),
                                onToggleVisibility: () {
                                  setState(
                                    () => _obscurePassword = !_obscurePassword,
                                  );
                                },
                              ),
                              const SizedBox(height: 16),
                              AuthTextField(
                                controller: _confirmPasswordController,
                                label: '确认密码',
                                obscureText: _obscureConfirmPassword,
                                enabled: !isLoading,
                                errorText: _confirmPasswordError(
                                  confirmPasswordText,
                                ),
                                onToggleVisibility: () {
                                  setState(
                                    () => _obscureConfirmPassword =
                                        !_obscureConfirmPassword,
                                  );
                                },
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
                              const SizedBox(height: 22),
                              FilledButton(
                                onPressed: (_isFormValid && !isLoading)
                                    ? _handleRegister
                                    : null,
                                child: isLoading
                                    ? const SizedBox(
                                        height: 20,
                                        width: 20,
                                        child: CircularProgressIndicator(
                                          strokeWidth: 2,
                                          color: Colors.white,
                                        ),
                                      )
                                    : const Text('注册'),
                              ),
                              const SizedBox(height: 12),
                              TextButton(
                                onPressed: isLoading
                                    ? null
                                    : () => context.goNamed(RouteNames.login),
                                child: const Text('返回登录'),
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
