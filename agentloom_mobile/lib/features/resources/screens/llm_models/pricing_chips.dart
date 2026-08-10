import 'package:flutter/material.dart';

import '../../models/resource_entities.dart';

String _formatPriceLabel(double value) {
  return '\$${value.toStringAsFixed(2)} / 1M';
}

String _formatThresholdLabel(int tokens) {
  if (tokens % 1000000 == 0) {
    return '${tokens ~/ 1000000}M+';
  }
  if (tokens % 1000 == 0) {
    return '${tokens ~/ 1000}K+';
  }
  return '$tokens+';
}

List<Widget> buildPricingChips(ModelPricingDto pricing) {
  return <Widget>[
    Chip(
      label: Text('输入 ${_formatPriceLabel(pricing.inputPer1MTokens)}'),
      visualDensity: VisualDensity.compact,
    ),
    Chip(
      label: Text('输出 ${_formatPriceLabel(pricing.outputPer1MTokens)}'),
      visualDensity: VisualDensity.compact,
    ),
    if (pricing.cachedReadPer1MTokens != null)
      Chip(
        label: Text('缓存读 ${_formatPriceLabel(pricing.cachedReadPer1MTokens!)}'),
        visualDensity: VisualDensity.compact,
      ),
    if (pricing.cachedWritePer1MTokens != null)
      Chip(
        label: Text(
          '缓存写 ${_formatPriceLabel(pricing.cachedWritePer1MTokens!)}',
        ),
        visualDensity: VisualDensity.compact,
      ),
    ...pricing.tiers.map(
      (tier) => Chip(
        label: Text(
          '${_formatThresholdLabel(tier.aboveTokens)} '
          '输入 ${_formatPriceLabel(tier.inputPer1MTokens)} '
          '输出 ${_formatPriceLabel(tier.outputPer1MTokens)}',
        ),
        visualDensity: VisualDensity.compact,
      ),
    ),
  ];
}
