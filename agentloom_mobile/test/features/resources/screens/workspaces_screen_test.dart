import 'package:agentloom_mobile/features/resources/api/resources_api.dart';
import 'package:agentloom_mobile/features/resources/screens/workspaces_screen.dart';
import 'package:agentloom_mobile/shared/models/paginated_response.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

class _MockResourcesApi extends Mock implements ResourcesApi {}

void main() {
  testWidgets(
    'workspace load error renders retry and retry refetches the key',
    (tester) async {
      final api = _MockResourcesApi();
      var attempts = 0;
      when(
        () => api.listWorkspaces(search: null, includeAutoArchived: false),
      ).thenAnswer((_) async {
        attempts += 1;
        if (attempts == 1) {
          throw StateError('network unavailable');
        }
        return const PaginatedResponse(
          data: [],
          meta: PaginationMeta(total: 0, page: 1, pageSize: 20, totalPages: 0),
        );
      });

      await tester.pumpWidget(
        ProviderScope(
          overrides: [resourcesApiProvider.overrideWithValue(api)],
          child: const MaterialApp(home: WorkspacesScreen()),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.textContaining('加载工作区失败'), findsOneWidget);
      expect(find.text('重试'), findsOneWidget);

      await tester.tap(find.text('重试'));
      await tester.pumpAndSettle();

      expect(find.text('还没有工作区'), findsOneWidget);
      expect(attempts, 2);
    },
  );
}
