import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/resources_api.dart';
import '../models/resource_dtos.dart';
import '../widgets/resource_shared.dart';
import 'mcp_form_models.dart';

class McpEditSheet extends ConsumerStatefulWidget {
  const McpEditSheet({super.key, required this.detail});

  final McpServerConfigDetailDto detail;

  @override
  ConsumerState<McpEditSheet> createState() => _McpEditSheetState();
}

class _McpEditSheetState extends ConsumerState<McpEditSheet> {
  late final TextEditingController _nameController;
  late final TextEditingController _descriptionController;
  late final TextEditingController _commandController;
  late final TextEditingController _argsController;
  late final TextEditingController _urlController;
  late final TextEditingController _credentialsController;
  late String _status;
  late String _transportType;
  bool _replaceConnection = false;
  bool _isTesting = false;
  bool _isSaving = false;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _nameController = TextEditingController(text: widget.detail.name);
    _descriptionController = TextEditingController(
      text: widget.detail.description ?? '',
    );
    _commandController = TextEditingController(
      text: widget.detail.connection.command ?? '',
    );
    _argsController = TextEditingController(
      text: widget.detail.connection.args.join('\n'),
    );
    _urlController = TextEditingController(
      text: widget.detail.connection.url ?? '',
    );
    _credentialsController = TextEditingController();
    _status = widget.detail.status;
    _transportType = widget.detail.transportType;
  }

  @override
  void dispose() {
    _nameController.dispose();
    _descriptionController.dispose();
    _commandController.dispose();
    _argsController.dispose();
    _urlController.dispose();
    _credentialsController.dispose();
    super.dispose();
  }

  McpConnectionConfigDto _buildConnection() {
    final credentials = parseMcpKeyValueLines(_credentialsController.text);
    if (_transportType == 'stdio') {
      return McpConnectionConfigDto(
        transportType: _transportType,
        command: _commandController.text.trim(),
        args: parseMcpLines(_argsController.text),
        env: credentials.isEmpty ? null : credentials,
      );
    }

    return McpConnectionConfigDto(
      transportType: _transportType,
      url: _urlController.text.trim(),
      headers: credentials.isEmpty ? null : credentials,
    );
  }

  Future<void> _testConnection() async {
    setState(() {
      _isTesting = true;
      _errorMessage = null;
    });

    try {
      final result = await ref
          .read(resourcesApiProvider)
          .testMcpConnection(_buildConnection());
      if (!mounted) {
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            result.serverInfo == null
                ? '连接测试成功'
                : '连接成功：${result.serverInfo!.name} ${result.serverInfo!.version}',
          ),
        ),
      );
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _errorMessage = describeResourceError(error);
      });
    } finally {
      if (mounted) {
        setState(() {
          _isTesting = false;
        });
      }
    }
  }

  Future<void> _save() async {
    setState(() {
      _isSaving = true;
      _errorMessage = null;
    });

    try {
      await ref
          .read(resourcesApiProvider)
          .updateMcpServerConfig(
            widget.detail.id,
            name: _nameController.text,
            description: _descriptionController.text,
            status: _status,
            connection: _replaceConnection ? _buildConnection() : null,
          );
      if (!mounted) {
        return;
      }
      Navigator.of(context).pop(true);
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _errorMessage = describeResourceError(error);
      });
    } finally {
      if (mounted) {
        setState(() {
          _isSaving = false;
        });
      }
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
          Text('编辑 MCP 服务', style: theme.textTheme.headlineSmall),
          const SizedBox(height: 20),
          TextField(
            controller: _nameController,
            decoration: const InputDecoration(labelText: '服务名称'),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _descriptionController,
            minLines: 2,
            maxLines: 4,
            decoration: const InputDecoration(labelText: '描述'),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: _status,
            decoration: const InputDecoration(labelText: '状态'),
            items: const [
              DropdownMenuItem(value: 'active', child: Text('活跃')),
              DropdownMenuItem(value: 'inactive', child: Text('未激活')),
            ],
            onChanged: (value) {
              setState(() {
                _status = value ?? 'active';
              });
            },
          ),
          const SizedBox(height: 16),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('替换连接配置'),
            subtitle: Text(
              widget.detail.credentialKeys.isEmpty
                  ? '关闭时仅更新名称、描述和状态'
                  : '关闭时保留当前凭证键：${widget.detail.credentialKeys.join(', ')}',
            ),
            value: _replaceConnection,
            onChanged: (value) {
              setState(() {
                _replaceConnection = value;
              });
            },
          ),
          if (_replaceConnection) ...[
            const SizedBox(height: 8),
            Text('传输协议', style: theme.textTheme.labelLarge),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final transport in mcpTransportTypes)
                  ChoiceChip(
                    label: Text(transport),
                    selected: _transportType == transport,
                    onSelected: (_) {
                      setState(() {
                        _transportType = transport;
                      });
                    },
                  ),
              ],
            ),
            const SizedBox(height: 16),
            if (_transportType == 'stdio') ...[
              TextField(
                controller: _commandController,
                decoration: const InputDecoration(labelText: '命令'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _argsController,
                minLines: 2,
                maxLines: 4,
                decoration: const InputDecoration(labelText: '参数（每行一个）'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _credentialsController,
                obscureText: true,
                decoration: const InputDecoration(
                  labelText: '环境变量（每行 KEY=value）',
                ),
              ),
            ] else ...[
              TextField(
                controller: _urlController,
                decoration: const InputDecoration(labelText: '服务 URL'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _credentialsController,
                obscureText: true,
                decoration: const InputDecoration(
                  labelText: '请求头（每行 KEY=value）',
                ),
              ),
            ],
            const SizedBox(height: 12),
            FilledButton.tonalIcon(
              onPressed: _isTesting ? null : _testConnection,
              icon: _isTesting
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.wifi_tethering_rounded),
              label: const Text('测试新连接'),
            ),
          ],
          if (_errorMessage != null) ...[
            const SizedBox(height: 16),
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
            label: const Text('保存修改'),
          ),
        ],
      ),
    );
  }
}
