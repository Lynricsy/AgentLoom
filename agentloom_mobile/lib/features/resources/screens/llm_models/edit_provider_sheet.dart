import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/resources_api.dart';
import '../../models/resource_entities.dart';
import '../../widgets/resource_shared.dart';

class EditProviderSheet extends ConsumerStatefulWidget {
  const EditProviderSheet({super.key, required this.provider});

  final LlmProviderEntityDto provider;

  @override
  ConsumerState<EditProviderSheet> createState() => _EditProviderSheetState();
}

class _EditProviderSheetState extends ConsumerState<EditProviderSheet> {
  late final TextEditingController _nameController;
  late final TextEditingController _baseUrlController;
  final _apiKeyController = TextEditingController();
  late String _apiProtocol;
  bool _clearApiKey = false;
  late bool _isEnabled;
  bool _isSaving = false;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _nameController = TextEditingController(text: widget.provider.name);
    _baseUrlController = TextEditingController(
      text: widget.provider.baseUrl ?? widget.provider.defaultBaseUrl ?? '',
    );
    _apiProtocol = widget.provider.apiProtocol;
    _isEnabled = widget.provider.isEnabled;
  }

  @override
  void dispose() {
    _nameController.dispose();
    _baseUrlController.dispose();
    _apiKeyController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final name = _nameController.text.trim();
    if (name.isEmpty) {
      setState(() => _errorMessage = '请填写提供商名称');
      return;
    }

    setState(() {
      _isSaving = true;
      _errorMessage = null;
    });

    try {
      final baseUrlText = _baseUrlController.text.trim();
      await ref
          .read(resourcesApiProvider)
          .updateLlmProvider(
            widget.provider.id,
            name: name,
            baseUrl: baseUrlText.isEmpty ? null : baseUrlText,
            clearBaseUrl: baseUrlText.isEmpty,
            apiProtocol: _apiProtocol,
            apiKey: _apiKeyController.text.trim().isEmpty
                ? null
                : _apiKeyController.text.trim(),
            clearApiKey: _clearApiKey,
            isEnabled: _isEnabled,
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
          Text('编辑提供商', style: theme.textTheme.headlineSmall),
          const SizedBox(height: 20),
          TextField(
            controller: _nameController,
            decoration: const InputDecoration(labelText: '提供商名称'),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _baseUrlController,
            decoration: InputDecoration(
              labelText: 'Base URL',
              helperText: widget.provider.defaultBaseUrl != null
                  ? '默认: ${widget.provider.defaultBaseUrl}'
                  : null,
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
          const SizedBox(height: 12),
          TextField(
            controller: _apiKeyController,
            obscureText: true,
            onChanged: (value) {
              if (value.trim().isNotEmpty && _clearApiKey) {
                setState(() => _clearApiKey = false);
              }
            },
            decoration: InputDecoration(
              labelText: 'API Key',
              helperText: widget.provider.apiKeyId != null
                  ? '当前已配置 API Key；留空表示保持不变，输入新值会替换。'
                  : '留空表示暂不配置。',
            ),
          ),
          const SizedBox(height: 12),
          if (widget.provider.apiKeyId != null)
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('移除当前 API Key'),
              value: _clearApiKey,
              onChanged: (value) {
                setState(() {
                  _clearApiKey = value;
                  if (value) {
                    _apiKeyController.clear();
                  }
                });
              },
            ),
          if (widget.provider.apiKeyId != null) const SizedBox(height: 12),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('启用'),
            value: _isEnabled,
            onChanged: (value) => setState(() => _isEnabled = value),
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
            label: const Text('保存'),
          ),
        ],
      ),
    );
  }
}
