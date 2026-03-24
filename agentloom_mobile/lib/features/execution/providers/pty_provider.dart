import 'package:flutter_riverpod/flutter_riverpod.dart';

/// PTY 会话状态枚举
enum PtySessionStatus {
  running,
  exited,
  killing,
  killed;

  static PtySessionStatus fromString(String value) {
    return PtySessionStatus.values.firstWhere(
      (e) => e.name == value,
      orElse: () => PtySessionStatus.running,
    );
  }
}

/// 单个 PTY 会话的完整信息
class PtySessionInfo {
  const PtySessionInfo({
    required this.id,
    this.title,
    this.command,
    this.args,
    required this.status,
    this.pid,
    this.createdAt,
    this.lineCount = 0,
  });

  final String id;
  final String? title;
  final String? command;
  final List<String>? args;
  final PtySessionStatus status;
  final int? pid;
  final String? createdAt;
  final int lineCount;

  PtySessionInfo copyWith({
    String? id,
    String? title,
    String? command,
    List<String>? args,
    PtySessionStatus? status,
    int? pid,
    String? createdAt,
    int? lineCount,
  }) {
    return PtySessionInfo(
      id: id ?? this.id,
      title: title ?? this.title,
      command: command ?? this.command,
      args: args ?? this.args,
      status: status ?? this.status,
      pid: pid ?? this.pid,
      createdAt: createdAt ?? this.createdAt,
      lineCount: lineCount ?? this.lineCount,
    );
  }
}

/// 单个 PTY 会话的运行时状态（包含输出缓冲区）
class PtySessionState {
  const PtySessionState({
    required this.info,
    this.outputLines = const [],
    this.exitCode,
    this.exitSignal,
  });

  final PtySessionInfo info;
  final List<String> outputLines;
  final int? exitCode;
  final Object? exitSignal;

  PtySessionState copyWith({
    PtySessionInfo? info,
    List<String>? outputLines,
    int? exitCode,
    Object? exitSignal,
  }) {
    return PtySessionState(
      info: info ?? this.info,
      outputLines: outputLines ?? this.outputLines,
      exitCode: exitCode ?? this.exitCode,
      exitSignal: exitSignal ?? this.exitSignal,
    );
  }
}

/// PTY 全局状态（所有会话 + 活跃会话 ID）
class PtyState {
  const PtyState({this.sessions = const {}, this.activeSessionId});

  final Map<String, PtySessionState> sessions;
  final String? activeSessionId;

  /// 有序会话列表（按 createdAt 排序）
  List<PtySessionState> get sessionList {
    final entries = sessions.values.toList();
    entries.sort((a, b) {
      final aTime = a.info.createdAt ?? '';
      final bTime = b.info.createdAt ?? '';
      return aTime.compareTo(bTime);
    });
    return entries;
  }

  /// 活跃会话的输出行
  List<String> get activeOutputLines {
    if (activeSessionId == null) return const [];
    return sessions[activeSessionId]?.outputLines ?? const [];
  }

  /// 活跃会话状态
  PtySessionState? get activeSession {
    if (activeSessionId == null) return null;
    return sessions[activeSessionId];
  }

  PtyState copyWith({
    Map<String, PtySessionState>? sessions,
    String? activeSessionId,
    bool clearActiveSession = false,
  }) {
    return PtyState(
      sessions: sessions ?? this.sessions,
      activeSessionId: clearActiveSession
          ? null
          : (activeSessionId ?? this.activeSessionId),
    );
  }
}

/// 每个会话最大输出行数
const int kMaxOutputLinesPerSession = 10000;

/// PTY 状态管理 Notifier
///
/// 处理来自 Socket.IO 的 PTY 事件：
/// - `pty.spawned` → 添加新会话
/// - `pty.output` → 追加输出行到对应会话缓冲区
/// - `pty.exit` → 更新会话状态为 exited
/// - `pty.killed` → 更新会话状态为 killed
class PtyNotifier extends Notifier<PtyState> {
  @override
  PtyState build() {
    return const PtyState();
  }

  /// 处理 pty.spawned 事件
  void handleSpawned(Map<String, dynamic> data) {
    final sessionId = data['sessionId'] as String?;
    if (sessionId == null) return;

    final info = data['info'];
    final infoMap = info is Map<String, dynamic> ? info : <String, dynamic>{};

    final session = PtySessionState(
      info: PtySessionInfo(
        id: sessionId,
        title: infoMap['title'] as String?,
        command: infoMap['command'] as String?,
        args: (infoMap['args'] as List<dynamic>?)?.cast<String>(),
        status: PtySessionStatus.running,
        pid: infoMap['pid'] as int?,
        createdAt: infoMap['createdAt'] as String?,
        lineCount: 0,
      ),
    );

    final updatedSessions = Map<String, PtySessionState>.from(state.sessions);
    updatedSessions[sessionId] = session;

    // 自动选中第一个会话
    final activeId = state.activeSessionId ?? sessionId;

    state = state.copyWith(
      sessions: updatedSessions,
      activeSessionId: activeId,
    );
  }

  /// 处理 pty.output 事件
  void handleOutput(Map<String, dynamic> data) {
    final sessionId = data['sessionId'] as String?;
    final output = data['data'] as String?;
    if (sessionId == null || output == null) return;

    final existing = state.sessions[sessionId];
    if (existing == null) return;

    // 将输出按行分割并追加
    final newLines = output.split('\n');
    var updatedLines = [...existing.outputLines, ...newLines];

    // 限制最大行数（从前端截断）
    if (updatedLines.length > kMaxOutputLinesPerSession) {
      updatedLines = updatedLines.sublist(
        updatedLines.length - kMaxOutputLinesPerSession,
      );
    }

    final updatedSessions = Map<String, PtySessionState>.from(state.sessions);
    updatedSessions[sessionId] = existing.copyWith(
      outputLines: updatedLines,
      info: existing.info.copyWith(lineCount: updatedLines.length),
    );

    state = state.copyWith(sessions: updatedSessions);
  }

  /// 处理 pty.exit 事件
  void handleExit(Map<String, dynamic> data) {
    final sessionId = data['sessionId'] as String?;
    if (sessionId == null) return;

    final existing = state.sessions[sessionId];
    if (existing == null) return;

    final exitCode = data['exitCode'] as int?;
    final exitSignal = data['exitSignal'];

    final updatedSessions = Map<String, PtySessionState>.from(state.sessions);
    updatedSessions[sessionId] = existing.copyWith(
      info: existing.info.copyWith(status: PtySessionStatus.exited),
      exitCode: exitCode,
      exitSignal: exitSignal,
    );

    state = state.copyWith(sessions: updatedSessions);
  }

  /// 处理 pty.killed 事件
  void handleKilled(Map<String, dynamic> data) {
    final sessionId = data['sessionId'] as String?;
    if (sessionId == null) return;

    final existing = state.sessions[sessionId];
    if (existing == null) return;

    final updatedSessions = Map<String, PtySessionState>.from(state.sessions);
    updatedSessions[sessionId] = existing.copyWith(
      info: existing.info.copyWith(status: PtySessionStatus.killed),
    );

    state = state.copyWith(sessions: updatedSessions);
  }

  /// 处理通用 PTY 事件（从 Socket.IO agent-event 中提取）
  void handlePtyEvent(Map<String, dynamic> event) {
    final type = event['type'] as String?;
    if (type == null) return;

    switch (type) {
      case 'pty.spawned':
        handleSpawned(event);
      case 'pty.output':
        handleOutput(event);
      case 'pty.exit':
        handleExit(event);
      case 'pty.killed':
        handleKilled(event);
    }
  }

  /// 切换活跃会话
  void setActiveSession(String sessionId) {
    if (!state.sessions.containsKey(sessionId)) return;
    state = state.copyWith(activeSessionId: sessionId);
  }

  /// 清空所有会话
  void clear() {
    state = const PtyState();
  }
}

/// PTY 状态 Provider
final ptyProvider = NotifierProvider<PtyNotifier, PtyState>(PtyNotifier.new);
