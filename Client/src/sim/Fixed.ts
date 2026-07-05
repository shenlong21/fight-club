/**
 * Deliberate mirror of CombatCore/Fixed.cs. Every operation here must produce
 * the exact same `raw` int32 result as its C# counterpart given the same
 * inputs - that is the entire contract this file exists to satisfy, verified
 * by src/parity.test.ts against golden replays recorded from the real C# sim.
 *
 * Two things make this trickier than a typical TS port:
 *   1. JS's native `<<`/`>>`/`|` bitwise operators coerce to *32-bit* ints,
 *      which is actually what we want for the final result, but C#'s
 *      multiply/divide/sqrt widen to 64-bit `long` for the INTERMEDIATE
 *      calculation before truncating back down - plain JS `number` can't
 *      hold a 64-bit integer exactly past 2^53, so those three operations use
 *      BigInt for the intermediate math and truncate to int32 only at the end
 *      (via BigInt.asIntN(32, ...), which matches C#'s `(int)` cast on a long).
 *   2. Plain `+`/`-` on two in-range int32 values won't overflow in JS the
 *      way unchecked C# `int` arithmetic silently wraps around, so `| 0` is
 *      applied to force the same 32-bit wraparound behavior even though it
 *      should never matter at gameplay-realistic position values.
 */
export class Fixed {
  static readonly FRACTIONAL_BITS = 16;
  static readonly RAW_ONE = 1 << 16;

  readonly raw: number;

  private constructor(raw: number) {
    this.raw = raw | 0;
  }

  static fromRaw(raw: number): Fixed {
    return new Fixed(raw);
  }

  static fromInt(value: number): Fixed {
    return new Fixed(value << Fixed.FRACTIONAL_BITS);
  }

  /** Design-time / test-authoring only - never call this inside the sim tick. */
  static fromFloat(value: number): Fixed {
    return new Fixed(Math.round(value * Fixed.RAW_ONE));
  }

  toFloat(): number {
    return this.raw / Fixed.RAW_ONE;
  }

  static readonly ZERO = Fixed.fromRaw(0);
  static readonly ONE = Fixed.fromRaw(Fixed.RAW_ONE);
  static readonly HALF = Fixed.fromRaw(Fixed.RAW_ONE / 2);

  static add(a: Fixed, b: Fixed): Fixed {
    return new Fixed((a.raw + b.raw) | 0);
  }

  static sub(a: Fixed, b: Fixed): Fixed {
    return new Fixed((a.raw - b.raw) | 0);
  }

  static neg(a: Fixed): Fixed {
    return new Fixed((-a.raw) | 0);
  }

  static mul(a: Fixed, b: Fixed): Fixed {
    const product = (BigInt(a.raw) * BigInt(b.raw)) >> BigInt(Fixed.FRACTIONAL_BITS);
    return new Fixed(Number(BigInt.asIntN(32, product)));
  }

  static div(a: Fixed, b: Fixed): Fixed {
    const numerator = BigInt(a.raw) << BigInt(Fixed.FRACTIONAL_BITS);
    const quotient = numerator / BigInt(b.raw); // BigInt division truncates toward zero, matching C# long division
    return new Fixed(Number(BigInt.asIntN(32, quotient)));
  }

  static mulInt(a: Fixed, scalar: number): Fixed {
    return new Fixed(Math.imul(a.raw, scalar));
  }

  static abs(a: Fixed): Fixed {
    return a.raw < 0 ? new Fixed((-a.raw) | 0) : a;
  }

  static min(a: Fixed, b: Fixed): Fixed {
    return a.raw < b.raw ? a : b;
  }

  static max(a: Fixed, b: Fixed): Fixed {
    return a.raw > b.raw ? a : b;
  }

  static clamp(v: Fixed, lo: Fixed, hi: Fixed): Fixed {
    return Fixed.max(lo, Fixed.min(hi, v));
  }

  /** Deterministic bit-by-bit integer sqrt - see Fixed.cs for the matching C# version. */
  static sqrt(value: Fixed): Fixed {
    if (value.raw <= 0) return Fixed.ZERO;

    let operand = BigInt(value.raw) << BigInt(Fixed.FRACTIONAL_BITS);
    let result = 0n;
    let bit = 1n << 62n;

    while (bit > operand) bit >>= 2n;

    while (bit !== 0n) {
      if (operand >= result + bit) {
        operand -= result + bit;
        result = (result >> 1n) + bit;
      } else {
        result >>= 1n;
      }
      bit >>= 2n;
    }

    return new Fixed(Number(BigInt.asIntN(32, result)));
  }

  equals(other: Fixed): boolean {
    return this.raw === other.raw;
  }

  compare(other: Fixed): number {
    return this.raw - other.raw;
  }

  toString(): string {
    return this.toFloat().toFixed(4);
  }
}
