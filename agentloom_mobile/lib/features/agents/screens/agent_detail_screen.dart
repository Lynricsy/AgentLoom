import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../routes/route_names.dart';
import '../api/agent_api.dart';
import '../providers/agent_conversation_provider.dart';
import '../providers/agent_provider.dart';

/// Agent 详情页面（只读）
class AgentDetailScreen extends ConsumerWidget {
  final String agentId;

  const AgentDetailScreen({super.key, required this.agentId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final agentAsync = ref.watch(agentDetailProvider(agentId));
    final conversationsAsync = ref.watch(agentConversationsProvider(agentId));

    return Scaffold(
      appBar: AppBar(
        title:
            agentAsync.whenOrNull(data: (a) => Text(a.name)) ??
            const Text('Agent'),
      ),
      body: (agentAsync.hasError && !agentAsync.hasValue)
          ? Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    Icons.error_outline,
                    size: 48,
                    color: theme.colorScheme.error,
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'Failed to load agent',
                    style: theme.textTheme.titleMedium,
                  ),
                  const SizedBox(height: 8),
                  TextButton(
                    onPressed: () =>
                        ref.invalidate(agentDetailProvider(agentId)),
                    child: const Text('Retry'),
                  ),
                ],
              ),
            )
          : agentAsync.when(
              loading: () => const _SkeletonLoading(),
              error: (_, __) => const SizedBox.shrink(),
              data: (agent) => CustomScrollView(
                slivers: [
                  // 元数据卡片
                  SliverToBoxAdapter(
                    child: Card(
                      margin: const EdgeInsets.all(16),
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Container(
                                  width: 48,
                                  height: 48,
                                  decoration: BoxDecoration(
                                    color: theme.colorScheme.primaryContainer,
                                    borderRadius: BorderRadius.circular(12),
                                  ),
                                  child: Icon(
                                    Icons.smart_toy,
                                    color: theme.colorScheme.onPrimaryContainer,
                                    size: 28,
                                  ),
                                ),
                                const SizedBox(width: 16),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        agent.name,
                                        style: theme.textTheme.headlineSmall
                                            ?.copyWith(
                                              fontWeight: FontWeight.w600,
                                            ),
                                      ),
                                      const SizedBox(height: 4),
                                      _StatusChip(status: agent.status),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                            if (agent.description != null &&
                                agent.description!.isNotEmpty) ...[
                              const SizedBox(height: 12),
                              Text(
                                agent.description!,
                                style: theme.textTheme.bodyMedium?.copyWith(
                                  color: theme.colorScheme.onSurfaceVariant,
                                ),
                              ),
                            ],
                            const SizedBox(height: 16),
                            _MetadataRow(
                              label: 'Version',
                              value: 'v${agent.version}',
                            ),
                            const SizedBox(height: 4),
                            if (agent.modelId != null) ...[
                              _MetadataRow(
                                label: 'Model',
                                value: agent.modelId!,
                              ),
                              const SizedBox(height: 4),
                            ],
                            if (agent.autonomyMode != null) ...[
                              _MetadataRow(
                                label: 'Autonomy',
                                value: agent.autonomyMode!,
                              ),
                              const SizedBox(height: 4),
                            ],
                            _MetadataRow(
                              label: 'Updated',
                              value: _formatDate(agent.updatedAt),
                            ),
                            const SizedBox(height: 4),
                            _MetadataRow(
                              label: 'Created',
                              value: _formatDate(agent.createdAt),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),

                  // 对话列表标题
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 8,
                      ),
                      child: Text(
                        'Recent Conversations',
                        style: theme.textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ),

                  // 对话列表
                  conversationsAsync.when(
                    loading: () => const SliverToBoxAdapter(
                      child: Center(
                        child: Padding(
                          padding: EdgeInsets.all(24),
                          child: CircularProgressIndicator(),
                        ),
                      ),
                    ),
                    error: (_, __) => SliverToBoxAdapter(
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Text(
                          'Failed to load conversations',
                          style: theme.textTheme.bodyMedium?.copyWith(
                            color: theme.colorScheme.error,
                          ),
                        ),
                      ),
                    ),
                    data: (conversations) {
                      if (conversations.isEmpty) {
                        return SliverToBoxAdapter(
                          child: Padding(
                            padding: const EdgeInsets.all(24),
                            child: Center(
                              child: Column(
                                children: [
                                  Icon(
                                    Icons.chat_bubble_outline,
                                    size: 48,
                                    color: theme.colorScheme.onSurfaceVariant
                                        .withValues(alpha: 0.5),
                                  ),
                                  const SizedBox(height: 8),
                                  Text(
                                    'No conversations yet',
                                    style: theme.textTheme.bodyMedium?.copyWith(
                                      color: theme.colorScheme.onSurfaceVariant,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        );
                      }

                      return SliverList(
                        delegate: SliverChildBuilderDelegate((context, index) {
                          final conv = conversations[index];
                          return ListTile(
                            leading: const Icon(Icons.chat),
                            title: Text(
                              conv.title ?? 'Conversation ${index + 1}',
                            ),
                            subtitle: Text(
                              _formatDate(conv.createdAt),
                              style: theme.textTheme.bodySmall?.copyWith(
                                color: theme.colorScheme.onSurfaceVariant,
                              ),
                            ),
                            trailing: const Icon(Icons.chevron_right),
                            onTap: () => context.pushNamed(
                              RouteNames.agentConversation,
                              pathParameters: {
                                'agentId': agentId,
                                'conversationId': conv.id,
                              },
                            ),
                          );
                        }, childCount: conversations.length),
                      );
                    },
                  ),
                ],
              ),
            ),
      floatingActionButton: agentAsync.whenOrNull(
        data: (agent) => agent.status == 'published'
            ? FloatingActionButton.extended(
                onPressed: () => _startConversation(context, ref),
                icon: const Icon(Icons.chat),
                label: const Text('New Chat'),
              )
            : null,
      ),
    );
  }

  Future<void> _startConversation(BuildContext context, WidgetRef ref) async {
    try {
      final api = ref.read(agentApiProvider);
      final conversation = await api.createConversation(agentId);
      if (!context.mounted) return;
      context.pushNamed(
        RouteNames.agentConversation,
        pathParameters: {'agentId': agentId, 'conversationId': conversation.id},
      );
    } catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to create conversation: $e')),
      );
    }
  }

  String _formatDate(String isoDate) {
    try {
      final date = DateTime.parse(isoDate);
      return '${date.year}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';
    } catch (_) {
      return isoDate;
    }
  }
}

class _StatusChip extends StatelessWidget {
  final String status;

  const _StatusChip({required this.status});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final (Color bg, Color fg) = switch (status) {
      'published' => (
        theme.colorScheme.primaryContainer,
        theme.colorScheme.onPrimaryContainer,
      ),
      'draft' => (
        theme.colorScheme.secondaryContainer,
        theme.colorScheme.onSecondaryContainer,
      ),
      _ => (
        theme.colorScheme.surfaceContainerHighest,
        theme.colorScheme.onSurfaceVariant,
      ),
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        status[0].toUpperCase() + status.substring(1),
        style: theme.textTheme.labelSmall?.copyWith(color: fg),
      ),
    );
  }
}

class _MetadataRow extends StatelessWidget {
  final String label;
  final String value;

  const _MetadataRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      children: [
        SizedBox(
          width: 80,
          child: Text(
            label,
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
        ),
        Expanded(child: Text(value, style: theme.textTheme.bodyMedium)),
      ],
    );
  }
}

class _SkeletonLoading extends StatelessWidget {
  const _SkeletonLoading();

  @override
  Widget build(BuildContext context) {
    final shimmerColor = Theme.of(context).colorScheme.surfaceContainerHighest;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 200,
            height: 28,
            decoration: BoxDecoration(
              color: shimmerColor,
              borderRadius: BorderRadius.circular(4),
            ),
          ),
          const SizedBox(height: 16),
          Container(
            width: double.infinity,
            height: 16,
            decoration: BoxDecoration(
              color: shimmerColor,
              borderRadius: BorderRadius.circular(4),
            ),
          ),
          const SizedBox(height: 8),
          Container(
            width: 250,
            height: 16,
            decoration: BoxDecoration(
              color: shimmerColor,
              borderRadius: BorderRadius.circular(4),
            ),
          ),
          const SizedBox(height: 24),
          for (int i = 0; i < 4; i++) ...[
            Container(
              width: double.infinity,
              height: 14,
              decoration: BoxDecoration(
                color: shimmerColor,
                borderRadius: BorderRadius.circular(4),
              ),
            ),
            const SizedBox(height: 8),
          ],
        ],
      ),
    );
  }
}
