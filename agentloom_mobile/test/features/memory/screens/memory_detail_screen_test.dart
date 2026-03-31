import 'dart:async';

import 'package:agentloom_mobile/features/memory/api/memory_api.dart';
import 'package:agentloom_mobile/features/memory/models/memory_instance.dart';
import 'package:agentloom_mobile/features/memory/models/memory_node.dart';
import 'package:agentloom_mobile/features/memory/screens/memory_detail_screen.dart';
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

  Widget createTestWidget({String instanceId = 'mem-inst-1'}) {
    return ProviderScope(
      overrides: [memoryApiProvider.overrideWithValue(mockApi)],
      child: MaterialApp(home: MemoryDetailScreen(instanceId: instanceId)),
    );
  }

  group('MemoryDetailScreen', () {
    testWidgets('shows loading state initially', (tester) async {
      when(
        () => mockApi.getMemoryInstance(any()),
      ).thenAnswer((_) => Completer<MemoryInstanceDto>().future);
      when(
        () => mockApi.getMemoryNodes(any()),
      ).thenAnswer((_) => Completer<List<MemoryNodeDto>>().future);

      await tester.pumpWidget(createTestWidget());
      await tester.pump();

      expect(find.byType(CircularProgressIndicator), findsOneWidget);
    });

    testWidgets('renders instance info after loading', (tester) async {
      final instance = createTestMemoryInstance(
        name: 'My Knowledge Base',
        description: 'Important knowledge',
        status: 'active',
        nodeCount: 10,
        edgeCount: 5,
      );
      when(
        () => mockApi.getMemoryInstance(any()),
      ).thenAnswer((_) async => instance);
      when(() => mockApi.getMemoryNodes(any())).thenAnswer((_) async => []);

      await tester.pumpWidget(createTestWidget());
      await tester.pumpAndSettle();

      // 名前はAppBarとinfo cardに2箇所表示される
      expect(find.text('My Knowledge Base'), findsNWidgets(2));
      expect(find.text('Important knowledge'), findsOneWidget);
      expect(find.text('Active'), findsOneWidget);
      // 'Nodes' 标签出现在元数据行和节点列表标题中
      expect(find.text('10'), findsOneWidget);
      expect(find.text('5'), findsOneWidget);
    });

    testWidgets('shows node list when nodes available', (tester) async {
      when(
        () => mockApi.getMemoryInstance(any()),
      ).thenAnswer((_) async => createTestMemoryInstance());
      when(
        () => mockApi.getMemoryNodes(any()),
      ).thenAnswer((_) async => createTestMemoryNodeList(count: 2));

      await tester.pumpWidget(createTestWidget());
      await tester.pumpAndSettle();

      // 节点 contentType 应显示
      expect(find.text('text'), findsNWidgets(2));
    });

    testWidgets('shows "No nodes yet" when empty', (tester) async {
      when(
        () => mockApi.getMemoryInstance(any()),
      ).thenAnswer((_) async => createTestMemoryInstance());
      when(() => mockApi.getMemoryNodes(any())).thenAnswer((_) async => []);

      await tester.pumpWidget(createTestWidget());
      await tester.pumpAndSettle();

      expect(find.text('No nodes yet'), findsOneWidget);
    });

    testWidgets('shows Nodes section header', (tester) async {
      when(
        () => mockApi.getMemoryInstance(any()),
      ).thenAnswer((_) async => createTestMemoryInstance());
      when(() => mockApi.getMemoryNodes(any())).thenAnswer((_) async => []);

      await tester.pumpWidget(createTestWidget());
      await tester.pumpAndSettle();

      // 'Nodes' 出现两次：一次在 metadata row，一次在 section header
      expect(find.text('Nodes'), findsNWidgets(2));
    });

    testWidgets('shows error state with retry', (tester) async {
      when(
        () => mockApi.getMemoryInstance(any()),
      ).thenThrow(Exception('Not found'));
      when(() => mockApi.getMemoryNodes(any())).thenAnswer((_) async => []);

      await tester.pumpWidget(createTestWidget());
      await tester.pumpAndSettle();

      expect(find.text('Failed to load memory instance'), findsOneWidget);
      expect(find.text('Retry'), findsOneWidget);
    });

    testWidgets('shows metadata rows', (tester) async {
      when(() => mockApi.getMemoryInstance(any())).thenAnswer(
        (_) async => createTestMemoryInstance(config: {'type': 'kg'}),
      );
      when(() => mockApi.getMemoryNodes(any())).thenAnswer((_) async => []);

      await tester.pumpWidget(createTestWidget());
      await tester.pumpAndSettle();

      // 'Nodes' 出现两次：metadata row + section header
      expect(find.text('Nodes'), findsNWidgets(2));
      expect(find.text('Edges'), findsOneWidget);
      expect(find.text('Config'), findsOneWidget);
      expect(find.text('Updated'), findsOneWidget);
      expect(find.text('Created'), findsOneWidget);
    });
  });
}
