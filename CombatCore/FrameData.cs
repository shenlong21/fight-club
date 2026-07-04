namespace CombatCore;

public enum MoveId : byte
{
    Idle = 0,
    WalkForward = 1,
    WalkBackward = 2,
    LightPunch = 3,
    HeavyPunch = 4,
    Block = 5,
    Hitstun = 6,
    Blockstun = 7,
    KnockedOut = 8,
}

/// <summary>
/// One axis-aligned box, active for an inclusive range of frames relative to the
/// start of the move. Authored offline by a designer, loaded once, never mutated
/// at runtime. Both hitboxes (things that deal damage) and hurtboxes (things
/// that can be hit) use this same shape.
/// </summary>
public readonly struct FrameBox
{
    public readonly int StartFrame;
    public readonly int EndFrame;
    public readonly FixedVector3 LocalOffset;   // relative to player origin, in the player's own facing space
    public readonly FixedVector3 HalfExtents;

    public FrameBox(int startFrame, int endFrame, FixedVector3 localOffset, FixedVector3 halfExtents)
    {
        StartFrame = startFrame;
        EndFrame = endFrame;
        LocalOffset = localOffset;
        HalfExtents = halfExtents;
    }

    public bool IsActiveOnFrame(int moveFrame) => moveFrame >= StartFrame && moveFrame <= EndFrame;
}

public readonly struct HitProperties
{
    public readonly int Damage;
    public readonly int HitstunFrames;
    public readonly int BlockstunFrames;
    public readonly FixedVector3 Knockback;

    public HitProperties(int damage, int hitstunFrames, int blockstunFrames, FixedVector3 knockback)
    {
        Damage = damage;
        HitstunFrames = hitstunFrames;
        BlockstunFrames = blockstunFrames;
        Knockback = knockback;
    }
}

/// <summary>
/// A complete move: how many frames it takes, which frames are actionable
/// (cancelable), and the hitboxes/hurtboxes active across its timeline. This is
/// the data structure that makes hit resolution a pure lookup instead of a
/// physics query - "did frame 7 of HeavyPunch connect" is answered by reading
/// this table, identically on client and server.
/// </summary>
public sealed class MoveDefinition
{
    public required MoveId Id { get; init; }
    public required int TotalFrames { get; init; }
    public required bool IsCancelableByMovement { get; init; }
    public FrameBox[] Hitboxes { get; init; } = Array.Empty<FrameBox>();
    public FrameBox[] Hurtboxes { get; init; } = Array.Empty<FrameBox>();
    public HitProperties HitProperties { get; init; }
    public bool IsAttack { get; init; }
    public bool IsInvulnerableToThrows { get; init; }
}
