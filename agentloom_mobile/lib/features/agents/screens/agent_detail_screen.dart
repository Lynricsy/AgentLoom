import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../routes/route_names.dart';
import '../../../shared/utils/emoji_utils.dart';
import '../../../shared/widgets/resource_source_chip.dart';
import '../../../shared/widgets/entity_icon.dart';
import '../api/agent_api.dart';
import '../models/agent_main_config_view.dart';
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
    final currentAgent = agentAsync.whenOrNull(data: (agent) => agent);

    return Scaffold(
      appBar: AppBar(
        title:
            agentAsync.whenOrNull(data: (a) => Text(a.name)) ??
            const Text('智能体'),
        actions: [
          if (currentAgent?.isShareImported ?? false)
            IconButton(
              tooltip: '转为自己创建',
              onPressed: () =>
                  _convertAgentSourceToManual(context, ref, agentId),
              icon: const Icon(Icons.drive_file_rename_outline),
            ),
        ],
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
                  Text('加载智能体失败', style: theme.textTheme.titleMedium),
                  const SizedBox(height: 8),
                  TextButton(
                    onPressed: () =>
                        ref.invalidate(agentDetailProvider(agentId)),
                    child: const Text('重试'),
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
                                  child: Center(
                                    child: EntityIcon(
                                      icon: agent.icon,
                                      fallbackIcon: Icons.smart_toy,
                                      size: 28,
                                      color:
                                          theme.colorScheme.onPrimaryContainer,
                                    ),
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
                              label: '版本',
                              value: 'v${agent.version}',
                            ),
                            const SizedBox(height: 4),
                            _MetadataRow(
                              label: '运行时',
                              value: agent.runtimeModeLabel,
                            ),
                            const SizedBox(height: 4),
                            _MetadataRow(
                              label: '来源',
                              value: getResourceSourceLabel(
                                agent.resourceSourceKind,
                              ),
                            ),
                            const SizedBox(height: 4),
                            _MetadataRow(
                              label: '更新时间',
                              value: _formatDate(agent.updatedAt),
                            ),
                            const SizedBox(height: 4),
                            _MetadataRow(
                              label: '创建时间',
                              value: _formatDate(agent.createdAt),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),

                  SliverToBoxAdapter(
                    child: _AgentCapabilityCard(
                      config: agent.agentMainConfig,
                      runtimeMode: agent.runtimeMode,
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
                        '最近对话',
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
                          '加载对话失败',
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
                                    '暂无对话',
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

                      return SliverToBoxAdapter(
                        child: Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 16),
                          child: Card(
                            clipBehavior: Clip.antiAlias,
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: List.generate(conversations.length, (
                                index,
                              ) {
                                final conv = conversations[index];
                                final emoji = extractLeadingEmoji(conv.title);
                                final iconWidget = emoji != null
                                    ? EntityIcon(
                                        icon: emojiToCodepoint(emoji),
                                        fallbackIcon: Icons.chat_bubble_outline,
                                        size: 24,
                                      )
                                    : const Icon(Icons.chat_bubble_outline);
                                return Column(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    ListTile(
                                      leading: iconWidget,
                                      title: Text(
                                        extractTextAfterEmoji(
                                          conv.title,
                                          fallback: '对话 ${index + 1}',
                                        ),
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                      subtitle: Text(
                                        _formatDate(conv.createdAt),
                                        style: theme.textTheme.bodySmall
                                            ?.copyWith(
                                              color: theme
                                                  .colorScheme
                                                  .onSurfaceVariant,
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
                                      onLongPress: () => _showConversationMenu(
                                        context,
                                        ref,
                                        conv.id,
                                        conv.title,
                                      ),
                                    ),
                                    if (index < conversations.length - 1)
                                      const Divider(height: 1),
                                  ],
                                );
                              }),
                            ),
                          ),
                        ),
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
                label: const Text('新对话'),
              )
            : null,
      ),
    );
  }

  Future<void> _startConversation(BuildContext context, WidgetRef ref) async {
    context.pushNamed(
      RouteNames.agentNewConversation,
      pathParameters: {'agentId': agentId},
    );
  }

  String _formatDate(String isoDate) {
    try {
      final date = DateTime.parse(isoDate);
      return '${date.year}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';
    } catch (_) {
      return isoDate;
    }
  }

  void _showConversationMenu(
    BuildContext context,
    WidgetRef ref,
    String conversationId,
    String? currentTitle,
  ) {
    showModalBottomSheet<String>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.auto_awesome),
              title: const Text('重新生成标题'),
              onTap: () => Navigator.pop(ctx, 'regenerate'),
            ),
            ListTile(
              leading: Icon(
                Icons.delete_outline,
                color: Theme.of(ctx).colorScheme.error,
              ),
              title: Text(
                '删除对话',
                style: TextStyle(color: Theme.of(ctx).colorScheme.error),
              ),
              onTap: () => Navigator.pop(ctx, 'delete'),
            ),
          ],
        ),
      ),
    ).then((action) {
      if (action == null || !context.mounted) return;
      switch (action) {
        case 'regenerate':
          _regenerateTitle(context, ref, conversationId);
          break;
        case 'delete':
          _deleteConversation(context, ref, conversationId);
          break;
      }
    });
  }

  Future<void> _regenerateTitle(
    BuildContext context,
    WidgetRef ref,
    String conversationId,
  ) async {
    try {
      final api = ref.read(agentApiProvider);
      final title = await api.generateConversationTitle(conversationId);
      if (!context.mounted) return;
      ref.invalidate(agentConversationsProvider(agentId));
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(title != null ? '标题已更新: $title' : '无法生成标题')),
      );
    } catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('重新生成标题失败: $e')));
    }
  }

  Future<void> _deleteConversation(
    BuildContext context,
    WidgetRef ref,
    String conversationId,
  ) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('删除对话'),
        content: const Text('此操作不可撤销。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('取消'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: TextButton.styleFrom(
              foregroundColor: Theme.of(ctx).colorScheme.error,
            ),
            child: const Text('删除'),
          ),
        ],
      ),
    );

    if (confirmed != true || !context.mounted) return;

    try {
      final api = ref.read(agentApiProvider);
      await api.deleteConversation(conversationId);
      if (!context.mounted) return;
      ref.invalidate(agentConversationsProvider(agentId));
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('对话已删除')));
    } catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('删除对话失败: $e')));
    }
  }
}

Future<void> _convertAgentSourceToManual(
  BuildContext context,
  WidgetRef ref,
  String agentId,
) async {
  final messenger = ScaffoldMessenger.of(context);
  try {
    await ref.read(agentApiProvider).convertSourceToManual(agentId);
    ref.invalidate(agentDetailProvider(agentId));
    await ref.read(agentListProvider.notifier).refresh();
    if (!context.mounted) {
      return;
    }
    messenger.showSnackBar(const SnackBar(content: Text('已转为自己创建')));
  } catch (error) {
    if (!context.mounted) {
      return;
    }
    messenger.showSnackBar(SnackBar(content: Text('转换失败：$error')));
  }
}

class _StatusChip extends StatelessWidget {
  final String status;

  const _StatusChip({required this.status});

  static String _statusLabel(String status) => switch (status) {
    'published' => '已发布',
    'draft' => '草稿',
    'archived' => '已归档',
    _ => status,
  };

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
        _statusLabel(status),
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

class _AgentCapabilityCard extends StatelessWidget {
  const _AgentCapabilityCard({required this.config, required this.runtimeMode});

  final AgentMainConfigView config;
  final String runtimeMode;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isNoSandboxRuntime = runtimeMode == 'no_sandbox';
    final nativeToolsSubtitle = isNoSandboxRuntime
        ? '无沙箱 Agent 不提供内置读写/编辑/终端工具'
        : config.nativeToolPolicy.isConfigured
        ? 'Agent 主配置已自定义'
        : '使用默认策略';
    final capabilityDescription = isNoSandboxRuntime
        ? '当前 Agent 以无沙箱形态运行：可使用 Skill、知识库、记忆、HTTP MCP 和自进化；不会提供终端或工作区工具。'
        : '移动端仅显示当前能力策略，编辑请前往 Studio。';

    return Card(
      margin: const EdgeInsets.fromLTRB(16, 0, 16, 0),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '运行时能力',
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              capabilityDescription,
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 16),
            _CapabilitySection(
              title: '原生工具',
              subtitle: nativeToolsSubtitle,
              chips: [
                _CapabilityChip(
                  label: '读取',
                  enabled: isNoSandboxRuntime
                      ? false
                      : config.nativeToolPolicy.readEnabled,
                ),
                _CapabilityChip(
                  label: '写入',
                  enabled: isNoSandboxRuntime
                      ? false
                      : config.nativeToolPolicy.writeEnabled,
                ),
                _CapabilityChip(
                  label: '编辑',
                  enabled: isNoSandboxRuntime
                      ? false
                      : config.nativeToolPolicy.editEnabled,
                ),
                _CapabilityChip(
                  label: '终端',
                  enabled: isNoSandboxRuntime
                      ? false
                      : config.nativeToolPolicy.terminalEnabled,
                ),
              ],
            ),
            const SizedBox(height: 12),
            _CapabilitySection(
              title: '自我进化',
              subtitle: config.selfEvolutionPolicy.enabled
                  ? '此智能体已启用自我进化'
                  : config.selfEvolutionPolicy.isConfigured
                  ? '已配置但当前未启用'
                  : '未启用，需在 Studio 中开启',
              chips: [
                _CapabilityChip(
                  label: '已启用',
                  enabled: config.selfEvolutionPolicy.enabled,
                ),
                _CapabilityChip(
                  label: '资源管理',
                  enabled: config.selfEvolutionPolicy.resourceManagement,
                ),
                _CapabilityChip(
                  label: '外部编辑',
                  enabled: config.selfEvolutionPolicy.externalEditing,
                ),
                _CapabilityChip(
                  label: '沙箱管理',
                  enabled: config.selfEvolutionPolicy.sandboxManagement,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _CapabilitySection extends StatelessWidget {
  const _CapabilitySection({
    required this.title,
    required this.subtitle,
    required this.chips,
  });

  final String title;
  final String subtitle;
  final List<Widget> chips;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: theme.textTheme.titleSmall?.copyWith(
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          subtitle,
          style: theme.textTheme.bodySmall?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
          ),
        ),
        const SizedBox(height: 8),
        Wrap(spacing: 8, runSpacing: 8, children: chips),
      ],
    );
  }
}

class _CapabilityChip extends StatelessWidget {
  const _CapabilityChip({required this.label, required this.enabled});

  final String label;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final backgroundColor = enabled
        ? theme.colorScheme.primaryContainer
        : theme.colorScheme.surfaceContainerHighest;
    final foregroundColor = enabled
        ? theme.colorScheme.onPrimaryContainer
        : theme.colorScheme.onSurfaceVariant;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: backgroundColor,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            enabled ? Icons.check_circle_rounded : Icons.cancel_rounded,
            size: 14,
            color: foregroundColor,
          ),
          const SizedBox(width: 6),
          Text(
            '$label ${enabled ? '开' : '关'}',
            style: theme.textTheme.labelMedium?.copyWith(
              color: foregroundColor,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
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
