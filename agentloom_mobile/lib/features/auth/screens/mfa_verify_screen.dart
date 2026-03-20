import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../providers/mfa_provider.dart';

/// MFA 验证码输入页面 — 登录 MFA 挑战时显示
///
/// 用户输入 6 位 TOTP 验证码，满 6 位自动提交。
class MfaVerifyScreen extends ConsumerStatefulWidget {
  const MfaVerifyScreen({
    super.key,
    required this.mfaToken,
    required this.factors,
  });

  final String mfaToken;
  final List<Map<String, dynamic>> factors;

  @override
  ConsumerState<MfaVerifyScreen> createState() => _MfaVerifyScreenState();
}

class _MfaVerifyScreenState extends ConsumerState<MfaVerifyScreen> {
  final _codeController = TextEditingController();
  final _focusNode = FocusNode();
  bool _hasSubmitted = false;

  /// 从 factors 中提取 TOTP factor ID
  String get _factorId {
    for (final factor in widget.factors) {
      final type = factor['factor_type'] ?? factor['factorType'] ?? '';
      if (type == 'totp') {
        return (factor['id'] ?? '') as String;
      }
    }
    // 如果只有一个 factor，直接使用
    if (widget.factors.isNotEmpty) {
      return (widget.factors.first['id'] ?? '') as String;
    }
    return '';
  }

  @override
  void initState() {
    super.initState();
    _codeController.addListener(_onCodeChanged);
    // 自动聚焦输入框
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _focusNode.requestFocus();
    });
  }

  @override
  void dispose() {
    _codeController.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  void _onCodeChanged() {
    final code = _codeController.text;
    if (code.length == 6 && !_hasSubmitted) {
      _handleSubmit();
    }
    // 触发 rebuild 以更新按钮状态
    setState(() {});
  }

  Future<void> _handleSubmit() async {
    final code = _codeController.text.trim();
    if (code.length != 6) return;

    _hasSubmitted = true;
    _focusNode.unfocus();

    await ref
        .read(mfaProvider.notifier)
        .verifyMfaLogin(
          mfaToken: widget.mfaToken,
          factorId: _factorId,
          code: code,
        );

    if (!mounted) return;

    final mfaState = ref.read(mfaProvider);
    if (mfaState is MfaLoginVerifySuccess) {
      // 验证成功 — GoRouter redirect 会自动导航到 dashboard
      context.go('/dashboard');
    } else if (mfaState is MfaError) {
      // 允许重试
      _hasSubmitted = false;
      _codeController.clear();
      _focusNode.requestFocus();
    }
  }

  @override
  Widget build(BuildContext context) {
    final mfaState = ref.watch(mfaProvider);
    final isLoading = mfaState is MfaLoading;
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: isLoading ? null : () => context.go('/login'),
        ),
      ),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // 锁图标
                Icon(Icons.lock_outline, size: 64, color: colorScheme.primary),
                const SizedBox(height: 24),
                // 标题
                Text(
                  '两步验证',
                  textAlign: TextAlign.center,
                  style: theme.textTheme.headlineMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                    color: colorScheme.onSurface,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  '请输入身份验证器应用中的 6 位验证码',
                  textAlign: TextAlign.center,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: colorScheme.onSurfaceVariant,
                  ),
                ),
                const SizedBox(height: 32),
                // 6 位验证码输入框
                TextField(
                  controller: _codeController,
                  focusNode: _focusNode,
                  enabled: !isLoading,
                  keyboardType: TextInputType.number,
                  textAlign: TextAlign.center,
                  maxLength: 6,
                  style: theme.textTheme.headlineMedium?.copyWith(
                    letterSpacing: 8,
                    fontWeight: FontWeight.bold,
                  ),
                  inputFormatters: [
                    FilteringTextInputFormatter.digitsOnly,
                    LengthLimitingTextInputFormatter(6),
                  ],
                  decoration: InputDecoration(
                    counterText: '',
                    hintText: '000000',
                    hintStyle: theme.textTheme.headlineMedium?.copyWith(
                      letterSpacing: 8,
                      color: colorScheme.onSurfaceVariant.withValues(
                        alpha: 0.3,
                      ),
                    ),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                    contentPadding: const EdgeInsets.symmetric(
                      vertical: 16,
                      horizontal: 24,
                    ),
                  ),
                ),
                const SizedBox(height: 24),
                // 验证按钮
                FilledButton(
                  onPressed: (_codeController.text.length == 6 && !isLoading)
                      ? _handleSubmit
                      : null,
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
                      : const Text('验证'),
                ),
                // 错误提示
                if (mfaState is MfaError) ...[
                  const SizedBox(height: 16),
                  Text(
                    mfaState.message,
                    textAlign: TextAlign.center,
                    style: TextStyle(color: colorScheme.error, fontSize: 14),
                  ),
                ],
                const SizedBox(height: 32),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
