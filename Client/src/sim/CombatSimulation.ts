import { Fixed } from "./Fixed.ts";
import { FixedVector3 } from "./FixedVector3.ts";
import { MatchPhase, cloneMatchState } from "./MatchState.ts";
import type { MatchState } from "./MatchState.ts";
import { isKnockedOut, moveDef } from "./PlayerState.ts";
import type { PlayerState } from "./PlayerState.ts";
import { PlayerInput, InputButtons } from "./Input.ts";
import { MoveId } from "./FrameData.ts";
import type { HitProperties } from "./FrameData.ts";
import { aabbOverlap, resolveWorldCenter } from "./Collision.ts";

export const WALK_SPEED = Fixed.fromFloat(0.06);
export const ARENA_HALF_WIDTH = Fixed.fromFloat(6);

export function tick(previous: MatchState, p1Input: PlayerInput, p2Input: PlayerInput): MatchState {
  const next = cloneMatchState(previous);
  next.frameNumber = previous.frameNumber + 1;

  // Freeze both starting positions before stepping either player - see the
  // matching comment in CombatSimulation.cs for why this matters.
  const p1StartPos = previous.player1.position;
  const p2StartPos = previous.player2.position;

  stepPlayer(next.player1, p1Input, p2StartPos);
  stepPlayer(next.player2, p2Input, p1StartPos);

  resolveHits(next);

  if (isKnockedOut(next.player1) || isKnockedOut(next.player2)) {
    next.phase = MatchPhase.RoundEnd;
  }

  return next;
}

function stepPlayer(self: PlayerState, input: PlayerInput, opponentStartPos: FixedVector3): void {
  if (self.hitstunFramesRemaining > 0) {
    self.hitstunFramesRemaining--;
    self.moveFrame = Math.min(self.moveFrame + 1, moveDef(self).totalFrames - 1);
    if (self.hitstunFramesRemaining === 0) {
      self.currentMove = MoveId.Idle;
      self.moveFrame = 0;
    }
    updateFacing(self, opponentStartPos);
    return;
  }

  if (self.blockstunFramesRemaining > 0) {
    self.blockstunFramesRemaining--;
    self.moveFrame = Math.min(self.moveFrame + 1, moveDef(self).totalFrames - 1);
    if (self.blockstunFramesRemaining === 0) {
      self.currentMove = MoveId.Idle;
      self.moveFrame = 0;
    }
    updateFacing(self, opponentStartPos);
    return;
  }

  if (isKnockedOut(self)) {
    self.currentMove = MoveId.KnockedOut;
    return;
  }

  const currentDef = moveDef(self);
  if (currentDef.isAttack) {
    if (self.moveFrame < currentDef.totalFrames - 1) {
      self.moveFrame++;
      updateFacing(self, opponentStartPos);
      return;
    }
    self.currentMove = MoveId.Idle;
    self.moveFrame = 0;
  }

  self.isHoldingBlock = input.has(InputButtons.Block);

  if (input.has(InputButtons.Block)) {
    self.currentMove = MoveId.Block;
    self.moveFrame = 0;
  } else if (input.has(InputButtons.Punch)) {
    const heavy = input.has(InputButtons.Kick);
    self.currentMove = heavy ? MoveId.HeavyPunch : MoveId.LightPunch;
    self.moveFrame = 0;
    self.hasCurrentAttackConnected = false;
  } else if (input.moveX !== 0 || input.moveZ !== 0) {
    const delta = new FixedVector3(
      Fixed.mulInt(WALK_SPEED, input.moveX),
      Fixed.ZERO,
      Fixed.mulInt(WALK_SPEED, input.moveZ),
    );
    self.position = clampToArena(FixedVector3.add(self.position, delta));

    const movingTowardOpponent = input.moveX * self.facingSign > 0;
    self.currentMove = movingTowardOpponent ? MoveId.WalkForward : MoveId.WalkBackward;
    self.moveFrame = 0;
  } else {
    self.currentMove = MoveId.Idle;
    self.moveFrame = 0;
  }

  self.isBeastForm = input.has(InputButtons.BeastToggle);

  updateFacing(self, opponentStartPos);
}

function updateFacing(self: PlayerState, opponentStartPos: FixedVector3): void {
  const dx = Fixed.sub(opponentStartPos.x, self.position.x);
  if (dx.raw > 0) self.facingSign = 1;
  else if (dx.raw < 0) self.facingSign = -1;
}

function clampToArena(pos: FixedVector3): FixedVector3 {
  return new FixedVector3(Fixed.clamp(pos.x, Fixed.neg(ARENA_HALF_WIDTH), ARENA_HALF_WIDTH), pos.y, pos.z);
}

function resolveHits(state: MatchState): void {
  const p1Snapshot = { ...state.player1 };
  const p2Snapshot = { ...state.player2 };

  const p1Hit = tryFindHit(p1Snapshot, p2Snapshot);
  const p2Hit = tryFindHit(p2Snapshot, p1Snapshot);

  if (p1Hit) applyHit(state.player1, state.player2, p1Hit);
  if (p2Hit) applyHit(state.player2, state.player1, p2Hit);
}

function tryFindHit(attacker: PlayerState, defender: PlayerState): HitProperties | null {
  if (isKnockedOut(defender)) return null;
  if (attacker.hasCurrentAttackConnected) return null;

  const attackerMove = moveDef(attacker);
  if (!attackerMove.isAttack) return null;

  for (const hitbox of attackerMove.hitboxes) {
    if (!hitbox.isActiveOnFrame(attacker.moveFrame)) continue;
    const hitboxCenter = resolveWorldCenter(attacker.position, attacker.facingSign, hitbox);

    for (const hurtbox of moveDef(defender).hurtboxes) {
      if (!hurtbox.isActiveOnFrame(defender.moveFrame)) continue;
      const hurtboxCenter = resolveWorldCenter(defender.position, defender.facingSign, hurtbox);

      if (aabbOverlap(hitboxCenter, hitbox.halfExtents, hurtboxCenter, hurtbox.halfExtents)) {
        return attackerMove.hitProperties;
      }
    }
  }

  return null;
}

function applyHit(attacker: PlayerState, defender: PlayerState, hitProps: HitProperties): void {
  attacker.hasCurrentAttackConnected = true;
  const facing = attacker.facingSign;

  if (defender.isHoldingBlock) {
    defender.blockstunFramesRemaining = hitProps.blockstunFrames;
    defender.hitstunFramesRemaining = 0;
    defender.currentMove = MoveId.Blockstun;
    defender.moveFrame = 0;

    const kb = FixedVector3.scale(hitProps.knockback, Fixed.HALF);
    defender.position = clampToArena(FixedVector3.add(defender.position, FixedVector3.scaleInt(kb, facing)));
    return;
  }

  const damageMultiplier = attacker.isBeastForm ? 2 : 1;
  defender.health = Math.max(0, defender.health - hitProps.damage * damageMultiplier);
  defender.hitstunFramesRemaining = hitProps.hitstunFrames;
  defender.blockstunFramesRemaining = 0;
  defender.currentMove = defender.health <= 0 ? MoveId.KnockedOut : MoveId.Hitstun;
  defender.moveFrame = 0;

  defender.position = clampToArena(
    FixedVector3.add(defender.position, FixedVector3.scaleInt(hitProps.knockback, facing)),
  );
}
