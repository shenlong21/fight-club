namespace CombatCore;

/// <summary>
/// Everything about one player that participates in the simulation. Deliberately
/// a struct: MatchState (which holds two of these) needs to be cheaply copyable
/// so the rollback controller can keep a ring buffer of past snapshots without
/// allocating per-frame.
/// </summary>
public struct PlayerState
{
    public FixedVector3 Position;
    public int FacingSign;          // +1 = facing +X, -1 = facing -X
    public int Health;
    public int MaxHealth;

    public MoveId CurrentMove;
    public int MoveFrame;           // frames elapsed since CurrentMove started (0-based)

    public int HitstunFramesRemaining;
    public int BlockstunFramesRemaining;

    public bool IsHoldingBlock;
    public bool IsBeastForm;

    // Prevents a single multi-frame active hitbox window (e.g. HeavyPunch's
    // 4-frame active window) from registering as 4 separate hits against the
    // same activation. Reset to false whenever a new attack move starts.
    public bool HasCurrentAttackConnected;

    public static PlayerState CreateDefault(FixedVector3 startPosition, int facingSign, int maxHealth = 100)
    {
        return new PlayerState
        {
            Position = startPosition,
            FacingSign = facingSign,
            Health = maxHealth,
            MaxHealth = maxHealth,
            CurrentMove = MoveId.Idle,
            MoveFrame = 0,
            HitstunFramesRemaining = 0,
            BlockstunFramesRemaining = 0,
            IsHoldingBlock = false,
            IsBeastForm = false,
        };
    }

    public readonly bool IsKnockedOut => Health <= 0;
    public readonly bool IsInHitstun => HitstunFramesRemaining > 0;
    public readonly bool IsInBlockstun => BlockstunFramesRemaining > 0;
    public readonly bool CanAct => !IsInHitstun && !IsInBlockstun && !IsKnockedOut;

    public readonly MoveDefinition MoveDef => MoveTable.Moves[CurrentMove];
}