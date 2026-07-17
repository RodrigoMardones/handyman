/**
 * Fixed-decimal formatting with banker's (round-half-to-even) rounding,
 * matching CPython's `f"{x:.Nf}"`.
 *
 * CPython rounds the *true* IEEE-754 value of the double half-to-even at the
 * Nth decimal — it is float-repr driven, not pure-decimal. So `0.135` prints
 * `0.14` (its double is just above 0.135) while `2.675` prints `2.67` (just
 * below), and exactly representable halves like `0.125` and `2.5` round to the
 * nearest even digit.
 *
 * JS `Number.prototype.toFixed` is half-up and float-buggy, so we cannot use
 * it. Instead we decompose the double into its exact rational value
 * (`significand * 2^exponent`) with BigInt and round that exact value, which
 * reproduces CPython's result bit-for-bit.
 */

/** Decompose a finite double into `{ negative, significand, exponent }` where
 *  |value| = significand * 2^exponent, both BigInt / integer. */
function decompose(value: number): {
  negative: boolean;
  significand: bigint;
  exponent: number;
} {
  const buf = new ArrayBuffer(8);
  const dv = new DataView(buf);
  dv.setFloat64(0, value);
  const hi = dv.getUint32(0);
  const lo = dv.getUint32(4);

  const negative = hi >>> 31 === 1;
  const exponentBits = (hi >>> 20) & 0x7ff;
  const mantissa = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo >>> 0);

  if (exponentBits === 0) {
    // Subnormal (includes +/-0 when mantissa is 0).
    return { negative, significand: mantissa, exponent: -1074 };
  }
  // Normal: restore the implicit leading 1 bit.
  return {
    negative,
    significand: mantissa | (1n << 52n),
    exponent: exponentBits - 1075,
  };
}

/** Round a non-negative fraction num/den (den > 0) to the nearest integer,
 *  ties going to even. */
function roundHalfEven(num: bigint, den: bigint): bigint {
  const quotient = num / den;
  const remainder = num % den;
  const twice = remainder * 2n;
  if (twice < den) {
    return quotient;
  }
  if (twice > den) {
    return quotient + 1n;
  }
  // Exact half: round to even.
  return quotient % 2n === 0n ? quotient : quotient + 1n;
}

/**
 * Format `value` with exactly `decimals` fractional digits using banker's
 * rounding, matching CPython's `f"{value:.{decimals}f}"`.
 */
export function formatHalfEven(value: number, decimals: number): string {
  if (!Number.isFinite(value)) {
    throw new RangeError(`formatHalfEven: value must be finite, got ${value}`);
  }
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new RangeError(
      `formatHalfEven: decimals must be a non-negative integer, got ${decimals}`,
    );
  }

  const { negative, significand, exponent } = decompose(value);

  // |value| * 10^decimals = significand * 2^exponent * 10^decimals.
  const scale = 10n ** BigInt(decimals);
  let rounded: bigint;
  if (exponent >= 0) {
    // Exact integer, no rounding needed.
    rounded = significand * (1n << BigInt(exponent)) * scale;
  } else {
    const num = significand * scale;
    const den = 1n << BigInt(-exponent);
    rounded = roundHalfEven(num, den);
  }

  const digits = rounded.toString();
  let body: string;
  if (decimals === 0) {
    body = digits;
  } else {
    const padded = digits.padStart(decimals + 1, "0");
    const cut = padded.length - decimals;
    body = `${padded.slice(0, cut)}.${padded.slice(cut)}`;
  }

  // Preserve the sign bit even when the magnitude rounds to zero (CPython
  // prints "-0.00" for a negative operand).
  return negative ? `-${body}` : body;
}
