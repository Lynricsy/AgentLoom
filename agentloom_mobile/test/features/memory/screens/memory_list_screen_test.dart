import 'dart:async';

import 'package:agentloom_mobile/features/memory/api/memory_api.dart';
import 'package:agentloom_mobile/features/memory/models/memory_instance.dart';
import 'package:agentloom_mobile/features/memory/screens/memory_list_screen.dart';
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

  Widget createTestWidget() {
    return ProviderScope(
      overrides: [memoryApiProvider.overrideWithValue(mockApi)],
      child: const MaterialApp(home: MemoryListScreen()),
    );
  }

  group('MemoryListScreen', () {
    testWidgets('shows loading state initially', (tester) async {
      when(
        () => mockApi.getMemoryInstances(
          page: any(named: 'page'),
          pageSize: any(named: 'pageSize'),
        ),
      ).thenAnswer((_) => Completer<List<MemoryInstanceDto>>().future);

      await tester.pumpWidget(createTestWidget());
      await tester.pump();

      expect(find.byType(MemoryListScreen), findsOneWidget);
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
    });

    testWidgets('renders memory instance cards after loading', (tester) async {
      when(
        () => mockApi.getMemoryInstances(
          page: any(named: 'page'),
          pageSize: any(named: 'pageSize'),
        ),
      ).thenAnswer((_) async => createTestMemoryInstanceList());

      await tester.pumpWidget(createTestWidget());
      await tester.pumpAndSettle();

      expect(find.text('Memory Instance 0'), findsOneWidget);
      expect(find.text('Memory Instance 1'), findsOneWidget);
      expect(find.text('Memory Instance 2'), findsOneWidget);
    });

    testWidgets('shows node count on cards', (tester) async {
      when(
        () => mockApi.getMemoryInstances(
          page: any(named: 'page'),
          pageSize: any(named: 'pageSize'),
        ),
      ).thenAnswer((_) async => [createTestMemoryInstance(nodeCount: 7)]);

      await tester.pumpWidget(createTestWidget());
      await tester.pumpAndSettle();

      expect(find.text('7 nodes'), findsOneWidget);
    });

    testWidgets('shows status chip', (tester) async {
      when(
        () => mockApi.getMemoryInstances(
          page: any(named: 'page'),
          pageSize: any(named: 'pageSize'),
        ),
      ).thenAnswer((_) async => [createTestMemoryInstance(status: 'active')]);

      await tester.pumpWidget(createTestWidget());
      await tester.pumpAndSettle();

      expect(find.text('Active'), findsOneWidget);
    });

    testWidgets('shows empty state when no instances', (tester) async {
      when(
        () => mockApi.getMemoryInstances(
          page: any(named: 'page'),
          pageSize: any(named: 'pageSize'),
        ),
      ).thenAnswer((_) async => []);

      await tester.pumpWidget(createTestWidget());
      await tester.pumpAndSettle();

      expect(find.text('No memory instances found'), findsOneWidget);
    });

    testWidgets('shows error state with retry button', (tester) async {
      when(
        () => mockApi.getMemoryInstances(
          page: any(named: 'page'),
          pageSize: any(named: 'pageSize'),
        ),
      ).thenThrow(Exception('Network error'));

      await tester.pumpWidget(createTestWidget());
      await tester.pumpAndSettle();

      expect(find.text('Failed to load memory instances'), findsOneWidget);
      expect(find.text('Retry'), findsOneWidget);
    });

    testWidgets('supports pull-to-refresh', (tester) async {
      when(
        () => mockApi.getMemoryInstances(
          page: any(named: 'page'),
          pageSize: any(named: 'pageSize'),
        ),
      ).thenAnswer((_) async => createTestMemoryInstanceList());

      await tester.pumpWidget(createTestWidget());
      await tester.pumpAndSettle();

      expect(find.byType(RefreshIndicator), findsOneWidget);
    });

    testWidgets('shows description when available', (tester) async {
      when(
        () => mockApi.getMemoryInstances(
          page: any(named: 'page'),
          pageSize: any(named: 'pageSize'),
        ),
      ).thenAnswer(
        (_) async => [createTestMemoryInstance(description: 'My description')],
      );

      await tester.pumpWidget(createTestWidget());
      await tester.pumpAndSettle();

      expect(find.text('My description'), findsOneWidget);
    });
  });
}
