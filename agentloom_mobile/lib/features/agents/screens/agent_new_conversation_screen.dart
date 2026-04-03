import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../routes/route_names.dart';
import '../api/agent_api.dart';

class AgentNewConversationScreen extends ConsumerStatefulWidget {
  const AgentNewConversationScreen({super.key, required this.agentId});

  final String agentId;

  @override
  ConsumerState<AgentNewConversationScreen> createState() =>
      _AgentNewConversationScreenState();
}

class _AgentNewConversationScreenState
    extends ConsumerState<AgentNewConversationScreen> {
  String? _error;
  bool _creating = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) {
        return;
      }
      _createConversation();
    });
  }

  Future<void> _createConversation() async {
    if (_creating) {
      return;
    }

    setState(() {
      _creating = true;
      _error = null;
    });

    try {
      final api = ref.read(agentApiProvider);
      final conversation = await api.createConversation(
        widget.agentId,
        title: '新对话',
      );
      if (!mounted) {
        return;
      }

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
        _creating = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_error != null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Agent 对话')),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  _error!,
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 16),
                FilledButton.icon(
                  onPressed: _createConversation,
                  icon: const Icon(Icons.refresh),
                  label: const Text('重试'),
                ),
              ],
            ),
          ),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Agent 对话')),
      body: const Center(
        child: CircularProgressIndicator(),
      ),
    );
  }
}
