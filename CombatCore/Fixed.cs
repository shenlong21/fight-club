namespace CombatCore;

/// <summary>
/// Q16.16 fixed-point number. This exists for exactly one reason: float and double
/// arithmetic is NOT guaranteed to produce bit-identical results across different
/// CPUs, JIT versions, or between .NET (server) and a browser's WASM/JS runtime
/// (client). A single ULP of divergence in a position calculation compounds every
/// tick and eventually desyncs client prediction from server truth.
///
/// Every operation here is integer-only. int32 overflow/wraparound behavior is
/// identical in C# (checked/unchecked) and JavaScript (via `| 0` and friends), which
/// is what makes it possible to port this type to TypeScript with byte-for-byte
/// matching behavior - see client/src/sim/Fixed.ts, which is a deliberate mirror
/// of this file, not just "similar logic".
///
/// Range: with 16 fractional bits, integer range is roughly +/-32,768 with a
/// resolution of 1/65536 (~0.0000153). That is enormous headroom for a fighting
/// game arena measured in a handful of meters - we will never get near overflow
/// on position values, only potentially on intermediate multiplication, which is
/// why multiply/divide widen to long/int64 before shifting back down.
/// </summary>
public readonly struct Fixed : IEquatable<Fixed>, IComparable<Fixed>
{
    public const int FractionalBits = 16;
    public const int RawOne = 1 << FractionalBits;

    public readonly int Raw;

    private Fixed(int raw) => Raw = raw;

    public static readonly Fixed Zero = new(0);
    public static readonly Fixed One = new(RawOne);
    public static readonly Fixed Half = new(RawOne / 2);
    public static readonly Fixed MinusOne = new(-RawOne);

    public static Fixed FromRaw(int raw) => new(raw);
    public static Fixed FromInt(int value) => new(value << FractionalBits);

    /// <summary>
    /// ONLY for authoring move data / tests at design time (e.g. "this hitbox is
    /// 0.75 units wide"). Never call this inside the simulation tick itself -
    /// float-to-fixed conversion is a one-time, load-time operation, not a
    /// per-frame one, precisely so no float ever enters the hot path.
    /// </summary>
    public static Fixed FromFloat(float value) => new((int)MathF.Round(value * RawOne));

    public float ToFloat() => Raw / (float)RawOne;
    public int ToIntFloor() => Raw >> FractionalBits;

    public static Fixed operator +(Fixed a, Fixed b) => new(a.Raw + b.Raw);
    public static Fixed operator -(Fixed a, Fixed b) => new(a.Raw - b.Raw);
    public static Fixed operator -(Fixed a) => new(-a.Raw);

    public static Fixed operator *(Fixed a, Fixed b) =>
        new((int)(((long)a.Raw * b.Raw) >> FractionalBits));

    public static Fixed operator /(Fixed a, Fixed b) =>
        new((int)(((long)a.Raw << FractionalBits) / b.Raw));

    public static Fixed operator *(Fixed a, int scalar) => new(a.Raw * scalar);
    public static Fixed operator /(Fixed a, int scalar) => new(a.Raw / scalar);

    public static bool operator ==(Fixed a, Fixed b) => a.Raw == b.Raw;
    public static bool operator !=(Fixed a, Fixed b) => a.Raw != b.Raw;
    public static bool operator <(Fixed a, Fixed b) => a.Raw < b.Raw;
    public static bool operator >(Fixed a, Fixed b) => a.Raw > b.Raw;
    public static bool operator <=(Fixed a, Fixed b) => a.Raw <= b.Raw;
    public static bool operator >=(Fixed a, Fixed b) => a.Raw >= b.Raw;

    public static Fixed Abs(Fixed a) => a.Raw < 0 ? new Fixed(-a.Raw) : a;
    public static Fixed Min(Fixed a, Fixed b) => a.Raw < b.Raw ? a : b;
    public static Fixed Max(Fixed a, Fixed b) => a.Raw > b.Raw ? a : b;
    public static Fixed Clamp(Fixed v, Fixed lo, Fixed hi) => Max(lo, Min(hi, v));

    /// <summary>
    /// Deterministic integer square root (bit-by-bit / "digit-by-digit" method).
    /// Hardware sqrt instructions and Math.Sqrt are NOT guaranteed bit-identical
    /// across platforms, so anything gameplay-relevant that needs a magnitude
    /// (e.g. normalizing a movement vector) must go through this instead.
    /// Operates on the raw fixed value scaled up so the result keeps full
    /// fractional precision.
    /// </summary>
    public static Fixed Sqrt(Fixed value)
    {
        if (value.Raw <= 0) return Zero;

        // We want sqrt(value.Raw / RawOne) * RawOne = sqrt(value.Raw * RawOne)
        long operand = (long)value.Raw << FractionalBits;
        long result = 0;
        long bit = 1L << 62;

        while (bit > operand) bit >>= 2;

        while (bit != 0)
        {
            if (operand >= result + bit)
            {
                operand -= result + bit;
                result = (result >> 1) + bit;
            }
            else
            {
                result >>= 1;
            }
            bit >>= 2;
        }

        return new Fixed((int)result);
    }

    public bool Equals(Fixed other) => Raw == other.Raw;
    public override bool Equals(object? obj) => obj is Fixed f && Equals(f);
    public override int GetHashCode() => Raw;
    public int CompareTo(Fixed other) => Raw.CompareTo(other.Raw);
    public override string ToString() => ToFloat().ToString("F4");
}
