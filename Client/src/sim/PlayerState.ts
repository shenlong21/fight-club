import { FixedVector3 } from "./FixedVector3.ts";
import { MoveId } from "./FrameData.ts";
import type { MoveDefinition, MoveIdValue } from "./FrameData.ts";
import { getMoveDef } from "./MoveTable.ts";

export interface PlayerState {
  position: FixedVector3;
  facingSign: number;
  health: number;
  maxHealth: number;

  currentMove: MoveIdValue;
  moveFrame: number;

  hitstunFramesRemaining: number;
  blockstunFramesRemaining: number;

  isHoldingBlock: boolean;
  isBeastForm: boolean;

  // Prevents a single multi-frame active hitbox window (e.g. HeavyPunch's
  // 4-frame active window) from registering as 4 separate hits against the
  // same activation. Reset to false whenever a new attack move starts.
  hasCurrentAttackConnected: boolean;
}

export function createDefaultPlayerState(startPosition: FixedVector3, facingSign: number, maxHealth = 100): PlayerState {
  return {
    position: startPosition,
    facingSign,
    health: maxHealth,
    maxHealth,
    currentMove: MoveId.Idle,
    moveFrame: 0,
    hitstunFramesRemaining: 0,
    blockstunFramesRemaining: 0,
    isHoldingBlock: false,
    isBeastForm: false,
    hasCurrentAttackConnected: false,
  };
}

export function isKnockedOut(p: PlayerState): boolean {
  return p.health <= 0;
}

export function moveDef(p: PlayerState): MoveDefinition {
  return getMoveDef(p.currentMove);
}

/** Structural clone - PlayerState is a plain object standing in for C#'s value-type struct semantics. */
export function clonePlayerState(p: PlayerState): PlayerState {
  return { ...p, position: p.position };
}
