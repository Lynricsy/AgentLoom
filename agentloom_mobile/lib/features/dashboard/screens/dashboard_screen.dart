import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers/dashboard_provider.dart';
import '../widgets/quick_access_section.dart';
import '../widgets/recent_executions_section.dart';

/// Dashboard 首页
class DashboardScreen extends ConsumerWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final recentWorkflowsAsync = ref.watch(recentWorkflowsProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Dashboard')),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(recentWorkflowsProvider);
        },
        child: ListView(
          children: [
            const SizedBox(height: 8),

            // 快速访问区块
            recentWorkflowsAsync.when(
              loading: () => const QuickAccessSection(isLoading: true),
              error: (error, _) => QuickAccessSection(error: error.toString()),
              data: (workflows) => QuickAccessSection(workflows: workflows),
            ),

            const SizedBox(height: 24),

            // 最近执行区块（暂时使用空列表，后续 story 会添加执行 API）
            const RecentExecutionsSection(executions: []),

            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }
}
