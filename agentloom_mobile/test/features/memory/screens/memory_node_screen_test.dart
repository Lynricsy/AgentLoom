import 'dart:async';

import 'package:agentloom_mobile/features/memory/api/memory_api.dart';
import 'package:agentloom_mobile/features/memory/models/memory_node.dart';
import 'package:agentloom_mobile/features/memory/models/memory_version.dart';
import 'package:agentloom_mobile/features/memory/screens/memory_node_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import '../../../helpers/test_helpers.dart';

void main() {
  late MockMemoryApi mockApi;

  setUp(() {
    mockApi = MockMemoryApi();
  });

  Widget createTestWidget({
    String instanceId = 'mem-inst-1',
    String nodeId = 'mem-node-1',
  }) {
    return ProviderScope(
      overrides: [memoryApiProvider.overrideWithValue(mockApi)],
      child: MaterialApp(
        home: MemoryNodeScreen(instanceId: instanceId, nodeId: nodeId),
      ),
    );
  }

  group('MemoryNodeScreen', () {
    testWidgets('shows loading state initially', (tester) async {
      when(
        () => mockApi.getMemoryNode(any(), any()),
      ).thenAnswer((_) => Completer<MemoryNodeDto>().future);
      when(
        () => mockApi.getMemoryVersions(any(), any()),
      ).thenAnswer((_) => Completer<List<MemoryVersionDto>>().future);

      await tester.pumpWidget(createTestWidget());
      await tester.pump();

      expect(find.byType(CircularProgressIndicator), findsOneWidget);
    });

    testWidgets('renders node info after loading', (tester) async {
      when(() => mockApi.getMemoryNode(any(), any())).thenAnswer(
        (_) async => createTestMemoryNode(
          contentType: 'text',
          disclosureLevel: 2,
        ),
      );
      when(
        () => mockApi.getMemoryVersions(any(), any()),
      ).thenAnswer(
        (_) async => [createTestMemoryVersion(content: 'Latest version text.')],
      );

      await tester.pumpWidget(createTestWidget());
      await tester.pumpAndSettle();

      expect(find.text('Node Info'), findsOneWidget);
      expect(find.text('text'), findsOneWidget);
      expect(find.text('Latest version text.'), findsOneWidget);
    });

    testWidgets('shows disclosure level as number', (tester) async {
      when(() => mockApi.getMemoryNode(any(), any())).thenAnswer(
        (_) async => createTestMemoryNode(disclosureLevel: 3),
      );
      when(
        () => mockApi.getMemoryVersions(any(), any()),
      ).thenAnswer((_) async => []);

      await tester.pumpWidget(createTestWidget());
      await tester.pumpAndSettle();

      expect(find.text('3'), findsOneWidget);
      expect(find.text('可见性'), findsOneWidget);
    });

    testWidgets('shows version history section', (tester) async {
      when(
        () => mockApi.getMemoryNode(any(), any()),
      ).thenAnswer((_) async => createTestMemoryNode());
      when(
        () => mockApi.getMemoryVersions(any(), any()),
      ).thenAnswer((_) async => createTestMemoryVersionList(count: 2));

      await tester.pumpWidget(createTestWidget());
      await tester.pumpAndSettle();

      expect(find.text('Version History'), findsOneWidget);
      expect(find.text('v1'), findsOneWidget);
      expect(find.text('v2'), findsOneWidget);
    });

    testWidgets('shows "No version history" when empty', (tester) async {
      when(
        () => mockApi.getMemoryNode(any(), any()),
      ).thenAnswer((_) async => createTestMemoryNode());
      when(
        () => mockApi.getMemoryVersions(any(), any()),
      ).thenAnswer((_) async => []);

      await tester.pumpWidget(createTestWidget());
      await tester.pumpAndSettle();

      expect(find.text('暂无版本历史'), findsOneWidget);
    });

    testWidgets('shows error state with retry', (tester) async {
      when(
        () => mockApi.getMemoryNode(any(), any()),
      ).thenThrow(Exception('Not found'));
      when(
        () => mockApi.getMemoryVersions(any(), any()),
      ).thenAnswer((_) async => []);

      await tester.pumpWidget(createTestWidget());
      await tester.pumpAndSettle();

      expect(find.text('加载节点失败'), findsOneWidget);
      expect(find.text('重试'), findsOneWidget);
    });

    testWidgets('version tile shows change type', (tester) async {
      when(
        () => mockApi.getMemoryNode(any(), any()),
      ).thenAnswer((_) async => createTestMemoryNode());
      when(() => mockApi.getMemoryVersions(any(), any())).thenAnswer(
        (_) async => [
          createTestMemoryVersion(versionNumber: 1, changeType: 'created'),
        ],
      );

      await tester.pumpWidget(createTestWidget());
      await tester.pumpAndSettle();

      expect(find.text('v1'), findsOneWidget);
      expect(find.text('created'), findsOneWidget);
    });
  });
}
