import 'package:flutter/material.dart';

/// 计算机展开视图（全屏模态）
///
/// Manus 风格: 终端输出 + CPU/Memory 指示器 + 步骤导航 + Live 指示器
class ComputerExpandView extends StatefulWidget {
  final List<String> terminalOutput;
  final bool isLive;
  final VoidCallback? onClose;

  const ComputerExpandView({
    super.key,
    required this.terminalOutput,
    this.isLive = false,
    this.onClose,
  });

  @override
  State<ComputerExpandView> createState() => _ComputerExpandViewState();
}

class _ComputerExpandViewState extends State<ComputerExpandView> {
  final ScrollController _scrollController = ScrollController();
  int _currentStep = 0;

  @override
  void didUpdateWidget(covariant ComputerExpandView oldWidget) {
    super.didUpdateWidget(oldWidget);
    // 自动滚动到底部
    if (widget.terminalOutput.length > oldWidget.terminalOutput.length) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_scrollController.hasClients) {
          _scrollController.animateTo(
            _scrollController.position.maxScrollExtent,
            duration: const Duration(milliseconds: 200),
            curve: Curves.easeOut,
          );
        }
      });
    }
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      backgroundColor: const Color(0xFF1E1E1E),
      appBar: AppBar(
        backgroundColor: const Color(0xFF252526),
        foregroundColor: Colors.white,
        leading: IconButton(
          icon: const Icon(Icons.close),
          onPressed: widget.onClose ?? () => Navigator.of(context).pop(),
        ),
        title: const Text(
          'Computer',
          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
        ),
        actions: [
          // Live 指示器
          if (widget.isLive)
            Container(
              margin: const EdgeInsets.only(right: 8),
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: Colors.green.withValues(alpha: 0.2),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 8,
                    height: 8,
                    decoration: const BoxDecoration(
                      color: Colors.green,
                      shape: BoxShape.circle,
                    ),
                  ),
                  const SizedBox(width: 4),
                  const Text(
                    'Live',
                    style: TextStyle(
                      color: Colors.green,
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
          const SizedBox(width: 8),
        ],
      ),
      body: Column(
        children: [
          // 资源指示器栏
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            color: const Color(0xFF252526),
            child: Row(
              children: [
                _ResourceIndicator(
                  label: 'CPU',
                  value: widget.isLive ? 'Active' : 'Idle',
                  color: widget.isLive ? Colors.green : Colors.grey,
                ),
                const SizedBox(width: 24),
                _ResourceIndicator(
                  label: 'Memory',
                  value: widget.isLive ? 'In use' : 'Free',
                  color: widget.isLive ? Colors.blue : Colors.grey,
                ),
                const Spacer(),
                // 步骤导航
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    IconButton(
                      icon: const Icon(Icons.chevron_left, color: Colors.white),
                      iconSize: 20,
                      onPressed: _currentStep > 0
                          ? () => setState(() => _currentStep--)
                          : null,
                    ),
                    Text(
                      '${_currentStep + 1}/${widget.terminalOutput.isEmpty ? 1 : widget.terminalOutput.length}',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: Colors.white70,
                      ),
                    ),
                    IconButton(
                      icon: const Icon(
                        Icons.chevron_right,
                        color: Colors.white,
                      ),
                      iconSize: 20,
                      onPressed: _currentStep < widget.terminalOutput.length - 1
                          ? () => setState(() => _currentStep++)
                          : null,
                    ),
                  ],
                ),
              ],
            ),
          ),

          // 终端输出
          Expanded(
            child: widget.terminalOutput.isEmpty
                ? Center(
                    child: Text(
                      'No terminal output yet',
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.5),
                      ),
                    ),
                  )
                : ListView.builder(
                    controller: _scrollController,
                    padding: const EdgeInsets.all(16),
                    itemCount: widget.terminalOutput.length,
                    itemBuilder: (context, index) {
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 2),
                        child: Text(
                          widget.terminalOutput[index],
                          style: const TextStyle(
                            color: Color(0xFFD4D4D4),
                            fontFamily: 'monospace',
                            fontSize: 13,
                            height: 1.5,
                          ),
                        ),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}

class _ResourceIndicator extends StatelessWidget {
  final String label;
  final String value;
  final Color color;

  const _ResourceIndicator({
    required this.label,
    required this.value,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 8,
          height: 8,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
        const SizedBox(width: 6),
        Text(
          '$label: $value',
          style: const TextStyle(color: Colors.white70, fontSize: 12),
        ),
      ],
    );
  }
}
