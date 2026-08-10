import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/resources_api.dart';
import '../../models/resource_entities.dart';
import '../../widgets/resource_shared.dart';

class CreateProviderSheet extends ConsumerStatefulWidget {
  const CreateProviderSheet({super.key});

  @override
  ConsumerState<CreateProviderSheet> createState() =>
      _CreateProviderSheetState();
}

class _CreateProviderSheetState extends ConsumerState<CreateProviderSheet> {
  final _nameController = TextEditingController();
  final _slugController = TextEditingController();
  final _baseUrlController = TextEditingController();
  final _apiKeyController = TextEditingController();
  String _apiProtocol = 'openai_chat';
  bool _isSaving = false;
  String? _errorMessage;

  @override
  void dispose() {
    _nameController.dispose();
    _slugController.dispose();
    _baseUrlController.dispose();
    _apiKeyController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final name = _nameController.text.trim();
    final baseUrl = _baseUrlController.text.trim();
    if (name.isEmpty) {
      setState(() => _errorMessage = '请填写提供商名称');
      return;
    }
    if (baseUrl.isEmpty) {
      setState(() => _errorMessage = '请填写 Base URL');
      return;
    }

    setState(() {
      _isSaving = true;
      _errorMessage = null;
    });

    try {
      final slug = _slugController.text.trim();
      await ref
          .read(resourcesApiProvider)
          .createLlmProvider(
            name: name,
            baseUrl: baseUrl,
            slug: slug.isNotEmpty ? slug : null,
            apiProtocol: _apiProtocol,
            apiKey: _apiKeyController.text.trim().isEmpty
                ? null
                : _apiKeyController.text.trim(),
          );
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } catch (error) {
      if (!mounted) return;
      setState(() => _errorMessage = describeResourceError(error));
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final viewInsets = MediaQuery.of(context).viewInsets.bottom;

    return Padding(
      padding: EdgeInsets.fromLTRB(20, 12, 20, 24 + viewInsets),
      child: ListView(
        shrinkWrap: true,
        children: [
          Text('添加自定义提供商', style: theme.textTheme.headlineSmall),
          const SizedBox(height: 20),
          TextField(
            controller: _nameController,
            decoration: const InputDecoration(labelText: '提供商名称'),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _slugController,
            decoration: const InputDecoration(
              labelText: '标识 (slug)',
              helperText: '留空则自动生成, 仅小写字母/数字/连字符',
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _baseUrlController,
            decoration: const InputDecoration(
              labelText: 'Base URL',
              hintText: 'https://api.example.com',
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _apiKeyController,
            obscureText: true,
            decoration: const InputDecoration(
              labelText: 'API Key',
              helperText: '可选。填写后会由服务端直接加密托管。',
            ),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: _apiProtocol,
            decoration: const InputDecoration(labelText: 'API 协议'),
            items: llmApiProtocols
                .map((p) => DropdownMenuItem(value: p, child: Text(p)))
                .toList(growable: false),
            onChanged: (value) {
              setState(() {
                _apiProtocol = value ?? _apiProtocol;
              });
            },
          ),
          if (_errorMessage != null) ...[
            const SizedBox(height: 12),
            Text(
              _errorMessage!,
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.error,
              ),
            ),
          ],
          const SizedBox(height: 20),
          FilledButton.icon(
            onPressed: _isSaving ? null : _save,
            icon: _isSaving
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.save_outlined),
            label: const Text('创建'),
          ),
        ],
      ),
    );
  }
}
