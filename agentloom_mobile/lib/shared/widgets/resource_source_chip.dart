import 'package:flutter/material.dart';

String getResourceSourceLabel(String? sourceKind) {
  switch (sourceKind) {
    case 'share_imported':
      return '分享导入';
    default:
      return '自己创建';
  }
}

bool isShareImportedResource(String? sourceKind) {
  return sourceKind == 'share_imported';
}

class ResourceSourceChip extends StatelessWidget {
  const ResourceSourceChip({
    super.key,
    required this.sourceKind,
    this.compact = false,
  });

  final String? sourceKind;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final imported = isShareImportedResource(sourceKind);
    final background = imported
        ? theme.colorScheme.secondaryContainer
        : theme.colorScheme.surfaceContainerHighest;
    final foreground = imported
        ? theme.colorScheme.onSecondaryContainer
        : theme.colorScheme.onSurfaceVariant;

    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: compact ? 8 : 10,
        vertical: compact ? 3 : 4,
      ),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(compact ? 10 : 12),
      ),
      child: Text(
        getResourceSourceLabel(sourceKind),
        style: theme.textTheme.labelSmall?.copyWith(
          color: foreground,
          fontWeight: FontWeight.w600,
          fontSize: compact ? 10 : null,
        ),
      ),
    );
  }
}
