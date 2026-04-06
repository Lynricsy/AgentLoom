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
      context.goNamed(
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
    unawaited(_startConversation(content: _textController.text));
  }

  Future<void> _sendAttachment({required bool image}) async {
    final result = await FilePicker.platform.pickFiles(
      type: image ? FileType.image : FileType.any,
      allowMultiple: false,
      withData: true,
    );

    if (result == null || result.files.isEmpty) {
      return;
    }

    final file = result.files.single;
    final bytes = file.bytes;
    if (bytes == null || bytes.isEmpty) {
      _showSnackBar('无法读取所选文件，请重试。');
      return;
    }

    try {
      final payload = buildConversationAttachmentMessage(
        file: file,
        bytes: bytes,
        image: image,
        content: _textController.text.trim(),
      );

      await _startConversation(
        content: payload.content,
        contentType: payload.contentType,
        metadata: payload.metadata,
      );
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

  void _showSnackBar(String message) {
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message)));
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
          Expanded(
            child: Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      Icons.forum_outlined,
                      size: 54,
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
                    const SizedBox(height: 16),
                    Text(
                      '首条消息发送后再创建对话',
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      '这里是草稿态。输入文字或上传附件后，系统会创建真实 conversation，并切到正式对话页继续执行。',
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          ConversationInputBar(
            controller: _textController,
            onSend: _sendMessage,
            onPickFile: () => _sendAttachment(image: false),
            onPickImage: () => _sendAttachment(image: true),
            isBusy: _submitting,
            hintText: _submitting ? '正在创建并发送…' : '输入消息…',
          ),
        ],
      ),
    );
  }
}
