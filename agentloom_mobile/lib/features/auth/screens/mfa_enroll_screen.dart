import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../providers/mfa_provider.dart';

/// MFA TOTP 注册页面 — 从设置页发起 TOTP 设置
///
/// 流程：
/// 1. 调用 enrollTotp 获取 QR URI + secret
/// 2. 展示 secret key（手动输入）
/// 3. 用户输入验证码确认注册
/// 4. 注册成功后返回
class MfaEnrollScreen extends ConsumerStatefulWidget {
  const MfaEnrollScreen({super.key});

  @override
  ConsumerState<MfaEnrollScreen> createState() => _MfaEnrollScreenState();
}

class _MfaEnrollScreenState extends ConsumerState<MfaEnrollScreen> {
  final _codeController = TextEditingController();
  final _focusNode = FocusNode();
  bool _isVerifying = false;
  String? _verifyError;

  @override
  void initState() {
    super.initState();
    // 初始化时发起 TOTP 注册
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(mfaProvider.notifier).enrollTotp();
    });
  }

  @override
  void dispose() {
    _codeController.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  Future<void> _handleVerify() async {
    final code = _codeController.text.trim();
    if (code.length != 6) return;

    final mfaState = ref.read(mfaProvider);
    if (mfaState is! MfaEnrollSuccess) return;

    setState(() {
      _isVerifying = true;
      _verifyError = null;
    });

    _focusNode.unfocus();

    await ref
        .read(mfaProvider.notifier)
        .verifyTotp(factorId: mfaState.factorId, code: code);

    if (!mounted) return;

    final resultState = ref.read(mfaProvider);
    if (resultState is MfaVerifySuccess) {
      // 注册成功
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('多因素认证已启用'),
            behavior: SnackBarBehavior.floating,
          ),
        );
        context.pop();
      }
    } else if (resultState is MfaError) {
      setState(() {
        _isVerifying = false;
        _verifyError = resultState.message;
      });
      _codeController.clear();
      _focusNode.requestFocus();
    } else {
      setState(() {
        _isVerifying = false;
      });
    }
  }

  void _copyToClipboard(String text) {
    Clipboard.setData(ClipboardData(text: text));
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('密钥已复制到剪贴板'),
        behavior: SnackBarBehavior.floating,
        duration: Duration(seconds: 2),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final mfaState = ref.watch(mfaProvider);
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    return Scaffold(
      appBar: AppBar(title: const Text('设置两步验证')),
      body: SafeArea(child: _buildBody(mfaState, theme, colorScheme)),
    );
  }

  Widget _buildBody(
    MfaState mfaState,
    ThemeData theme,
    ColorScheme colorScheme,
  ) {
    // 加载中 — 正在获取注册信息
    if (mfaState is MfaLoading && !_isVerifying) {
      return const Center(child: CircularProgressIndicator());
    }

    // 注册请求失败
    if (mfaState is MfaError && !_isVerifying) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.error_outline, size: 48, color: colorScheme.error),
              const SizedBox(height: 16),
              Text(
                mfaState.message,
                textAlign: TextAlign.center,
                style: theme.textTheme.bodyLarge?.copyWith(
                  color: colorScheme.error,
                ),
              ),
              const SizedBox(height: 24),
              OutlinedButton(
                onPressed: () {
                  ref.read(mfaProvider.notifier).enrollTotp();
                },
                child: const Text('重试'),
              ),
            ],
          ),
        ),
      );
    }

    // 注册成功 — 展示密钥和验证输入
    if (mfaState is MfaEnrollSuccess) {
      return _buildEnrollContent(mfaState, theme, colorScheme);
    }

    // 其他状态（如验证中的 loading）
    return const Center(child: CircularProgressIndicator());
  }

  Widget _buildEnrollContent(
    MfaEnrollSuccess enrollData,
    ThemeData theme,
    ColorScheme colorScheme,
  ) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // 步骤 1：说明
          Icon(Icons.security, size: 48, color: colorScheme.primary),
          const SizedBox(height: 16),
          Text(
            '配置身份验证器应用',
            textAlign: TextAlign.center,
            style: theme.textTheme.titleLarge?.copyWith(
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            '在身份验证器应用（如 Google Authenticator、Authy）中添加以下密钥：',
            textAlign: TextAlign.center,
            style: theme.textTheme.bodyMedium?.copyWith(
              color: colorScheme.onSurfaceVariant,
            ),
          ),
          const SizedBox(height: 24),

          // 步骤 2：密钥展示
          Card(
            elevation: 0,
            color: colorScheme.surfaceContainerHighest,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  Text(
                    '密钥',
                    style: theme.textTheme.labelMedium?.copyWith(
                      color: colorScheme.onSurfaceVariant,
                    ),
                  ),
                  const SizedBox(height: 8),
                  SelectableText(
                    enrollData.secret,
                    textAlign: TextAlign.center,
                    style: theme.textTheme.titleMedium?.copyWith(
                      fontFamily: 'monospace',
                      fontWeight: FontWeight.bold,
                      letterSpacing: 2,
                    ),
                  ),
                  const SizedBox(height: 12),
                  OutlinedButton.icon(
                    onPressed: () => _copyToClipboard(enrollData.secret),
                    icon: const Icon(Icons.copy, size: 18),
                    label: const Text('复制密钥'),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 32),

          // 步骤 3：验证码输入
          Text(
            '输入验证码确认设置',
            textAlign: TextAlign.center,
            style: theme.textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            '打开身份验证器应用，输入显示的 6 位验证码',
            textAlign: TextAlign.center,
            style: theme.textTheme.bodySmall?.copyWith(
              color: colorScheme.onSurfaceVariant,
            ),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _codeController,
            focusNode: _focusNode,
            enabled: !_isVerifying,
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
                color: colorScheme.onSurfaceVariant.withValues(alpha: 0.3),
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

          // 确认按钮
          FilledButton(
            onPressed: (_codeController.text.length == 6 && !_isVerifying)
                ? _handleVerify
                : null,
            style: FilledButton.styleFrom(
              minimumSize: const Size.fromHeight(48),
            ),
            child: _isVerifying
                ? const SizedBox(
                    height: 20,
                    width: 20,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white,
                    ),
                  )
                : const Text('确认启用'),
          ),

          // 验证错误提示
          if (_verifyError != null) ...[
            const SizedBox(height: 16),
            Text(
              _verifyError!,
              textAlign: TextAlign.center,
              style: TextStyle(color: colorScheme.error, fontSize: 14),
            ),
          ],
          const SizedBox(height: 32),
        ],
      ),
    );
  }
}
