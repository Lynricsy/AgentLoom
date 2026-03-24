import 'package:agentloom_mobile/features/execution/providers/pty_provider.dart';
import 'package:agentloom_mobile/features/execution/widgets/pty_log_viewer.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

/// 创建带有 ProviderScope 和 override 的测试 Widget
Widget _createTestWidget({PtyState? initialState}) {
  final container = ProviderContainer(
    overrides: [
      if (initialState != null)
        ptyProvider.overrideWith(() {
          return _TestPtyNotifier(initialState);
        }),
    ],
  );

  return UncontrolledProviderScope(
    container: container,
    child: const MaterialApp(
      home: Scaffold(
        body: SizedBox(width: 400, height: 600, child: PtyLogViewer()),
      ),
    ),
  );
}

/// 用于测试的 PtyNotifier 子类，可注入初始状态
class _TestPtyNotifier extends PtyNotifier {
  _TestPtyNotifier(this._initialState);
  final PtyState _initialState;

  @override
  PtyState build() {
    return _initialState;
  }
}

/// 创建测试用 PtySessionState
PtySessionState _createTestSession({
  String id = 'pty-001',
  String? title,
  String? command = 'bash',
  PtySessionStatus status = PtySessionStatus.running,
  List<String> outputLines = const [],
  int? exitCode,
  String? createdAt = '2026-01-01T10:00:00.000Z',
}) {
  return PtySessionState(
    info: PtySessionInfo(
      id: id,
      title: title,
      command: command,
      status: status,
      createdAt: createdAt,
      lineCount: outputLines.length,
    ),
    outputLines: outputLines,
    exitCode: exitCode,
  );
}

void main() {
  group('PtyLogViewer', () {
    testWidgets('renders empty state when no sessions', (tester) async {
      await tester.pumpWidget(_createTestWidget());

      expect(find.text('No terminal sessions'), findsOneWidget);
      expect(find.byIcon(Icons.terminal), findsOneWidget);
    });

    testWidgets('renders session selector with sessions', (tester) async {
      final session = _createTestSession(
        id: 'pty-001',
        command: 'npm run dev',
        outputLines: ['\$ npm run dev', 'Server started on port 3000'],
      );

      await tester.pumpWidget(
        _createTestWidget(
          initialState: PtyState(
            sessions: {'pty-001': session},
            activeSessionId: 'pty-001',
          ),
        ),
      );

      // 会话选择器应该存在
      expect(find.text('Terminal Session'), findsOneWidget);
      // 命令应该显示在信息栏
      expect(find.text('npm run dev'), findsWidgets);
    });

    testWidgets('renders output lines correctly', (tester) async {
      final lines = [
        '\$ echo hello',
        'hello',
        '\$ ls -la',
        'total 64',
        'drwxr-xr-x 5 root root 4096 Jan 1 10:00 .',
      ];

      final session = _createTestSession(id: 'pty-001', outputLines: lines);

      await tester.pumpWidget(
        _createTestWidget(
          initialState: PtyState(
            sessions: {'pty-001': session},
            activeSessionId: 'pty-001',
          ),
        ),
      );

      // 所有输出行应该被渲染
      for (final line in lines) {
        expect(find.text(line), findsOneWidget);
      }
    });

    testWidgets('renders status badge for running session', (tester) async {
      final session = _createTestSession(status: PtySessionStatus.running);

      await tester.pumpWidget(
        _createTestWidget(
          initialState: PtyState(
            sessions: {'pty-001': session},
            activeSessionId: 'pty-001',
          ),
        ),
      );

      expect(find.text('running'), findsOneWidget);
    });

    testWidgets('renders exited session with exit code', (tester) async {
      final session = _createTestSession(
        status: PtySessionStatus.exited,
        exitCode: 0,
        outputLines: ['done'],
      );

      await tester.pumpWidget(
        _createTestWidget(
          initialState: PtyState(
            sessions: {'pty-001': session},
            activeSessionId: 'pty-001',
          ),
        ),
      );

      expect(find.text('exited'), findsOneWidget);
      expect(find.text('exit: 0'), findsOneWidget);
    });

    testWidgets('renders killed session status', (tester) async {
      final session = _createTestSession(
        status: PtySessionStatus.killed,
        outputLines: ['killed process'],
      );

      await tester.pumpWidget(
        _createTestWidget(
          initialState: PtyState(
            sessions: {'pty-001': session},
            activeSessionId: 'pty-001',
          ),
        ),
      );

      expect(find.text('killed'), findsOneWidget);
    });

    testWidgets('renders waiting message when no output', (tester) async {
      final session = _createTestSession(outputLines: []);

      await tester.pumpWidget(
        _createTestWidget(
          initialState: PtyState(
            sessions: {'pty-001': session},
            activeSessionId: 'pty-001',
          ),
        ),
      );

      expect(find.text('Waiting for output...'), findsOneWidget);
    });

    testWidgets('handles large output (1000+ lines) without crash', (
      tester,
    ) async {
      // 生成 1500 行输出
      final lines = List.generate(
        1500,
        (i) => 'output line $i: ${DateTime.now().toIso8601String()}',
      );

      final session = _createTestSession(id: 'pty-large', outputLines: lines);

      await tester.pumpWidget(
        _createTestWidget(
          initialState: PtyState(
            sessions: {'pty-large': session},
            activeSessionId: 'pty-large',
          ),
        ),
      );

      // 行数显示
      expect(find.text('1500 lines'), findsOneWidget);

      // ListView.builder 应该虚拟化，不会全部渲染
      // 验证至少能找到可见范围内的某些行
      expect(
        find.text('output line 0: ${lines[0].split(': ')[1]}'),
        findsOneWidget,
      );

      // 不应崩溃或超时
    });

    testWidgets('renders multiple sessions in selector', (tester) async {
      final session1 = _createTestSession(
        id: 'pty-001',
        title: 'Dev Server',
        command: 'npm run dev',
        createdAt: '2026-01-01T10:00:00.000Z',
        outputLines: ['server running'],
      );
      final session2 = _createTestSession(
        id: 'pty-002',
        title: 'Build',
        command: 'npm run build',
        createdAt: '2026-01-01T10:01:00.000Z',
        outputLines: ['building...'],
      );

      await tester.pumpWidget(
        _createTestWidget(
          initialState: PtyState(
            sessions: {'pty-001': session1, 'pty-002': session2},
            activeSessionId: 'pty-001',
          ),
        ),
      );

      // 活跃会话的标题/命令应该在选择器中显示
      expect(find.text('Dev Server'), findsOneWidget);
      // 活跃会话的输出应该显示
      expect(find.text('server running'), findsOneWidget);
    });

    testWidgets('shows line count in session info bar', (tester) async {
      final session = _createTestSession(
        outputLines: List.generate(42, (i) => 'line $i'),
      );

      await tester.pumpWidget(
        _createTestWidget(
          initialState: PtyState(
            sessions: {'pty-001': session},
            activeSessionId: 'pty-001',
          ),
        ),
      );

      expect(find.text('42 lines'), findsOneWidget);
    });
  });

  group('PtyNotifier', () {
    test('handleSpawned adds new session', () {
      final container = ProviderContainer();
      addTearDown(container.dispose);

      final notifier = container.read(ptyProvider.notifier);
      notifier.handleSpawned({
        'sessionId': 'pty-001',
        'info': {
          'id': 'pty-001',
          'title': 'Test',
          'command': 'bash',
          'status': 'running',
          'pid': 1234,
          'createdAt': '2026-01-01T10:00:00.000Z',
        },
      });

      final state = container.read(ptyProvider);
      expect(state.sessions.length, 1);
      expect(state.sessions['pty-001']?.info.command, 'bash');
      expect(state.sessions['pty-001']?.info.pid, 1234);
      expect(state.activeSessionId, 'pty-001');
    });

    test('handleOutput appends lines to existing session', () {
      final container = ProviderContainer();
      addTearDown(container.dispose);

      final notifier = container.read(ptyProvider.notifier);
      notifier.handleSpawned({
        'sessionId': 'pty-001',
        'info': {'id': 'pty-001', 'command': 'bash'},
      });
      notifier.handleOutput({'sessionId': 'pty-001', 'data': 'hello\nworld'});

      final state = container.read(ptyProvider);
      expect(state.sessions['pty-001']?.outputLines, ['hello', 'world']);
      expect(state.sessions['pty-001']?.info.lineCount, 2);
    });

    test('handleOutput enforces max line limit', () {
      final container = ProviderContainer();
      addTearDown(container.dispose);

      final notifier = container.read(ptyProvider.notifier);
      notifier.handleSpawned({
        'sessionId': 'pty-001',
        'info': {'id': 'pty-001'},
      });

      // 添加超过上限的行
      final bigOutput = List.generate(
        kMaxOutputLinesPerSession + 500,
        (i) => 'line $i',
      ).join('\n');

      notifier.handleOutput({'sessionId': 'pty-001', 'data': bigOutput});

      final state = container.read(ptyProvider);
      expect(
        state.sessions['pty-001']?.outputLines.length,
        kMaxOutputLinesPerSession,
      );
    });

    test('handleExit updates session status', () {
      final container = ProviderContainer();
      addTearDown(container.dispose);

      final notifier = container.read(ptyProvider.notifier);
      notifier.handleSpawned({
        'sessionId': 'pty-001',
        'info': {'id': 'pty-001'},
      });
      notifier.handleExit({'sessionId': 'pty-001', 'exitCode': 0});

      final state = container.read(ptyProvider);
      expect(state.sessions['pty-001']?.info.status, PtySessionStatus.exited);
      expect(state.sessions['pty-001']?.exitCode, 0);
    });

    test('handleKilled updates session status', () {
      final container = ProviderContainer();
      addTearDown(container.dispose);

      final notifier = container.read(ptyProvider.notifier);
      notifier.handleSpawned({
        'sessionId': 'pty-001',
        'info': {'id': 'pty-001'},
      });
      notifier.handleKilled({'sessionId': 'pty-001'});

      final state = container.read(ptyProvider);
      expect(state.sessions['pty-001']?.info.status, PtySessionStatus.killed);
    });

    test('handlePtyEvent dispatches to correct handler', () {
      final container = ProviderContainer();
      addTearDown(container.dispose);

      final notifier = container.read(ptyProvider.notifier);
      notifier.handlePtyEvent({
        'type': 'pty.spawned',
        'sessionId': 'pty-001',
        'info': {'id': 'pty-001', 'command': 'ls'},
      });

      final state = container.read(ptyProvider);
      expect(state.sessions.containsKey('pty-001'), true);
    });

    test('clear resets all state', () {
      final container = ProviderContainer();
      addTearDown(container.dispose);

      final notifier = container.read(ptyProvider.notifier);
      notifier.handleSpawned({
        'sessionId': 'pty-001',
        'info': {'id': 'pty-001'},
      });
      notifier.clear();

      final state = container.read(ptyProvider);
      expect(state.sessions.isEmpty, true);
      expect(state.activeSessionId, null);
    });
  });
}
