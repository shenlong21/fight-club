namespace CombatCore;

/// <summary>
/// Loaded once at process start (server) or module init (client WASM), then
/// treated as immutable, read-only data for the lifetime of the process. This
/// is intentionally a small vertical slice - two attacks, not thirty - because
/// the point of this table is to prove the frame-data-driven hit resolution
/// pipeline end to end. Adding more moves later is purely additive data entry,
/// it does not change CombatSimulation.cs.
/// </summary>
public static class MoveTable
{
    // Standing hurtbox shared by most non-attacking states: a ~1.8-unit-tall,
    // 0.7-unit-wide box, feet at the player's local origin (Y=0).
    private static readonly FixedVector3 StandingHurtboxOffset =
        FixedVector3.FromFloats(0f, 0.9f, 0f);
    private static readonly FixedVector3 StandingHurtboxHalfExtents =
        FixedVector3.FromFloats(0.35f, 0.9f, 0.35f);

    private static FrameBox StandingHurtbox(int endFrame) =>
        new(0, endFrame, StandingHurtboxOffset, StandingHurtboxHalfExtents);

    public static readonly IReadOnlyDictionary<MoveId, MoveDefinition> Moves = Build();

    private static Dictionary<MoveId, MoveDefinition> Build()
    {
        var table = new Dictionary<MoveId, MoveDefinition>();

        table[MoveId.Idle] = new MoveDefinition
        {
            Id = MoveId.Idle,
            TotalFrames = 1,
            IsCancelableByMovement = true,
            Hurtboxes = new[] { StandingHurtbox(0) },
        };

        table[MoveId.WalkForward] = new MoveDefinition
        {
            Id = MoveId.WalkForward,
            TotalFrames = 1,
            IsCancelableByMovement = true,
            Hurtboxes = new[] { StandingHurtbox(0) },
        };

        table[MoveId.WalkBackward] = new MoveDefinition
        {
            Id = MoveId.WalkBackward,
            TotalFrames = 1,
            IsCancelableByMovement = true,
            Hurtboxes = new[] { StandingHurtbox(0) },
        };

        // Startup 0-2 (3f), active 3-4 (2f), recovery 5-11 (7f) = 12f total.
        table[MoveId.LightPunch] = new MoveDefinition
        {
            Id = MoveId.LightPunch,
            TotalFrames = 12,
            IsCancelableByMovement = false,
            IsAttack = true,
            Hurtboxes = new[] { StandingHurtbox(11) },
            Hitboxes = new[]
            {
                new FrameBox(3, 4,
                    FixedVector3.FromFloats(0.55f, 1.1f, 0f),
                    FixedVector3.FromFloats(0.30f, 0.20f, 0.20f)),
            },
            HitProperties = new HitProperties(
                damage: 6,
                hitstunFrames: 12,
                blockstunFrames: 6,
                knockback: FixedVector3.FromFloats(1.5f, 0f, 0f)),
        };

        // Startup 0-9 (10f), active 10-13 (4f), recovery 14-23 (10f) = 24f total.
        table[MoveId.HeavyPunch] = new MoveDefinition
        {
            Id = MoveId.HeavyPunch,
            TotalFrames = 24,
            IsCancelableByMovement = false,
            IsAttack = true,
            Hurtboxes = new[] { StandingHurtbox(23) },
            Hitboxes = new[]
            {
                new FrameBox(10, 13,
                    FixedVector3.FromFloats(0.85f, 1.1f, 0f),
                    FixedVector3.FromFloats(0.35f, 0.25f, 0.25f)),
            },
            HitProperties = new HitProperties(
                damage: 18,
                hitstunFrames: 24,
                blockstunFrames: 14,
                knockback: FixedVector3.FromFloats(4.0f, 0f, 0f)),
        };

        table[MoveId.Block] = new MoveDefinition
        {
            Id = MoveId.Block,
            TotalFrames = 1,
            IsCancelableByMovement = true,
            Hurtboxes = new[] { StandingHurtbox(0) },
        };

        // Hitstun/Blockstun duration is driven dynamically by the incoming hit's
        // HitProperties (see PlayerState.HitstunFramesRemaining), not by
        // TotalFrames here - this large value just guarantees the frame-based
        // move-finished check never fires the "moved on because frames ran out"
        // path for these two states.
        table[MoveId.Hitstun] = new MoveDefinition
        {
            Id = MoveId.Hitstun,
            TotalFrames = 999,
            IsCancelableByMovement = false,
            Hurtboxes = new[] { StandingHurtbox(998) },
        };

        table[MoveId.Blockstun] = new MoveDefinition
        {
            Id = MoveId.Blockstun,
            TotalFrames = 999,
            IsCancelableByMovement = false,
            Hurtboxes = new[] { StandingHurtbox(998) },
        };

        table[MoveId.KnockedOut] = new MoveDefinition
        {
            Id = MoveId.KnockedOut,
            TotalFrames = 999,
            IsCancelableByMovement = false,
            Hurtboxes = Array.Empty<FrameBox>(),
        };

        return table;
    }
}
