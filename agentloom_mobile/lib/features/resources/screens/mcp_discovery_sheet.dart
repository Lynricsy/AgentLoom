import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/resources_api.dart';
import '../models/resource_dtos.dart';
import '../providers/mcp_provider.dart';
import '../widgets/resource_shared.dart';
import 'mcp_form_models.dart';

class McpDiscoverySheet extends ConsumerStatefulWidget {
  const McpDiscoverySheet({super.key, this.existingDetail});

  final McpServerConfigDetailDto? existingDetail;

  bool get isReimport => existingDetail != null;

  @override
  ConsumerState<McpDiscoverySheet> createState() => _McpDiscoverySheetState();
}

class _McpDiscoverySheetState extends ConsumerState<McpDiscoverySheet> {
  late final TextEditingController _nameController;
  late final TextEditingController _descriptionController;
  late final TextEditingController _commandController;
  late final TextEditingController _argsController;
  late final TextEditingController _urlController;
  late final TextEditingController _credentialsController;
  late String _transportType;
  String _conflictStrategy = 'skip';
  bool _isTesting = false;
  bool _isDiscovering = false;
  bool _isSubmitting = false;
  String? _errorMessage;
  DiscoverMcpToolsResultDto? _discoveryResult;
  final Set<String> _selectedToolNames = <String>{};

  @override
  void initState() {
    super.initState();
    final existing = widget.existingDetail;
    _nameController = TextEditingController(text: existing?.name ?? '');
    _descriptionController = TextEditingController(
      text: existing?.description ?? '',
    );
    _commandController = TextEditingController(
      text: existing?.connection.command ?? '',
    );
    _argsController = TextEditingController(
      text: existing?.connection.args.join('\n') ?? '',
    );
    _urlController = TextEditingController(
      text: existing?.connection.url ?? '',
    );
    _credentialsController = TextEditingController();
    _transportType = existing?.transportType ?? 'stdio';

    if (widget.isReimport) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        unawaited(_discoverTools());
      });
    }
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

  Future<void> _discoverTools() async {
    if (!widget.isReimport && _nameController.text.trim().isEmpty) {
      setState(() {
        _errorMessage = '请先填写服务名称';
      });
      return;
    }

    setState(() {
      _isDiscovering = true;
      _errorMessage = null;
    });

    try {
      final api = ref.read(resourcesApiProvider);
      final result = widget.isReimport
          ? await api.rediscoverMcpTools(widget.existingDetail!.id)
          : await api.discoverMcpTools(_buildConnection());
      if (!mounted) {
        return;
      }
      setState(() {
        _discoveryResult = result;
        _selectedToolNames
          ..clear()
          ..addAll(result.tools.map((tool) => tool.name));
      });
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
          _isDiscovering = false;
        });
      }
    }
  }

  Future<void> _submit() async {
    if (_selectedToolNames.isEmpty) {
      setState(() {
        _errorMessage = '至少选择一个工具';
      });
      return;
    }

    setState(() {
      _isSubmitting = true;
      _errorMessage = null;
    });

    try {
      final api = ref.read(resourcesApiProvider);
      final result = widget.isReimport
          ? await api.reimportMcpTools(
              configId: widget.existingDetail!.id,
              toolNames: _selectedToolNames.toList(growable: false),
              conflictStrategy: _conflictStrategy,
            )
          : await api.importMcpTools(
              serverName: _nameController.text.trim(),
              serverDescription: _descriptionController.text.trim(),
              connection: _buildConnection(),
              toolNames: _selectedToolNames.toList(growable: false),
              conflictStrategy: _conflictStrategy,
            );
      ref.invalidate(mcpServerListProvider);
      final existing = widget.existingDetail;
      if (existing != null) {
        ref.invalidate(mcpServerDetailProvider(existing.id));
      }

      if (!mounted) {
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            '完成导入：新增 ${result.summary.imported}，覆盖 ${result.summary.overwritten}，跳过 ${result.summary.skipped}',
          ),
        ),
      );
      Navigator.of(context).pop();
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
          _isSubmitting = false;
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
          Text(
            widget.isReimport ? '重新导入 MCP 工具' : '导入 MCP 工具',
            style: theme.textTheme.headlineSmall,
          ),
          const SizedBox(height: 8),
          Text(
            widget.isReimport
                ? '重新发现当前服务暴露的工具，并按冲突策略导入。'
                : '先填写连接信息，再发现并选择需要导入的工具。',
            style: theme.textTheme.bodySmall,
          ),
          const SizedBox(height: 20),
          if (!widget.isReimport) ...[
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
            const SizedBox(height: 16),
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
                decoration: const InputDecoration(
                  labelText: '命令',
                  hintText: '例如 npx 或 node',
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _argsController,
                minLines: 2,
                maxLines: 4,
                decoration: const InputDecoration(
                  labelText: '参数（每行一个）',
                  hintText: '-y\n@modelcontextprotocol/server-filesystem',
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _credentialsController,
                obscureText: true,
                decoration: const InputDecoration(
                  labelText: '环境变量（每行 KEY=value）',
                  hintText: 'API_KEY=sk-xxxx',
                ),
              ),
            ] else ...[
              TextField(
                controller: _urlController,
                decoration: const InputDecoration(
                  labelText: '服务 URL',
                  hintText: 'https://example.com/mcp',
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _credentialsController,
                obscureText: true,
                decoration: const InputDecoration(
                  labelText: '请求头（每行 KEY=value）',
                  hintText: 'Authorization=Bearer token',
                ),
              ),
            ],
            const SizedBox(height: 20),
            Wrap(
              spacing: 12,
              runSpacing: 12,
              children: [
                FilledButton.tonalIcon(
                  onPressed: _isTesting ? null : _testConnection,
                  icon: _isTesting
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.wifi_tethering_rounded),
                  label: const Text('测试连接'),
                ),
                FilledButton.icon(
                  onPressed: _isDiscovering ? null : _discoverTools,
                  icon: _isDiscovering
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.travel_explore_rounded),
                  label: const Text('发现工具'),
                ),
              ],
            ),
          ] else if (_isDiscovering) ...[
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 24),
              child: Center(child: CircularProgressIndicator()),
            ),
          ] else
            FilledButton.icon(
              onPressed: _discoverTools,
              icon: const Icon(Icons.travel_explore_rounded),
              label: const Text('重新发现工具'),
            ),
          if (_errorMessage != null) ...[
            const SizedBox(height: 16),
            Text(
              _errorMessage!,
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.error,
              ),
            ),
          ],
          if (_discoveryResult != null) ...[
            const SizedBox(height: 24),
            if (_discoveryResult!.serverInfo != null)
              Card(
                child: ListTile(
                  contentPadding: const EdgeInsets.all(16),
                  leading: const Icon(Icons.dns_rounded),
                  title: Text(_discoveryResult!.serverInfo!.name),
                  subtitle: Text(
                    '版本 ${_discoveryResult!.serverInfo!.version}'
                    '${_discoveryResult!.serverInfo!.protocolVersion == null ? '' : ' · 协议 ${_discoveryResult!.serverInfo!.protocolVersion}'}',
                  ),
                ),
              ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: _conflictStrategy,
              decoration: const InputDecoration(labelText: '冲突策略'),
              items: const [
                DropdownMenuItem(value: 'skip', child: Text('跳过')),
                DropdownMenuItem(value: 'overwrite', child: Text('覆盖')),
              ],
              onChanged: (value) {
                setState(() {
                  _conflictStrategy = value ?? 'skip';
                });
              },
            ),
            const SizedBox(height: 16),
            Text(
              '发现到 ${_discoveryResult!.tools.length} 个工具，已选 ${_selectedToolNames.length} 个',
              style: theme.textTheme.labelLarge,
            ),
            const SizedBox(height: 12),
            if (_discoveryResult!.tools.isEmpty)
              const Text('当前服务没有返回可导入工具')
            else
              for (final tool in _discoveryResult!.tools) ...[
                Card(
                  child: CheckboxListTile(
                    value: _selectedToolNames.contains(tool.name),
                    onChanged: (value) {
                      setState(() {
                        if (value == true) {
                          _selectedToolNames.add(tool.name);
                        } else {
                          _selectedToolNames.remove(tool.name);
                        }
                      });
                    },
                    title: Text(tool.title ?? tool.name),
                    subtitle: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const SizedBox(height: 4),
                        Text(tool.description ?? '无描述'),
                        if (tool.inputSchema != null) ...[
                          const SizedBox(height: 8),
                          Text(
                            '已提供输入 Schema',
                            style: theme.textTheme.labelSmall,
                          ),
                        ],
                      ],
                    ),
                    controlAffinity: ListTileControlAffinity.leading,
                  ),
                ),
                const SizedBox(height: 8),
              ],
            const SizedBox(height: 20),
            FilledButton.icon(
              onPressed: _isSubmitting ? null : _submit,
              icon: _isSubmitting
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.download_done_rounded),
              label: Text(widget.isReimport ? '重新导入所选工具' : '导入所选工具'),
            ),
          ],
        ],
      ),
    );
  }
}
