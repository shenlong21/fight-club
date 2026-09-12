namespace CombatCore;

/// <summary>
/// The entire game's rules, expressed as one pure function: (previous state,
/// both players' inputs) -> next state. No I/O, no randomness outside the
/// seeded Rng carried in MatchState, no static mutable fields, no
/// wall-clock time. Call Tick() twice with the same arguments and you WILL get
/// bit-identical output - that property is what the determinism harness in
/// CombatCore.Harness proves, and it's what allows the client to run this same
/// function speculatively, ahead of the server, and only rarely need correcting.
/// </summary>
public static class CombatSimulation
{
    public static readonly Fixed WalkSpeed = Fixed.FromFloat(0.06f);
    public static readonly Fixed ArenaHalfWidth = Fixed.FromFloat(6f);

    public static MatchState Tick(in MatchState previous, PlayerInput p1Input, PlayerInput p2Input)
    {
        MatchState next = previous;
        next.FrameNumber = previous.FrameNumber + 1;

        // Freeze both starting positions BEFORE stepping either player. This
        // guarantees P1's facing/movement this tick and P2's facing/movement
        // this tick are both computed against the same "start of tick"
        // snapshot of the other player - if we instead fed P2 the
        // already-updated next.Player1.Position, P2 would be reacting to
        // information P1 didn't have when P1 made its own decision this same
        // tick. Same-tick symmetry regardless of internal processing order is
        // a determinism-adjacent correctness property, not just tidiness.
        FixedVector3 p1StartPos = previous.Player1.Position;
        FixedVector3 p2StartPos = previous.Player2.Position;

        StepPlayer(ref next.Player1, p1Input, p2StartPos);
        StepPlayer(ref next.Player2, p2Input, p1StartPos);

        ResolveHits(ref next);

        if (next.Player1.IsKnockedOut || next.Player2.IsKnockedOut)
        {
            next.Phase = MatchPhase.RoundEnd;
        }

        return next;
    }

    private static void StepPlayer(ref PlayerState self, PlayerInput input, FixedVector3 opponentStartPos)
    {
        // Stun states pre-empt everything else and are governed purely by
        // their remaining-frame counters, not by MoveDefinition.TotalFrames.
        if (self.HitstunFramesRemaining > 0)
        {
            self.HitstunFramesRemaining--;
            self.MoveFrame = Math.Min(self.MoveFrame + 1, self.MoveDef.TotalFrames - 1);
            if (self.HitstunFramesRemaining == 0)
            {
                self.CurrentMove = MoveId.Idle;
                self.MoveFrame = 0;
            }
            UpdateFacing(ref self, opponentStartPos);
            return;
        }

        if (self.BlockstunFramesRemaining > 0)
        {
            self.BlockstunFramesRemaining--;
            self.MoveFrame = Math.Min(self.MoveFrame + 1, self.MoveDef.TotalFrames - 1);
            if (self.BlockstunFramesRemaining == 0)
            {
                self.CurrentMove = MoveId.Idle;
                self.MoveFrame = 0;
            }
            UpdateFacing(ref self, opponentStartPos);
            return;
        }

        if (self.IsKnockedOut)
        {
            self.CurrentMove = MoveId.KnockedOut;
            return;
        }

        // Committed, non-cancelable attack in progress?
        if (self.MoveDef.IsAttack)
        {
            if (self.MoveFrame < self.MoveDef.TotalFrames - 1)
            {
                self.MoveFrame++;
                UpdateFacing(ref self, opponentStartPos);
                return;
            }

            // This was the final recovery frame as of last tick - the attack
            // is over. Fall through into the free-to-act section below so the
            // player can act again on this very tick instead of losing an
            // extra frame to a "return to idle" no-op tick.
            self.CurrentMove = MoveId.Idle;
            self.MoveFrame = 0;
        }

        // Free to act: read this tick's input.
        self.IsHoldingBlock = input.Has(InputButtons.Block);

        if (input.Has(InputButtons.Block))
        {
            self.CurrentMove = MoveId.Block;
            self.MoveFrame = 0;
        }
        else if (input.Has(InputButtons.Kick))
        {
            // Kick is its own independent attack (MoveId.HeavyPunch's data -
            // damage/hitbox/knockback - happens to already be the "kick"
            // move by name; it predates Kick getting its own button and
            // hasn't been renamed to avoid unnecessary churn). Checked
            // before Punch so holding both resolves to Kick, not a
            // "Punch+Kick combo" - there is no such combo in this slice.
            //
            // A held direction picks a variant instead of the neutral kick -
            // MoveZ (up/down) takes priority over MoveX (side) if somehow
            // both are held, matching Punch's own priority order below.
            self.CurrentMove = input.MoveZ > 0 ? MoveId.UpKick
                : input.MoveZ < 0 ? MoveId.DownKick
                : input.MoveX != 0 ? MoveId.SideKick
                : MoveId.HeavyPunch;
            self.MoveFrame = 0;
            self.HasCurrentAttackConnected = false;
        }
        else if (input.Has(InputButtons.Punch))
        {
            self.CurrentMove = input.MoveZ > 0 ? MoveId.UpPunch
                : input.MoveZ < 0 ? MoveId.DownPunch
                : input.MoveX != 0 ? MoveId.SidePunch
                : MoveId.LightPunch;
            self.MoveFrame = 0;
            self.HasCurrentAttackConnected = false;
        }
        else if (input.MoveX != 0 || input.MoveZ != 0)
        {
            var delta = new FixedVector3(
                WalkSpeed * input.MoveX,
                Fixed.Zero,
                WalkSpeed * input.MoveZ);
            self.Position = ClampToArena(self.Position + delta);

            bool movingTowardOpponent = input.MoveX * self.FacingSign > 0;
            self.CurrentMove = movingTowardOpponent ? MoveId.WalkForward : MoveId.WalkBackward;
            self.MoveFrame = 0;
        }
        else
        {
            self.CurrentMove = MoveId.Idle;
            self.MoveFrame = 0;
        }

        // Hold-to-transform, no meter/cooldown gating in this slice. A real
        // implementation almost certainly wants a resource cost and probably
        // press-to-toggle (rising-edge detection against the previous frame's
        // input) rather than hold-to-hold - both are game-design decisions
        // layered on top of this same deterministic core, not determinism
        // concerns themselves, so they're deliberately left simple here.
        self.IsBeastForm = input.Has(InputButtons.BeastToggle);

        UpdateFacing(ref self, opponentStartPos);
    }

    private static void UpdateFacing(ref PlayerState self, FixedVector3 opponentStartPos)
    {
        Fixed dx = opponentStartPos.X - self.Position.X;
        if (dx.Raw > 0) self.FacingSign = 1;
        else if (dx.Raw < 0) self.FacingSign = -1;
        // dx == 0 (exact overlap): keep previous facing rather than flicker.
    }

    private static FixedVector3 ClampToArena(FixedVector3 pos) =>
        new(Fixed.Clamp(pos.X, -ArenaHalfWidth, ArenaHalfWidth), pos.Y, pos.Z);

    /// <summary>
    /// Both directions are evaluated against a frozen pre-resolution snapshot
    /// of BOTH players before either hit is applied. This is what makes a
    /// simultaneous "trade" (both hitboxes connect on the same frame) land as
    /// an actual trade, rather than having whichever direction happens to be
    /// processed first knock the other player out of the state their
    /// already-active hitbox needed to still be "count".
    /// </summary>
    private static void ResolveHits(ref MatchState state)
    {
        PlayerState p1Snapshot = state.Player1;
        PlayerState p2Snapshot = state.Player2;

        bool p1Hits = TryFindHit(p1Snapshot, p2Snapshot, out HitProperties p1HitProps);
        bool p2Hits = TryFindHit(p2Snapshot, p1Snapshot, out HitProperties p2HitProps);

        if (p1Hits) ApplyHit(ref state.Player1, ref state.Player2, p1HitProps);
        if (p2Hits) ApplyHit(ref state.Player2, ref state.Player1, p2HitProps);
    }

    private static bool TryFindHit(PlayerState attacker, PlayerState defender, out HitProperties hitProps)
    {
        hitProps = default;
        if (defender.IsKnockedOut) return false;
        if (attacker.HasCurrentAttackConnected) return false; // one hit per activation

        MoveDefinition attackerMove = attacker.MoveDef;
        if (!attackerMove.IsAttack) return false;

        foreach (FrameBox hitbox in attackerMove.Hitboxes)
        {
            if (!hitbox.IsActiveOnFrame(attacker.MoveFrame)) continue;
            FixedVector3 hitboxCenter = Collision.ResolveWorldCenter(attacker.Position, attacker.FacingSign, hitbox);

            foreach (FrameBox hurtbox in defender.MoveDef.Hurtboxes)
            {
                if (!hurtbox.IsActiveOnFrame(defender.MoveFrame)) continue;
                FixedVector3 hurtboxCenter = Collision.ResolveWorldCenter(defender.Position, defender.FacingSign, hurtbox);

                if (Collision.AabbOverlap(hitboxCenter, hitbox.HalfExtents, hurtboxCenter, hurtbox.HalfExtents))
                {
                    hitProps = attackerMove.HitProperties;
                    return true;
                }
            }
        }

        return false;
    }

    private static void ApplyHit(ref PlayerState attacker, ref PlayerState defender, HitProperties hitProps)
    {
        attacker.HasCurrentAttackConnected = true;
        int facing = attacker.FacingSign; // points from attacker toward defender

        if (defender.IsHoldingBlock)
        {
            defender.BlockstunFramesRemaining = hitProps.BlockstunFrames;
            defender.HitstunFramesRemaining = 0;
            defender.CurrentMove = MoveId.Blockstun;
            defender.MoveFrame = 0;

            FixedVector3 kb = hitProps.Knockback * Fixed.Half;
            defender.Position = ClampToArena(defender.Position + new FixedVector3(kb.X * facing, kb.Y, kb.Z));
            return;
        }

        int damageMultiplier = attacker.IsBeastForm ? 2 : 1;
        defender.Health = Math.Max(0, defender.Health - hitProps.Damage * damageMultiplier);
        defender.HitstunFramesRemaining = hitProps.HitstunFrames;
        defender.BlockstunFramesRemaining = 0;
        defender.CurrentMove = defender.Health <= 0 ? MoveId.KnockedOut : MoveId.Hitstun;
        defender.MoveFrame = 0;

        defender.Position = ClampToArena(defender.Position + new FixedVector3(
            hitProps.Knockback.X * facing, hitProps.Knockback.Y, hitProps.Knockback.Z));
    }
}