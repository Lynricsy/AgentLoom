import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../config/env.dart';
import '../../../shared/providers/env_provider.dart';

/// 服务器与连接配置页面
class ServerConfigScreen extends ConsumerStatefulWidget {
  const ServerConfigScreen({super.key});

  @override
  ConsumerState<ServerConfigScreen> createState() => _ServerConfigScreenState();
}

class _ServerConfigScreenState extends ConsumerState<ServerConfigScreen> {
  late final TextEditingController _studioBaseUrlController;
  String? _validationMessage;
  bool _isSaving = false;

  @override
  void initState() {
    super.initState();
    final env = ref.read(envProvider);
    _studioBaseUrlController = TextEditingController(text: env.studioBaseUrl);
  }

  @override
  void dispose() {
    _studioBaseUrlController.dispose();
    super.dispose();
  }

  String? _validateStudioBaseUrl(String value) {
    try {
      EnvConfig.normalizeStudioBaseUrl(value);
      return null;
    } on FormatException catch (error) {
      return error.message.toString();
    }
  }

  Future<void> _handleSave() async {
    final validationMessage = _validateStudioBaseUrl(
      _studioBaseUrlController.text,
    );
    setState(() => _validationMessage = validationMessage);

    if (validationMessage != null) {
      return;
    }

    setState(() => _isSaving = true);
    try {
      await ref
          .read(envProvider.notifier)
          .updateStudioBaseUrl(_studioBaseUrlController.text);

      if (!mounted) return;
      final env = ref.read(envProvider);
      _studioBaseUrlController.text = env.studioBaseUrl;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            '连接地址已保存，后续请求将使用 ${env.displayHost}。',
          ),
        ),
      );
    } finally {
      if (mounted) {
        setState(() => _isSaving = false);
      }
    }
  }

  Future<void> _handleReset() async {
    setState(() => _isSaving = true);
    try {
      await ref.read(envProvider.notifier).resetToDefault();
      if (!mounted) return;

      final env = ref.read(envProvider);
      _studioBaseUrlController.text = env.studioBaseUrl;
      setState(() => _validationMessage = null);

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('已恢复为默认连接地址。')),
      );
    } finally {
      if (mounted) {
        setState(() => _isSaving = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final env = ref.watch(envProvider);
    final baseEnv = ref.watch(baseEnvProvider);
    final hasOverride = ref.watch(hasRuntimeEnvOverrideProvider);
    final theme = Theme.of(context);

    String? previewApiBaseUrl;
    final previewValidationMessage = _validateStudioBaseUrl(
      _studioBaseUrlController.text,
    );
    if (previewValidationMessage == null) {
      previewApiBaseUrl = EnvConfig.deriveApiBaseUrl(
        _studioBaseUrlController.text,
      );
    }

    return Scaffold(
      appBar: AppBar(title: const Text('连接与服务器')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 20, 20, 18),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '当前连接',
                    style: theme.textTheme.titleMedium,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    env.studioBaseUrl,
                    style: theme.textTheme.bodyLarge?.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'API 将自动使用 ${env.apiBaseUrl}',
                    style: theme.textTheme.bodySmall,
                  ),
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      Chip(
                        avatar: Icon(
                          hasOverride ? Icons.tune : Icons.check_circle_outline,
                          size: 18,
                          color: theme.colorScheme.primary,
                        ),
                        label: Text(hasOverride ? '使用自定义地址' : '使用默认地址'),
                      ),
                      Chip(
                        avatar: Icon(
                          Icons.open_in_browser_outlined,
                          size: 18,
                          color: theme.colorScheme.primary,
                        ),
                        label: const Text('画布编辑跳转 Web Studio'),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          Card(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 20, 20, 20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Studio 地址',
                    style: theme.textTheme.titleMedium,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    '请输入 Studio 的访问地址。客户端会自动推导 API 地址和 Web handoff 地址。',
                    style: theme.textTheme.bodySmall,
                  ),
                  const SizedBox(height: 18),
                  TextField(
                    controller: _studioBaseUrlController,
                    keyboardType: TextInputType.url,
                    autofillHints: const [AutofillHints.url],
                    onChanged: (_) {
                      if (_validationMessage != null) {
                        setState(() {
                          _validationMessage = _validateStudioBaseUrl(
                            _studioBaseUrlController.text,
                          );
                        });
                      } else {
                        setState(() {});
                      }
                    },
                    decoration: InputDecoration(
                      labelText: 'Studio 基础地址',
                      hintText: 'https://agentloom.ling.plus',
                      errorText: _validationMessage,
                      prefixIcon: const Icon(Icons.public_outlined),
                    ),
                  ),
                  const SizedBox(height: 14),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: theme.colorScheme.surfaceContainerLow,
                      borderRadius: BorderRadius.circular(18),
                      border: Border.all(color: theme.colorScheme.outlineVariant),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '预览',
                          style: theme.textTheme.labelLarge,
                        ),
                        const SizedBox(height: 8),
                        Text(
                          previewValidationMessage == null
                              ? _studioBaseUrlController.text.trim().isEmpty
                                    ? '请输入 Studio 地址'
                                    : EnvConfig.normalizeStudioBaseUrl(
                                        _studioBaseUrlController.text,
                                      )
                              : '地址格式无效，暂无法生成预览',
                          style: theme.textTheme.bodyMedium,
                        ),
                        const SizedBox(height: 6),
                        Text(
                          previewApiBaseUrl == null
                              ? 'API 地址预览不可用'
                              : 'API: $previewApiBaseUrl',
                          style: theme.textTheme.bodySmall,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 18),
                  FilledButton.icon(
                    onPressed: _isSaving ? null : _handleSave,
                    icon: _isSaving
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.save_outlined),
                    label: Text(_isSaving ? '保存中...' : '保存连接地址'),
                  ),
                  const SizedBox(height: 10),
                  OutlinedButton.icon(
                    onPressed: _isSaving || !hasOverride ? null : _handleReset,
                    icon: const Icon(Icons.restart_alt_outlined),
                    label: const Text('恢复默认地址'),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          Card(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 20, 20, 18),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '默认值',
                    style: theme.textTheme.titleMedium,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    baseEnv.studioBaseUrl,
                    style: theme.textTheme.bodyLarge?.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    '默认 API: ${baseEnv.apiBaseUrl}',
                    style: theme.textTheme.bodySmall,
                  ),
                  const SizedBox(height: 14),
                  OutlinedButton.icon(
                    onPressed: _isSaving
                        ? null
                        : () {
                            _studioBaseUrlController.text = baseEnv.studioBaseUrl;
                            setState(() => _validationMessage = null);
                          },
                    icon: const Icon(Icons.content_copy_outlined),
                    label: const Text('填入默认地址'),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
