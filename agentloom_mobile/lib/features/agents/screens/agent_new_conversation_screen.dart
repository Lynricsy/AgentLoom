import 'dart:async';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../routes/route_names.dart';
import '../api/agent_api.dart';
import '../conversation_attachment_payload.dart';
import '../providers/agent_conversation_provider.dart';
import '../providers/agent_provider.dart';
import '../widgets/conversation_input_bar.dart';

class AgentNewConversationScreen extends ConsumerStatefulWidget {
  const AgentNewConversationScreen({super.key, required this.agentId});

  final String agentId;

  @override
  ConsumerState<AgentNewConversationScreen> createState() =>
      _AgentNewConversationScreenState();
}

class _AgentNewConversationScreenState
    extends ConsumerState<AgentNewConversationScreen> {
  final _textController = TextEditingController();
  final List<ConversationDraftAttachment> _pendingAttachments =
      <ConversationDraftAttachment>[];
  String? _error;
  bool _submitting = false;

  @override
  void dispose() {
    _textController.dispose();
    super.dispose();
  }

  Future<void> _startConversation({
    required String content,
    String contentType = 'text',
    Map<String, dynamic>? metadata,
  }) async {
    final trimmed = content.trim();
    if (trimmed.isEmpty || _submitting) {
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      final api = ref.read(agentApiProvider);
      final conversation = await api.startConversation(
        widget.agentId,
        content: trimmed,
        contentType: contentType,
        metadata: metadata,
      );
      if (!mounted) {
        return;
      }

      ref.invalidate(agentConversationsProvider(widget.agentId));
      context.pushReplacementNamed(
        RouteNames.agentConversation,
        pathParameters: {
          'agentId': widget.agentId,
          'conversationId': conversation.id,
        },
      );
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _error = '创建对话失败：$error';
        _submitting = false;
      });
    }
  }

  void _sendMessage() {
    final trimmed = _textController.text.trim();
    if (trimmed.isEmpty && _pendingAttachments.isEmpty) {
      return;
    }

    if (_pendingAttachments.isEmpty) {
      unawaited(_startConversation(content: trimmed));
      return;
    }

    final payload = buildConversationOutgoingMessage(
      attachments: _pendingAttachments,
      content: trimmed,
    );
    unawaited(
      _startConversation(
        content: payload.content,
        contentType: payload.contentType,
        metadata: payload.metadata,
      ),
    );
  }

  Future<void> _pickAttachments({required bool image}) async {
    // file_picker 12：移除了 FilePicker.platform 与 FilePickerResult，
    // pickFiles 直接返回 List<PlatformFile>；withData 已弃用，改用 readAsBytes()。
    final files = await FilePicker.pickFiles(
      type: image ? FileType.image : FileType.any,
    );

    if (files.isEmpty) {
      return;
    }

    try {
      final nextAttachments = <ConversationDraftAttachment>[
        ..._pendingAttachments,
      ];
      for (final file in files) {
        final bytes = await file.readAsBytes();
        if (bytes.isEmpty) {
          throw Exception('无法读取所选文件，请重试。');
        }

        nextAttachments.add(
          buildConversationDraftAttachment(
            file: file,
            bytes: bytes,
            image: image,
          ),
        );
      }

      validateConversationAttachmentTotalBytes(nextAttachments);

      if (!mounted) {
        return;
      }

      setState(() {
        _pendingAttachments
          ..clear()
          ..addAll(nextAttachments);
        _error = null;
      });
    } catch (error) {
      if (!mounted) {
        return;
      }
      final message = error is Exception
          ? error.toString().replaceFirst('Exception: ', '')
          : '上传失败，请稍后重试。';
      _showSnackBar(message);
    }
  }

  void _removeAttachment(int index) {
    if (index < 0 || index >= _pendingAttachments.length) {
      return;
    }

    setState(() {
      _pendingAttachments.removeAt(index);
    });
  }

  @override
  Widget build(BuildContext context) {
    final agentAsync = ref.watch(agentDetailProvider(widget.agentId));
    final runtimeModeLabel =
        agentAsync.whenOrNull(
          data: (agent) => agent.runtimeMode == 'no_sandbox' ? '无沙箱' : '有沙箱',
        ) ??
        '有沙箱';

    return Scaffold(
      appBar: AppBar(title: Text('Agent 新对话 · $runtimeModeLabel')),
      body: Column(
        children: [
          if (_error != null)
            Container(
              width: double.infinity,
              color: Theme.of(context).colorScheme.errorContainer,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              child: Text(
                _error!,
                style: TextStyle(
                  color: Theme.of(context).colorScheme.onErrorContainer,
                ),
              ),
            ),
          const Expanded(child: SizedBox.expand()),
          ConversationInputBar(
            controller: _textController,
            onSend: _sendMessage,
            onPickFile: () => _pickAttachments(image: false),
            onPickImage: () => _pickAttachments(image: true),
            onRemoveAttachment: _removeAttachment,
            attachments: _pendingAttachments,
            isBusy: _submitting,
            hintText: _submitting ? '正在创建并发送…' : '输入消息…',
          ),
        ],
      ),
    );
  }

  void _showSnackBar(String message) {
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message)));
  }
}
