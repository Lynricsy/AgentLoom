import {
  DEFAULT_AUTONOMY_CONFIG,
  type AutonomyMode,
} from './dto/autonomy.dto';

export const CANONICAL_AUTONOMY_MODE_ORDER = [
  'MANUAL_CONFIRM',
  'RULE_BASED',
  'LLM_SUGGEST',
] as const satisfies readonly AutonomyMode[];

export const LEGACY_AUTONOMY_MODE_ORDER = [
  'FIXED',
  'LLM_DECIDE',
  'FULL_AUTO',
] as const;

export type LegacyAutonomyMode = (typeof LEGACY_AUTONOMY_MODE_ORDER)[number];
export type AutonomyModeSource = 'canonical' | 'legacy' | 'missing' | 'unknown';
export type AutonomyViolationReasonCode = 'mode_allowed' | 'mode_exceeds_cap';

export interface NormalizedAutonomyMode {
  rawMode: string | null;
  canonicalMode: AutonomyMode;
  source: AutonomyModeSource;
  requiresMigration: boolean;
}

export interface ClampedAutonomyMode extends NormalizedAutonomyMode {
  cap: AutonomyMode;
  effectiveMode: AutonomyMode;
  replacementMode: AutonomyMode;
  exceedsCap: boolean;
}

export interface AutonomyViolationExplanation extends ClampedAutonomyMode {
  reasonCode: AutonomyViolationReasonCode;
  message: string;
}

const LEGACY_TO_CANONICAL_MODE_MAP: Record<LegacyAutonomyMode, AutonomyMode> = {
  FIXED: 'MANUAL_CONFIRM',
  LLM_DECIDE: 'LLM_SUGGEST',
  FULL_AUTO: 'LLM_SUGGEST',
};

const AUTONOMY_MODE_RANK = new Map<AutonomyMode, number>(
  CANONICAL_AUTONOMY_MODE_ORDER.map((mode, index) => [mode, index]),
);

export function isCanonicalAutonomyMode(
  mode: unknown,
): mode is (typeof CANONICAL_AUTONOMY_MODE_ORDER)[number] {
  return (
    typeof mode === 'string' &&
    CANONICAL_AUTONOMY_MODE_ORDER.includes(
      mode as (typeof CANONICAL_AUTONOMY_MODE_ORDER)[number],
    )
  );
}

export function isLegacyAutonomyMode(mode: unknown): mode is LegacyAutonomyMode {
  return (
    typeof mode === 'string' &&
    LEGACY_AUTONOMY_MODE_ORDER.includes(mode as LegacyAutonomyMode)
  );
}

export function normalizeAutonomyMode(mode: unknown): NormalizedAutonomyMode {
  if (mode === undefined || mode === null) {
    return {
      rawMode: null,
      canonicalMode: DEFAULT_AUTONOMY_CONFIG.mode,
      source: 'missing',
      requiresMigration: false,
    };
  }

  if (isCanonicalAutonomyMode(mode)) {
    return {
      rawMode: mode,
      canonicalMode: mode,
      source: 'canonical',
      requiresMigration: false,
    };
  }

  if (isLegacyAutonomyMode(mode)) {
    return {
      rawMode: mode,
      canonicalMode: LEGACY_TO_CANONICAL_MODE_MAP[mode],
      source: 'legacy',
      requiresMigration: true,
    };
  }

  return {
    rawMode: typeof mode === 'string' ? mode : String(mode),
    canonicalMode: DEFAULT_AUTONOMY_CONFIG.mode,
    source: 'unknown',
    requiresMigration: false,
  };
}

export function compareAutonomyModes(left: unknown, right: unknown): number {
  const leftRank = AUTONOMY_MODE_RANK.get(normalizeAutonomyMode(left).canonicalMode);
  const rightRank = AUTONOMY_MODE_RANK.get(
    normalizeAutonomyMode(right).canonicalMode,
  );

  return (leftRank ?? 0) - (rightRank ?? 0);
}

export function isAutonomyModeAllowed(mode: unknown, cap: unknown): boolean {
  return compareAutonomyModes(mode, cap) <= 0;
}

export function clampAutonomyModeToCap(
  mode: unknown,
  cap: unknown,
): ClampedAutonomyMode {
  const normalizedMode = normalizeAutonomyMode(mode);
  const normalizedCap = normalizeAutonomyMode(cap);
  const exceedsCap = compareAutonomyModes(
    normalizedMode.canonicalMode,
    normalizedCap.canonicalMode,
  ) > 0;

  return {
    ...normalizedMode,
    cap: normalizedCap.canonicalMode,
    effectiveMode: exceedsCap
      ? normalizedCap.canonicalMode
      : normalizedMode.canonicalMode,
    replacementMode: exceedsCap
      ? normalizedCap.canonicalMode
      : normalizedMode.canonicalMode,
    exceedsCap,
  };
}

export function explainAutonomyViolation(
  mode: unknown,
  cap: unknown,
): AutonomyViolationExplanation {
  const clamped = clampAutonomyModeToCap(mode, cap);

  return {
    ...clamped,
    reasonCode: clamped.exceedsCap ? 'mode_exceeds_cap' : 'mode_allowed',
    message: clamped.exceedsCap
      ? `自治模式 ${clamped.canonicalMode} 超出组织上限 ${clamped.cap}，应降级为 ${clamped.replacementMode}`
      : `自治模式 ${clamped.canonicalMode} 未超出组织上限 ${clamped.cap}`,
  };
}
