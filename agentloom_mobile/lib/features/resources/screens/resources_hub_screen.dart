import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../routes/route_names.dart';

/// 资源域总览页面
class ResourcesHubScreen extends StatelessWidget {
  const ResourcesHubScreen({super.key});

  static const List<_ResourceEntry> _resources = [
    _ResourceEntry(
      icon: Icons.memory_rounded,
      title: 'Memory',
      subtitle: '记忆实例、节点与审计入口',
      routeName: RouteNames.memoryList,
    ),
    _ResourceEntry(
      icon: Icons.auto_awesome_rounded,
      title: 'Skills',
      subtitle: '技能列表、详情与轻编辑',
      routeName: RouteNames.skills,
    ),
    _ResourceEntry(
      icon: Icons.folder_open_rounded,
      title: 'Workspaces',
      subtitle: '工作区浏览、创建与恢复',
      routeName: RouteNames.workspaces,
    ),
    _ResourceEntry(
      icon: Icons.computer_rounded,
      title: 'Sandboxes',
      subtitle: '沙箱实例、状态与环境信息',
      routeName: RouteNames.sandboxes,
    ),
    _ResourceEntry(
      icon: Icons.library_books_rounded,
      title: 'Knowledge Bases',
      subtitle: '知识库列表、检索配置与文档状态',
      routeName: RouteNames.knowledgeBases,
    ),
    _ResourceEntry(
      icon: Icons.extension_rounded,
      title: 'MCP Servers',
      subtitle: '连接、测试、导入工具与配置管理',
      routeName: RouteNames.mcpServers,
    ),
    _ResourceEntry(
      icon: Icons.hub_rounded,
      title: 'LLM Models',
      subtitle: '模型配置、用途标注与连接测试',
      routeName: RouteNames.llmModels,
    ),
  ];

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
      body: ListView.separated(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
        itemCount: _resources.length,
        separatorBuilder: (_, _) => const SizedBox(height: 12),
        itemBuilder: (context, index) {
          final resource = _resources[index];
          return _ResourceCard(
            icon: resource.icon,
            title: resource.title,
            subtitle: resource.subtitle,
            onTap: () => context.pushNamed(resource.routeName),
          );
        },
      ),
    );
  }
}

class _ResourceEntry {
  const _ResourceEntry({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.routeName,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final String routeName;
}

class _ResourceCard extends StatelessWidget {
  const _ResourceCard({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
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
              Icon(
                Icons.chevron_right_rounded,
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
