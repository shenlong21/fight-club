namespace CombatCore;

/// <summary>
/// xorshift32. Chosen over System.Random specifically because System.Random's
/// algorithm is a .NET implementation detail that has changed between major
/// versions (notably around .NET Core 2.0/3.0) and is not guaranteed to match a
/// hand-rolled JS port. xorshift32 is ~6 lines of pure integer bit-ops, which
/// makes cross-language parity trivial to guarantee and easy to eyeball-verify.
///
/// The state (a single uint) lives inside MatchState and is snapshotted/restored
/// along with everything else during rollback - a "random" hit spark variant or
/// critical-hit roll must replay identically when the client re-simulates frames.
/// </summary>
public struct DeterministicRandom
{
    public uint State;

    public DeterministicRandom(uint seed)
    {
        State = seed == 0 ? 0x9E3779B9u : seed; // avoid the degenerate all-zero state
    }

    public uint NextUInt()
    {
        uint x = State;
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        State = x;
        return x;
    }

    /// <summary>Returns a value in [minInclusive, maxExclusive).</summary>
    public int NextRange(int minInclusive, int maxExclusive)
    {
        uint span = (uint)(maxExclusive - minInclusive);
        return minInclusive + (int)(NextUInt() % span);
    }
}
