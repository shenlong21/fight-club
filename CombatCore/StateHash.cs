namespace CombatCore;

/// <summary>
/// FNV-1a, 32-bit. Chosen (over, say, a cryptographic hash) because it's about
/// six lines of pure integer multiply/xor - trivial to port to TypeScript with
/// byte-identical results, which is the entire point: this hash is the contract
/// between the C# sim and any other-language port of it (see
/// client/src/sim/StateHash.ts). If both sides hash the same encoded MatchState
/// bytes and get different numbers, something in the two implementations has
/// drifted - that is a bug to fix immediately, not a rare edge case to shrug off.
/// </summary>
public static class StateHash
{
    private const uint FnvOffsetBasis = 2166136261;
    private const uint FnvPrime = 16777619;

    public static uint Compute(in MatchState state)
    {
        Span<byte> buffer = stackalloc byte[NetCodec.WireSize];
        NetCodec.Encode(in state, buffer);
        return ComputeOverBytes(buffer);
    }

    public static uint ComputeOverBytes(ReadOnlySpan<byte> bytes)
    {
        uint hash = FnvOffsetBasis;
        foreach (byte b in bytes)
        {
            hash ^= b;
            hash *= FnvPrime;
        }
        return hash;
    }
}
