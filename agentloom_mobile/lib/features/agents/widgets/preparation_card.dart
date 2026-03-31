import 'package:flutter/material.dart';

import '../models/conversation_message_dto.dart';

/// 准备阶段的步骤定义
class _StepDef {
  const _StepDef({required this.phase, required this.label});

  final PreparationPhase phase;
  final String label;
}

const _kAllSteps = <_StepDef>[
  _StepDef(phase: PreparationPhase.queued, label: '排队中'),
  _StepDef(phase: PreparationPhase.preparing, label: '准备环境'),
  _StepDef(phase: PreparationPhase.sandboxCreating, label: '沙箱启动中'),
  _StepDef(phase: PreparationPhase.agentInitializing, label: 'Agent 初始化'),
  _StepDef(phase: PreparationPhase.running, label: '开始运行'),
];

/// 获取阶段在步骤列表中的序号索引
int _phaseIndex(PreparationPhase phase, List<_StepDef> steps) {
  for (var i = 0; i < steps.length; i++) {
    if (steps[i].phase == phase) {
      return i;
    }
  }
  return -1;
}

/// 沙箱启动准备卡片
///
/// 在 Agent 消息位置展示竖向步骤指示器，显示启动进度。
/// 当 [collapsed] 为 true 时收缩为一行摘要。
class PreparationCard extends StatefulWidget {
  const PreparationCard({
    super.key,
    required this.phase,
    this.sandboxReused = false,
    this.failedPhase,
    this.error,
    this.preparationStartTime,
    this.collapsed = false,
  });

  /// 当前准备阶段（null 时不应渲染此组件）
  final PreparationPhase? phase;

  /// 是否复用了已有沙箱
  final bool sandboxReused;

  /// 失败时标记哪一步出了问题
  final PreparationPhase? failedPhase;

  /// 错误摘要
  final String? error;

  /// 准备开始时间
  final DateTime? preparationStartTime;

  /// 是否已收缩（Agent 开始流式输出后）
  final bool collapsed;

  @override
  State<PreparationCard> createState() => _PreparationCardState();
}

class _PreparationCardState extends State<PreparationCard>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late final Animation<double> _fadeAnimation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(milliseconds: 300),
      vsync: this,
    );
    _fadeAnimation = CurvedAnimation(
      parent: _controller,
      curve: Curves.easeInOut,
    );
    if (widget.collapsed) {
      _controller.value = 1.0;
    }
  }

  @override
  void didUpdateWidget(covariant PreparationCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.collapsed && !oldWidget.collapsed) {
      _controller.forward();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Align(
      alignment: Alignment.centerLeft,
      child: Container(
        constraints: BoxConstraints(
          maxWidth: MediaQuery.of(context).size.width * 0.9,
        ),
        margin: const EdgeInsets.fromLTRB(16, 6, 40, 6),
        decoration: BoxDecoration(
          color: theme.colorScheme.surfaceContainerLow,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: theme.colorScheme.outlineVariant),
        ),
        child: AnimatedSize(
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeInOut,
          alignment: Alignment.topCenter,
          child: AnimatedSwitcher(
            duration: const Duration(milliseconds: 300),
            switchInCurve: Curves.easeInOut,
            switchOutCurve: Curves.easeInOut,
            child: widget.collapsed
                ? _CollapsedSummary(
                    key: const ValueKey('collapsed'),
                    preparationStartTime: widget.preparationStartTime,
                    fadeAnimation: _fadeAnimation,
                  )
                : _ExpandedStepper(
                    key: const ValueKey('expanded'),
                    phase: widget.phase,
                    sandboxReused: widget.sandboxReused,
                    failedPhase: widget.failedPhase,
                    error: widget.error,
                  ),
          ),
        ),
      ),
    );
  }
}

/// 收缩后的一行摘要
class _CollapsedSummary extends StatelessWidget {
  const _CollapsedSummary({
    super.key,
    required this.preparationStartTime,
    required this.fadeAnimation,
  });

  final DateTime? preparationStartTime;
  final Animation<double> fadeAnimation;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final elapsed = preparationStartTime != null
        ? DateTime.now().difference(preparationStartTime!).inSeconds
        : 0;

    return FadeTransition(
      opacity: fadeAnimation,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.check_circle,
              size: 18,
              color: Colors.green.shade500,
            ),
            const SizedBox(width: 10),
            Text(
              '环境就绪 · 用时 ${elapsed}s',
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
                fontWeight: FontWeight.w500,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// 展开的竖向步骤指示器
class _ExpandedStepper extends StatelessWidget {
  const _ExpandedStepper({
    super.key,
    required this.phase,
    required this.sandboxReused,
    this.failedPhase,
    this.error,
  });

  final PreparationPhase? phase;
  final bool sandboxReused;
  final PreparationPhase? failedPhase;
  final String? error;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    // 根据是否复用沙箱过滤步骤
    final steps = sandboxReused
        ? _kAllSteps
              .where((s) => s.phase != PreparationPhase.sandboxCreating)
              .toList(growable: false)
        : _kAllSteps;

    final currentIndex = phase != null ? _phaseIndex(phase!, steps) : -1;
    final failedIndex =
        failedPhase != null ? _phaseIndex(failedPhase!, steps) : -1;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          // 标题行
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                Icons.auto_awesome_outlined,
                size: 14,
                color: theme.colorScheme.onSurfaceVariant,
              ),
              const SizedBox(width: 6),
              Text(
                'Agent',
                style: theme.textTheme.labelMedium?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          // 步骤列表
          for (var i = 0; i < steps.length; i++) ...[
            _StepRow(
              step: steps[i],
              state: _resolveStepState(i, currentIndex, failedIndex),
              error: failedIndex == i ? error : null,
              isLast: i == steps.length - 1,
            ),
          ],
        ],
      ),
    );
  }

  _StepState _resolveStepState(
    int index,
    int currentIndex,
    int failedIndex,
  ) {
    if (failedIndex >= 0 && index == failedIndex) {
      return _StepState.failed;
    }
    if (currentIndex < 0) {
      return _StepState.pending;
    }
    if (index < currentIndex) {
      return _StepState.completed;
    }
    if (index == currentIndex) {
      return _StepState.active;
    }
    return _StepState.pending;
  }
}

enum _StepState { pending, active, completed, failed }

/// 单个步骤行
class _StepRow extends StatelessWidget {
  const _StepRow({
    required this.step,
    required this.state,
    this.error,
    required this.isLast,
  });

  final _StepDef step;
  final _StepState state;
  final String? error;
  final bool isLast;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // 左侧图标 + 连接线
          SizedBox(
            width: 24,
            child: Column(
              children: [
                _buildIcon(theme),
                if (!isLast)
                  Expanded(
                    child: Container(
                      width: 1.5,
                      margin: const EdgeInsets.symmetric(vertical: 3),
                      color: state == _StepState.completed
                          ? Colors.green.shade300
                          : theme.colorScheme.outlineVariant,
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          // 右侧文字
          Expanded(
            child: Padding(
              padding: EdgeInsets.only(bottom: isLast ? 0 : 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    step.label,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: _textColor(theme),
                      fontWeight: state == _StepState.active
                          ? FontWeight.w500
                          : FontWeight.normal,
                    ),
                  ),
                  if (state == _StepState.failed && error != null) ...[
                    const SizedBox(height: 4),
                    Text(
                      error!,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.error,
                      ),
                      maxLines: 3,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildIcon(ThemeData theme) {
    switch (state) {
      case _StepState.completed:
        return Icon(
          Icons.check_circle,
          size: 20,
          color: Colors.green.shade500,
        );
      case _StepState.active:
        return SizedBox(
          width: 20,
          height: 20,
          child: CircularProgressIndicator(
            strokeWidth: 2,
            color: theme.colorScheme.primary,
          ),
        );
      case _StepState.failed:
        return Icon(
          Icons.cancel,
          size: 20,
          color: theme.colorScheme.error,
        );
      case _StepState.pending:
        return Icon(
          Icons.circle_outlined,
          size: 20,
          color: theme.colorScheme.onSurface.withValues(alpha: 0.38),
        );
    }
  }

  Color _textColor(ThemeData theme) {
    switch (state) {
      case _StepState.completed:
        return theme.colorScheme.onSurface.withValues(alpha: 0.55);
      case _StepState.active:
        return theme.colorScheme.primary;
      case _StepState.failed:
        return theme.colorScheme.error;
      case _StepState.pending:
        return theme.colorScheme.onSurface.withValues(alpha: 0.38);
    }
  }
}
