const FIXED_SCALE = 8;
const FIXED_SCALE_FACTOR = 10n ** BigInt(FIXED_SCALE);

const SIGNED_FIXED_SCALE_DECIMAL_REGEX = /^-?\d+(\.\d{1,8})?$/;
export const NON_NEGATIVE_FIXED_SCALE_DECIMAL_REGEX = /^\d+(\.\d{1,8})?$/;

export type FixedScaleDecimalInput =
  | FixedScaleDecimal
  | bigint
  | number
  | string
  | null
  | undefined;

function normalizeDecimalInput(
  value: Exclude<FixedScaleDecimalInput, FixedScaleDecimal>,
): string {
  if (value === null || value === undefined) {
    return '0';
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('定点小数不支持非有限数字');
    }

    return Number.isInteger(value) ? String(value) : value.toFixed(FIXED_SCALE);
  }

  return value.trim();
}

function parseScaledValue(
  value: Exclude<FixedScaleDecimalInput, FixedScaleDecimal>,
): bigint {
  const normalized = normalizeDecimalInput(value);

  if (!SIGNED_FIXED_SCALE_DECIMAL_REGEX.test(normalized)) {
    throw new Error(`非法定点小数: ${normalized}`);
  }

  const isNegative = normalized.startsWith('-');
  const unsignedValue = isNegative ? normalized.slice(1) : normalized;
  const [integerPart, fractionPart = ''] = unsignedValue.split('.');
  const paddedFraction = fractionPart.padEnd(FIXED_SCALE, '0');
  const scaledValue =
    BigInt(integerPart) * FIXED_SCALE_FACTOR + BigInt(paddedFraction || '0');

  return isNegative ? -scaledValue : scaledValue;
}

function roundDivision(numerator: bigint, denominator: bigint): bigint {
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  const absoluteRemainder = remainder < 0n ? -remainder : remainder;

  if (absoluteRemainder * 2n < denominator) {
    return quotient;
  }

  return quotient + (numerator >= 0n ? 1n : -1n);
}

export class FixedScaleDecimal {
  private constructor(private readonly scaledValue: bigint) {}

  static zero(): FixedScaleDecimal {
    return new FixedScaleDecimal(0n);
  }

  static from(value: FixedScaleDecimalInput): FixedScaleDecimal {
    if (value instanceof FixedScaleDecimal) {
      return value;
    }

    return new FixedScaleDecimal(parseScaledValue(value));
  }

  add(value: FixedScaleDecimalInput): FixedScaleDecimal {
    const other = FixedScaleDecimal.from(value);
    return new FixedScaleDecimal(this.scaledValue + other.scaledValue);
  }

  subtract(value: FixedScaleDecimalInput): FixedScaleDecimal {
    const other = FixedScaleDecimal.from(value);
    return new FixedScaleDecimal(this.scaledValue - other.scaledValue);
  }

  multiply(value: FixedScaleDecimalInput): FixedScaleDecimal {
    const other = FixedScaleDecimal.from(value);
    return new FixedScaleDecimal(
      roundDivision(this.scaledValue * other.scaledValue, FIXED_SCALE_FACTOR),
    );
  }

  multiplyInteger(value: number | bigint): FixedScaleDecimal {
    const multiplier =
      typeof value === 'bigint' ? value : BigInt(Math.trunc(value));
    return new FixedScaleDecimal(this.scaledValue * multiplier);
  }

  isZero(): boolean {
    return this.scaledValue === 0n;
  }

  toString(): string {
    const isNegative = this.scaledValue < 0n;
    const absoluteValue = isNegative ? -this.scaledValue : this.scaledValue;
    const integerPart = absoluteValue / FIXED_SCALE_FACTOR;
    const fractionPart = (absoluteValue % FIXED_SCALE_FACTOR)
      .toString()
      .padStart(FIXED_SCALE, '0');

    return `${isNegative ? '-' : ''}${integerPart.toString()}.${fractionPart}`;
  }

  toJSON(): string {
    return this.toString();
  }
}

export function normalizeFixedScaleDecimal(
  value: FixedScaleDecimalInput,
): string {
  return FixedScaleDecimal.from(value).toString();
}
