import 'package:agentloom_mobile/features/resources/screens/resources_hub_screen.dart';
import 'package:agentloom_mobile/routes/route_names.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

void main() {
  Widget createTestWidget() {
    final router = GoRouter(
      initialLocation: '/',
      routes: [
        GoRoute(
          path: '/',
          builder: (context, state) => const ResourcesHubScreen(),
        ),
        ..._resourceDestinations.map(
          (destination) => GoRoute(
            path: destination.path,
            name: destination.routeName,
            builder: (context, state) =>
                Scaffold(body: Text(destination.destinationTitle)),
          ),
        ),
      ],
    );

    return MaterialApp.router(routerConfig: router);
  }

  group('ResourcesHubScreen', () {
    testWidgets('renders a flat resource list without migration copy', (
      tester,
    ) async {
      await tester.pumpWidget(createTestWidget());
      await tester.pumpAndSettle();

      expect(find.text('资源'), findsOneWidget);
      expect(find.text('已接入'), findsNothing);
      expect(find.text('迁移中'), findsNothing);
      expect(find.text('资源域会逐步成为移动端的统一入口，替代当前分散在多个单独路由里的旧结构。'), findsNothing);

      for (final destination in _resourceDestinations) {
        await tester.scrollUntilVisible(
          find.text(destination.cardTitle),
          200,
          scrollable: find.byType(Scrollable),
        );
        expect(find.text(destination.cardTitle), findsOneWidget);
      }
    });

    for (final destination in _resourceDestinations) {
      testWidgets('navigates to ${destination.cardTitle}', (tester) async {
        await tester.pumpWidget(createTestWidget());
        await tester.pumpAndSettle();

        await tester.scrollUntilVisible(
          find.text(destination.cardTitle),
          200,
          scrollable: find.byType(Scrollable),
        );
        await tester.tap(find.text(destination.cardTitle));
        await tester.pumpAndSettle();

        expect(find.text(destination.destinationTitle), findsOneWidget);
      });
    }
  });
}

const _resourceDestinations = [
  _ResourceDestination(
    cardTitle: '记忆',
    destinationTitle: 'Memory Destination',
    routeName: RouteNames.memoryList,
    path: '/memory',
  ),
  _ResourceDestination(
    cardTitle: '技能',
    destinationTitle: 'Skills Destination',
    routeName: RouteNames.skills,
    path: '/skills',
  ),
  _ResourceDestination(
    cardTitle: '工作区',
    destinationTitle: 'Workspaces Destination',
    routeName: RouteNames.workspaces,
    path: '/workspaces',
  ),
  _ResourceDestination(
    cardTitle: 'Sandbox',
    destinationTitle: 'Sandboxes Destination',
    routeName: RouteNames.sandboxes,
    path: '/sandboxes',
  ),
  _ResourceDestination(
    cardTitle: '知识库',
    destinationTitle: 'Knowledge Bases Destination',
    routeName: RouteNames.knowledgeBases,
    path: '/knowledge-bases',
  ),
  _ResourceDestination(
    cardTitle: 'MCP 服务',
    destinationTitle: 'MCP Servers Destination',
    routeName: RouteNames.mcpServers,
    path: '/mcp-servers',
  ),
  _ResourceDestination(
    cardTitle: 'LLM 模型',
    destinationTitle: 'LLM Models Destination',
    routeName: RouteNames.llmModels,
    path: '/llm-models',
  ),
];

class _ResourceDestination {
  const _ResourceDestination({
    required this.cardTitle,
    required this.destinationTitle,
    required this.routeName,
    required this.path,
  });

  final String cardTitle;
  final String destinationTitle;
  final String routeName;
  final String path;
}
