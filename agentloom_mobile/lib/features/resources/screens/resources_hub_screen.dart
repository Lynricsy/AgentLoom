import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../routes/route_names.dart';

/// 资源域总览页面
class ResourcesHubScreen extends StatelessWidget {
  const ResourcesHubScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.widgets_rounded,
              size: 22,
              color: theme.colorScheme.onSurface,
            ),
            const SizedBox(width: 8),
            const Text('Resources'),
          ],
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
        children: [
          const _SectionHeader(
            title: '已接入',
            subtitle: '这些资源已经挂入新的信息架构，可继续沿此入口扩展。 ',
          ),
          const SizedBox(height: 12),
          _ResourceCard(
            icon: Icons.memory_rounded,
            title: 'Memory',
            subtitle: '记忆实例、节点与审计入口',
            badge: '已接入',
            onTap: () => context.pushNamed(RouteNames.memoryList),
          ),
          const SizedBox(height: 12),
          _ResourceCard(
            icon: Icons.auto_awesome_rounded,
            title: 'Skills',
            subtitle: '技能列表、详情与轻编辑',
            badge: '已接入',
            onTap: () => context.pushNamed(RouteNames.skills),
          ),
          const SizedBox(height: 24),
          const _SectionHeader(
            title: '迁移中',
            subtitle: '这些资源将在后续批次补齐为完整生命周期管理。 ',
          ),
          const SizedBox(height: 12),
          _ResourceCard(
            icon: Icons.folder_open_rounded,
            title: 'Workspaces',
            subtitle: '工作区浏览、创建与恢复',
            badge: '已接入',
            onTap: () => context.pushNamed(RouteNames.workspaces),
          ),
          const SizedBox(height: 12),
          _ResourceCard(
            icon: Icons.computer_rounded,
            title: 'Sandboxes',
            subtitle: '沙箱实例、状态与环境信息',
            badge: '已接入',
            onTap: () => context.pushNamed(RouteNames.sandboxes),
          ),
          const SizedBox(height: 12),
          _ResourceCard(
            icon: Icons.library_books_rounded,
            title: 'Knowledge Bases',
            subtitle: '知识库列表、检索配置与文档状态',
            badge: '已接入',
            onTap: () => context.pushNamed(RouteNames.knowledgeBases),
          ),
          const SizedBox(height: 12),
          _ResourceCard(
            icon: Icons.extension_rounded,
            title: 'MCP Servers',
            subtitle: '连接、测试、导入工具与配置管理',
            badge: '已接入',
            onTap: () => context.pushNamed(RouteNames.mcpServers),
          ),
          const SizedBox(height: 12),
          _ResourceCard(
            icon: Icons.hub_rounded,
            title: 'LLM Models',
            subtitle: '模型配置、用途标注与连接测试',
            badge: '已接入',
            onTap: () => context.pushNamed(RouteNames.llmModels),
          ),
          const SizedBox(height: 18),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: theme.colorScheme.surfaceContainerLow,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: theme.colorScheme.outlineVariant),
            ),
            child: Text(
              '资源域会逐步成为移动端的统一入口，替代当前分散在多个单独路由里的旧结构。',
              style: theme.textTheme.bodySmall,
            ),
          ),
        ],
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.title, required this.subtitle});

  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: theme.textTheme.titleMedium),
        const SizedBox(height: 4),
        Text(subtitle, style: theme.textTheme.bodySmall),
      ],
    );
  }
}

class _ResourceCard extends StatelessWidget {
  const _ResourceCard({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.badge,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final String badge;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(24),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(18, 18, 18, 18),
          child: Row(
            children: [
              Container(
                width: 52,
                height: 52,
                decoration: BoxDecoration(
                  color: theme.colorScheme.primary.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(18),
                ),
                child: Icon(icon, color: theme.colorScheme.primary),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: theme.textTheme.titleMedium),
                    const SizedBox(height: 4),
                    Text(subtitle, style: theme.textTheme.bodySmall),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 6,
                    ),
                    decoration: BoxDecoration(
                      color: theme.colorScheme.surfaceContainerHigh,
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      badge,
                      style: theme.textTheme.labelSmall?.copyWith(
                        color: theme.colorScheme.primary,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  const SizedBox(height: 10),
                  Icon(
                    Icons.chevron_right_rounded,
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
