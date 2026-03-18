import { describe, expect, it } from 'vitest';
import {
  CANONICAL_AUTONOMY_MODE_ORDER,
  clampAutonomyModeToCap,
  compareAutonomyModes,
  explainAutonomyViolation,
  isAutonomyModeAllowed,
  isCanonicalAutonomyMode,
  isLegacyAutonomyMode,
  normalizeAutonomyMode,
} from '../autonomy-mode-compat';

describe('autonomy-mode-compat', () => {
  it('应暴露稳定的 canonical 自治顺序', () => {
    expect(CANONICAL_AUTONOMY_MODE_ORDER).toEqual([
      'MANUAL_CONFIRM',
      'RULE_BASED',
      'LLM_SUGGEST',
    ]);
  });

  it('应识别 canonical 自治模式', () => {
    expect(isCanonicalAutonomyMode('MANUAL_CONFIRM')).toBe(true);
    expect(isCanonicalAutonomyMode('RULE_BASED')).toBe(true);
    expect(isCanonicalAutonomyMode('LLM_SUGGEST')).toBe(true);
    expect(isCanonicalAutonomyMode('FULL_AUTO')).toBe(false);
  });

  it('应识别 legacy 自治模式', () => {
    expect(isLegacyAutonomyMode('FIXED')).toBe(true);
    expect(isLegacyAutonomyMode('LLM_DECIDE')).toBe(true);
    expect(isLegacyAutonomyMode('FULL_AUTO')).toBe(true);
    expect(isLegacyAutonomyMode('RULE_BASED')).toBe(false);
  });

  it('应将 FIXED 归一化为 MANUAL_CONFIRM', () => {
    expect(normalizeAutonomyMode('FIXED')).toMatchObject({
      rawMode: 'FIXED',
      canonicalMode: 'MANUAL_CONFIRM',
      source: 'legacy',
      requiresMigration: true,
    });
  });

  it('应将 LLM_DECIDE 归一化为 LLM_SUGGEST', () => {
    expect(normalizeAutonomyMode('LLM_DECIDE')).toMatchObject({
      rawMode: 'LLM_DECIDE',
      canonicalMode: 'LLM_SUGGEST',
      source: 'legacy',
      requiresMigration: true,
    });
  });

  it('应将 FULL_AUTO 归一化为 LLM_SUGGEST', () => {
    expect(normalizeAutonomyMode('FULL_AUTO')).toMatchObject({
      rawMode: 'FULL_AUTO',
      canonicalMode: 'LLM_SUGGEST',
      source: 'legacy',
      requiresMigration: true,
    });
  });

  it('缺失或未知值应安全回退到 MANUAL_CONFIRM', () => {
    expect(normalizeAutonomyMode(undefined)).toMatchObject({
      rawMode: null,
      canonicalMode: 'MANUAL_CONFIRM',
      source: 'missing',
      requiresMigration: false,
    });

    expect(normalizeAutonomyMode('UNSUPPORTED')).toMatchObject({
      rawMode: 'UNSUPPORTED',
      canonicalMode: 'MANUAL_CONFIRM',
      source: 'unknown',
      requiresMigration: false,
    });
  });

  it('应按 canonical rank 比较 canonical 与 legacy 模式', () => {
    expect(compareAutonomyModes('MANUAL_CONFIRM', 'RULE_BASED')).toBeLessThan(
      0,
    );
    expect(compareAutonomyModes('FIXED', 'RULE_BASED')).toBeLessThan(0);
    expect(compareAutonomyModes('FULL_AUTO', 'RULE_BASED')).toBeGreaterThan(0);
    expect(compareAutonomyModes('LLM_DECIDE', 'LLM_SUGGEST')).toBe(0);
  });

  it('应判断原始模式是否在 cap 之内', () => {
    expect(isAutonomyModeAllowed('RULE_BASED', 'RULE_BASED')).toBe(true);
    expect(isAutonomyModeAllowed('FIXED', 'RULE_BASED')).toBe(true);
    expect(isAutonomyModeAllowed('FULL_AUTO', 'RULE_BASED')).toBe(false);
  });

  it('应将超限 legacy 模式 clamp 到 cap', () => {
    expect(clampAutonomyModeToCap('FULL_AUTO', 'RULE_BASED')).toMatchObject({
      rawMode: 'FULL_AUTO',
      canonicalMode: 'LLM_SUGGEST',
      effectiveMode: 'RULE_BASED',
      replacementMode: 'RULE_BASED',
      exceedsCap: true,
      source: 'legacy',
    });
  });

  it('未超限时应保留 canonical 模式', () => {
    expect(
      clampAutonomyModeToCap('MANUAL_CONFIRM', 'RULE_BASED'),
    ).toMatchObject({
      rawMode: 'MANUAL_CONFIRM',
      canonicalMode: 'MANUAL_CONFIRM',
      effectiveMode: 'MANUAL_CONFIRM',
      replacementMode: 'MANUAL_CONFIRM',
      exceedsCap: false,
      source: 'canonical',
    });
  });

  it('应输出可解释的 violation 详情', () => {
    expect(explainAutonomyViolation('FULL_AUTO', 'RULE_BASED')).toMatchObject({
      rawMode: 'FULL_AUTO',
      canonicalMode: 'LLM_SUGGEST',
      cap: 'RULE_BASED',
      exceedsCap: true,
      replacementMode: 'RULE_BASED',
      source: 'legacy',
      reasonCode: 'mode_exceeds_cap',
    });
  });
});
