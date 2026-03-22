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

    testWidgets('renders node content after loading', (tester) async {
      when(() => mockApi.getMemoryNode(any(), any())).thenAnswer(
        (_) async => createTestMemoryNode(
          content: 'This is the node content text.',
          disclosureLevel: 'public',
          triggerKeywords: ['keyword1', 'keyword2'],
        ),
      );
      when(
        () => mockApi.getMemoryVersions(any(), any()),
      ).thenAnswer((_) async => []);

      await tester.pumpWidget(createTestWidget());
      await tester.pumpAndSettle();

      expect(find.text('This is the node content text.'), findsOneWidget);
      expect(find.text('Node Content'), findsOneWidget);
    });

    testWidgets('shows disclosure level', (tester) async {
      when(() => mockApi.getMemoryNode(any(), any())).thenAnswer(
        (_) async => createTestMemoryNode(disclosureLevel: 'confidential'),
      );
      when(
        () => mockApi.getMemoryVersions(any(), any()),
      ).thenAnswer((_) async => []);

      await tester.pumpWidget(createTestWidget());
      await tester.pumpAndSettle();

      expect(find.text('confidential'), findsOneWidget);
      expect(find.text('Disclosure: '), findsOneWidget);
    });

    testWidgets('shows trigger keyword chips', (tester) async {
      when(() => mockApi.getMemoryNode(any(), any())).thenAnswer(
        (_) async =>
            createTestMemoryNode(triggerKeywords: ['ai', 'machine-learning']),
      );
      when(
        () => mockApi.getMemoryVersions(any(), any()),
      ).thenAnswer((_) async => []);

      await tester.pumpWidget(createTestWidget());
      await tester.pumpAndSettle();

      expect(find.byType(Chip), findsNWidgets(2));
      expect(find.text('ai'), findsOneWidget);
      expect(find.text('machine-learning'), findsOneWidget);
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

      expect(find.text('No version history'), findsOneWidget);
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

      expect(find.text('Failed to load node'), findsOneWidget);
      expect(find.text('Retry'), findsOneWidget);
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
