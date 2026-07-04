namespace CombatCore;

public readonly struct FixedVector3 : IEquatable<FixedVector3>
{
    public readonly Fixed X, Y, Z;

    public FixedVector3(Fixed x, Fixed y, Fixed z)
    {
        X = x; Y = y; Z = z;
    }

    public static readonly FixedVector3 Zero = new(Fixed.Zero, Fixed.Zero, Fixed.Zero);

    public static FixedVector3 FromFloats(float x, float y, float z) =>
        new(Fixed.FromFloat(x), Fixed.FromFloat(y), Fixed.FromFloat(z));

    public static FixedVector3 operator +(FixedVector3 a, FixedVector3 b) =>
        new(a.X + b.X, a.Y + b.Y, a.Z + b.Z);

    public static FixedVector3 operator -(FixedVector3 a, FixedVector3 b) =>
        new(a.X - b.X, a.Y - b.Y, a.Z - b.Z);

    public static FixedVector3 operator -(FixedVector3 a) => new(-a.X, -a.Y, -a.Z);

    public static FixedVector3 operator *(FixedVector3 a, Fixed s) =>
        new(a.X * s, a.Y * s, a.Z * s);

    public static FixedVector3 operator *(FixedVector3 a, int s) =>
        new(a.X * s, a.Y * s, a.Z * s);

    public Fixed LengthSquared() => X * X + Y * Y + Z * Z;

    public Fixed Length() => Fixed.Sqrt(LengthSquared());

    public bool Equals(FixedVector3 other) => X == other.X && Y == other.Y && Z == other.Z;
    public override bool Equals(object? obj) => obj is FixedVector3 v && Equals(v);
    public override int GetHashCode() => HashCode.Combine(X, Y, Z);
    public override string ToString() => $"({X}, {Y}, {Z})";
}
