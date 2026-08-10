import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/resources_api.dart';
import '../../models/resource_entities.dart';
import '../../widgets/resource_shared.dart';
import 'pricing_chips.dart';

class ModelEditorSheet extends ConsumerStatefulWidget {
  const ModelEditorSheet({
    super.key,
    required this.provider,
    required this.apiKeys,
    this.initialModel,
  });

  final LlmProviderEntityDto provider;
  final List<ApiKeyInfoDto> apiKeys;
  final LlmModelConfigDto? initialModel;

  bool get isEditing => initialModel != null && initialModel!.id.isNotEmpty;

  @override
  ConsumerState<ModelEditorSheet> createState() => _ModelEditorSheetState();
}

class _ModelEditorSheetState extends ConsumerState<ModelEditorSheet> {
  late final TextEditingController _nameController;
  late final TextEditingController _modelIdController;
  late final TextEditingController _contextWindowController;
  late final TextEditingController _maxOutputTokensController;
  late final TextEditingController _inputPricingController;
  late final TextEditingController _outputPricingController;
  late final TextEditingController _temperatureController;
  late final TextEditingController _maxTokensController;
  late final TextEditingController _embeddingDimensionsController;
  late final TextEditingController _timeoutMsController;
  late String _modelType;
  late bool _isDefault;
  late bool _isEnabled;
  late bool _vision;
  late bool _functionCalling;
  late bool _reasoning;
  late bool _structuredOutput;
  ModelPricingDto? _pricingDetails;
  bool _isSaving = false;
  bool _isLookingUp = false;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    final m = widget.initialModel;
    _nameController = TextEditingController(text: m?.name ?? '');
    _modelIdController = TextEditingController(text: m?.modelId ?? '');
    _contextWindowController = TextEditingController(
      text: m?.contextWindow?.toString() ?? '',
    );
    _maxOutputTokensController = TextEditingController(
      text: m?.maxOutputTokens?.toString() ?? '',
    );
    _inputPricingController = TextEditingController(
      text: m?.pricing?.inputPer1MTokens.toStringAsFixed(4) ?? '',
    );
    _outputPricingController = TextEditingController(
      text: m?.pricing?.outputPer1MTokens.toStringAsFixed(4) ?? '',
    );
    final params = m?.parameters ?? const <String, dynamic>{};
    _temperatureController = TextEditingController(
      text: params['temperature']?.toString() ?? '0.7',
    );
    _maxTokensController = TextEditingController(
      text: params['maxTokens']?.toString() ?? '',
    );
    _embeddingDimensionsController = TextEditingController(
      text: m?.embeddingDimensions?.toString() ?? '',
    );
    _timeoutMsController = TextEditingController(
      text: m?.timeoutMs?.toString() ?? '',
    );
    _modelType = m?.modelType ?? 'chat';
    _isDefault = m?.isDefault ?? false;
    _isEnabled = m?.isEnabled ?? true;
    _vision = m?.capabilities.vision ?? false;
    _functionCalling = m?.capabilities.functionCalling ?? false;
    _reasoning = m?.capabilities.reasoning ?? false;
    _structuredOutput = m?.capabilities.structuredOutput ?? false;
    _pricingDetails = m?.pricing;
  }

  @override
  void dispose() {
    _nameController.dispose();
    _modelIdController.dispose();
    _contextWindowController.dispose();
    _maxOutputTokensController.dispose();
    _inputPricingController.dispose();
    _outputPricingController.dispose();
    _temperatureController.dispose();
    _maxTokensController.dispose();
    _embeddingDimensionsController.dispose();
    _timeoutMsController.dispose();
    super.dispose();
  }

  Future<void> _lookupMetadata() async {
    final modelId = _modelIdController.text.trim();
    if (modelId.isEmpty) return;

    setState(() {
      _isLookingUp = true;
      _errorMessage = null;
    });

    try {
      final info = await ref
          .read(resourcesApiProvider)
          .lookupModelMetadata(widget.provider.slug, modelId);
      if (!mounted) return;
      if (info == null) {
        setState(() => _errorMessage = '未找到该模型的元数据');
        return;
      }
      setState(() {
        if (info.contextWindow != null) {
          _contextWindowController.text = info.contextWindow.toString();
        }
        if (info.maxOutputTokens != null) {
          _maxOutputTokensController.text = info.maxOutputTokens.toString();
        }
        if (info.pricing != null) {
          _inputPricingController.text = info.pricing!.inputPer1MTokens
              .toStringAsFixed(4);
          _outputPricingController.text = info.pricing!.outputPer1MTokens
              .toStringAsFixed(4);
        }
        _pricingDetails = info.pricing;
        _vision = info.capabilities.vision;
        _functionCalling = info.capabilities.functionCalling;
        _reasoning = info.capabilities.reasoning;
        _structuredOutput = info.capabilities.structuredOutput;
      });
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('已自动填充模型元数据')));
      }
    } catch (error) {
      if (!mounted) return;
      setState(() => _errorMessage = describeResourceError(error));
    } finally {
      if (mounted) setState(() => _isLookingUp = false);
    }
  }

  Future<void> _save() async {
    final name = _nameController.text.trim();
    final modelId = _modelIdController.text.trim();
    if (name.isEmpty) {
      setState(() => _errorMessage = '请填写配置名称');
      return;
    }
    if (modelId.isEmpty) {
      setState(() => _errorMessage = '请填写模型 ID');
      return;
    }
    if (_modelType == 'embedding' &&
        int.tryParse(_embeddingDimensionsController.text.trim()) == null) {
      setState(() => _errorMessage = 'Embedding 模型必须填写向量维度');
      return;
    }

    setState(() {
      _isSaving = true;
      _errorMessage = null;
    });

    final capabilities = ModelCapabilitiesDto(
      vision: _vision,
      functionCalling: _functionCalling,
      reasoning: _reasoning,
      structuredOutput: _structuredOutput,
    );
    final inputPricing = double.tryParse(_inputPricingController.text.trim());
    final outputPricing = double.tryParse(_outputPricingController.text.trim());
    final hasExtraPricing =
        _pricingDetails?.cachedReadPer1MTokens != null ||
        _pricingDetails?.cachedWritePer1MTokens != null ||
        (_pricingDetails?.tiers.isNotEmpty ?? false);
    final pricing =
        inputPricing != null || outputPricing != null || hasExtraPricing
        ? ModelPricingDto(
            inputPer1MTokens:
                inputPricing ?? _pricingDetails?.inputPer1MTokens ?? 0,
            outputPer1MTokens:
                outputPricing ?? _pricingDetails?.outputPer1MTokens ?? 0,
            cachedReadPer1MTokens: _pricingDetails?.cachedReadPer1MTokens,
            cachedWritePer1MTokens: _pricingDetails?.cachedWritePer1MTokens,
            tiers: _pricingDetails?.tiers ?? const <PricingTierDto>[],
          )
        : null;
    final parameters = <String, dynamic>{};
    final temp = double.tryParse(_temperatureController.text.trim());
    if (temp != null) parameters['temperature'] = temp;
    final maxTokens = int.tryParse(_maxTokensController.text.trim());
    if (maxTokens != null) parameters['maxTokens'] = maxTokens;

    try {
      final api = ref.read(resourcesApiProvider);
      if (widget.isEditing) {
        await api.updateLlmModelConfig(
          widget.initialModel!.id,
          name: name,
          modelId: modelId,
          modelType: _modelType,
          isDefault: _isDefault,
          isEnabled: _isEnabled,
          capabilities: capabilities,
          contextWindow: int.tryParse(_contextWindowController.text.trim()),
          clearContextWindow: _contextWindowController.text.trim().isEmpty,
          maxOutputTokens: int.tryParse(_maxOutputTokensController.text.trim()),
          clearMaxOutputTokens: _maxOutputTokensController.text.trim().isEmpty,
          pricing: pricing,
          clearPricing: pricing == null,
          parameters: parameters,
          embeddingDimensions: _modelType == 'embedding'
              ? int.tryParse(_embeddingDimensionsController.text.trim())
              : null,
          clearEmbeddingDimensions: _modelType != 'embedding',
          timeoutMs: int.tryParse(_timeoutMsController.text.trim()),
          clearTimeoutMs: _timeoutMsController.text.trim().isEmpty,
        );
      } else {
        await api.createLlmModelConfig(
          name: name,
          providerId: widget.provider.id,
          modelId: modelId,
          modelType: _modelType,
          isDefault: _isDefault,
          isEnabled: _isEnabled,
          capabilities: capabilities,
          contextWindow: int.tryParse(_contextWindowController.text.trim()),
          maxOutputTokens: int.tryParse(_maxOutputTokensController.text.trim()),
          pricing: pricing,
          parameters: parameters.isNotEmpty ? parameters : null,
          embeddingDimensions: _modelType == 'embedding'
              ? int.tryParse(_embeddingDimensionsController.text.trim())
              : null,
          timeoutMs: int.tryParse(_timeoutMsController.text.trim()),
        );
      }
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
          Text(
            widget.isEditing ? '编辑模型配置' : '新建模型配置',
            style: theme.textTheme.headlineSmall,
          ),
          const SizedBox(height: 4),
          Text(
            '提供商: ${widget.provider.name}',
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
          const SizedBox(height: 20),
          TextField(
            controller: _nameController,
            decoration: const InputDecoration(labelText: '配置名称'),
          ),
          const SizedBox(height: 12),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                child: TextField(
                  controller: _modelIdController,
                  decoration: const InputDecoration(
                    labelText: '模型 ID',
                    hintText: 'gpt-4o, claude-3-opus 等',
                  ),
                ),
              ),
              const SizedBox(width: 8),
              IconButton.filledTonal(
                onPressed: _isLookingUp ? null : _lookupMetadata,
                icon: _isLookingUp
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.auto_fix_high_rounded),
                tooltip: '自动填充元数据',
              ),
            ],
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: _modelType,
            decoration: const InputDecoration(labelText: '模型类型'),
            items: llmModelTypes
                .map((t) => DropdownMenuItem(value: t, child: Text(t)))
                .toList(growable: false),
            onChanged: (value) {
              setState(() => _modelType = value ?? _modelType);
            },
          ),
          const SizedBox(height: 16),
          Text('模型能力', style: theme.textTheme.titleSmall),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 0,
            children: [
              FilterChip(
                label: const Text('视觉'),
                selected: _vision,
                onSelected: (v) => setState(() => _vision = v),
              ),
              FilterChip(
                label: const Text('函数调用'),
                selected: _functionCalling,
                onSelected: (v) => setState(() => _functionCalling = v),
              ),
              FilterChip(
                label: const Text('推理'),
                selected: _reasoning,
                onSelected: (v) => setState(() => _reasoning = v),
              ),
              FilterChip(
                label: const Text('结构化输出'),
                selected: _structuredOutput,
                onSelected: (v) => setState(() => _structuredOutput = v),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Text('上下文与输出', style: theme.textTheme.titleSmall),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _contextWindowController,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(labelText: '上下文窗口'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: TextField(
                  controller: _maxOutputTokensController,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(labelText: '最大输出 tokens'),
                ),
              ),
            ],
          ),
          if (_pricingDetails != null &&
              (_pricingDetails!.cachedReadPer1MTokens != null ||
                  _pricingDetails!.cachedWritePer1MTokens != null ||
                  _pricingDetails!.tiers.isNotEmpty)) ...[
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: buildPricingChips(_pricingDetails!),
            ),
          ],
          const SizedBox(height: 16),
          Text('定价 (USD / 1M tokens)', style: theme.textTheme.titleSmall),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _inputPricingController,
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                  decoration: const InputDecoration(labelText: '输入'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: TextField(
                  controller: _outputPricingController,
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                  decoration: const InputDecoration(labelText: '输出'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Text('推理参数', style: theme.textTheme.titleSmall),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _temperatureController,
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                  decoration: const InputDecoration(labelText: 'Temperature'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: TextField(
                  controller: _maxTokensController,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(labelText: 'Max Tokens'),
                ),
              ),
            ],
          ),
          if (_modelType == 'embedding') ...[
            const SizedBox(height: 12),
            TextField(
              controller: _embeddingDimensionsController,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: '向量维度'),
            ),
          ],
          const SizedBox(height: 12),
          TextField(
            controller: _timeoutMsController,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(labelText: '超时 (ms)'),
          ),
          const SizedBox(height: 12),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('启用'),
            value: _isEnabled,
            onChanged: (v) => setState(() => _isEnabled = v),
          ),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('设为默认'),
            subtitle: const Text('同类型模型只能有一个默认'),
            value: _isDefault,
            onChanged: (v) => setState(() => _isDefault = v),
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
            label: Text(widget.isEditing ? '保存修改' : '创建配置'),
          ),
        ],
      ),
    );
  }
}
