import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../routes/route_names.dart';
import '../providers/dashboard_provider.dart';
import '../widgets/quick_access_section.dart';
import '../widgets/recent_executions_section.dart';

/// Dashboard 首页
class DashboardScreen extends ConsumerWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final recentWorkflowsAsync = ref.watch(recentWorkflowsProvider);
    final recentExecutionsAsync = ref.watch(recentExecutionsProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Dashboard')),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(recentWorkflowsProvider);
          ref.invalidate(recentExecutionsProvider);
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

            recentExecutionsAsync.when(
              loading: () => const RecentExecutionsSection(isLoading: true),
              error: (error, _) =>
                  RecentExecutionsSection(error: error.toString()),
              data: (executions) => RecentExecutionsSection(
                executions: executions,
                onExecutionTap: (execution) => context.pushNamed(
                  RouteNames.executionMonitor,
                  pathParameters: {'executionId': execution.id},
                ),
              ),
            ),

            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }
}
