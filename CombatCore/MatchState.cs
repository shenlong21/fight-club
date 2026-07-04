namespace CombatCore;

public enum MatchPhase : byte
{
    Fighting = 0,
    RoundEnd = 1,
}

/// <summary>
/// The complete, authoritative snapshot of one instant of the match. This is
/// the type that:
///   - the server treats as ground truth and broadcasts (compressed - see NetCodec)
///   - the client predicts locally, ahead of server confirmation
///   - the rollback controller snapshots every frame so it can rewind and replay
///   - StateHash.Compute() fingerprints for desync detection
///
/// It is a struct containing only structs (PlayerState is itself a struct), so
/// copying a MatchState is a flat memory copy with no heap allocation and no
/// aliasing surprises - important for a rollback buffer that might keep 10+
/// seconds of history.
/// </summary>
public struct MatchState
{
    public uint FrameNumber;
    public MatchPhase Phase;
    public PlayerState Player1;
    public PlayerState Player2;
    public DeterministicRandom Rng;

    public static MatchState CreateInitial(uint rngSeed)
    {
        return new MatchState
        {
            FrameNumber = 0,
            Phase = MatchPhase.Fighting,
            Player1 = PlayerState.CreateDefault(FixedVector3.FromFloats(-1.5f, 0f, 0f), facingSign: 1),
            Player2 = PlayerState.CreateDefault(FixedVector3.FromFloats(1.5f, 0f, 0f), facingSign: -1),
            Rng = new DeterministicRandom(rngSeed),
        };
    }
}
