import { Fixed } from "./Fixed.ts";
import { FixedVector3 } from "./FixedVector3.ts";
import type { MatchState, MatchPhaseValue } from "./MatchState.ts";
import type { PlayerState } from "./PlayerState.ts";
import { DeterministicRandom } from "./DeterministicRandom.ts";
import type { MoveIdValue } from "./FrameData.ts";

const PLAYER_WIRE_SIZE = 24;
export const WIRE_SIZE = 4 + 1 + 4 + PLAYER_WIRE_SIZE * 2;

const PlayerFlags = {
  None: 0,
  HoldingBlock: 1 << 0,
  BeastForm: 1 << 1,
  FacingPositive: 1 << 2,
  AttackConnected: 1 << 3,
} as const;

export function encode(state: MatchState): Uint8Array {
  const buffer = new Uint8Array(WIRE_SIZE);
  const view = new DataView(buffer.buffer);
  let offset = 0;

  view.setUint32(offset, state.frameNumber, true); offset += 4;
  view.setUint8(offset, state.phase); offset += 1;
  view.setUint32(offset, state.rng.state, true); offset += 4;

  writePlayer(view, offset, state.player1); offset += PLAYER_WIRE_SIZE;
  writePlayer(view, offset, state.player2); offset += PLAYER_WIRE_SIZE;

  return buffer;
}

export function decode(bytes: Uint8Array): MatchState {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;

  const frameNumber = view.getUint32(offset, true); offset += 4;
  const phase = view.getUint8(offset) as MatchPhaseValue; offset += 1;
  const rngState = view.getUint32(offset, true); offset += 4;

  const player1 = readPlayer(view, offset); offset += PLAYER_WIRE_SIZE;
  const player2 = readPlayer(view, offset); offset += PLAYER_WIRE_SIZE;

  const rng = new DeterministicRandom(1);
  rng.state = rngState;

  return { frameNumber, phase, player1, player2, rng };
}

function writePlayer(view: DataView, base: number, p: PlayerState): void {
  let offset = base;
  view.setInt32(offset, p.position.x.raw, true); offset += 4;
  view.setInt32(offset, p.position.y.raw, true); offset += 4;
  view.setInt32(offset, p.position.z.raw, true); offset += 4;

  view.setUint8(offset, p.currentMove); offset += 1;
  view.setUint16(offset, p.moveFrame, true); offset += 2;

  view.setUint16(offset, Math.max(0, p.health), true); offset += 2;
  view.setUint16(offset, p.maxHealth, true); offset += 2;

  view.setUint16(offset, p.hitstunFramesRemaining, true); offset += 2;
  view.setUint16(offset, p.blockstunFramesRemaining, true); offset += 2;

  let flags = PlayerFlags.None;
  if (p.isHoldingBlock) flags |= PlayerFlags.HoldingBlock;
  if (p.isBeastForm) flags |= PlayerFlags.BeastForm;
  if (p.facingSign > 0) flags |= PlayerFlags.FacingPositive;
  if (p.hasCurrentAttackConnected) flags |= PlayerFlags.AttackConnected;
  view.setUint8(offset, flags); offset += 1;
  // offset - base is now 24, matching PLAYER_WIRE_SIZE.
}

function readPlayer(view: DataView, base: number): PlayerState {
  let offset = base;
  const x = Fixed.fromRaw(view.getInt32(offset, true)); offset += 4;
  const y = Fixed.fromRaw(view.getInt32(offset, true)); offset += 4;
  const z = Fixed.fromRaw(view.getInt32(offset, true)); offset += 4;

  const currentMove = view.getUint8(offset) as MoveIdValue; offset += 1;
  const moveFrame = view.getUint16(offset, true); offset += 2;

  const health = view.getUint16(offset, true); offset += 2;
  const maxHealth = view.getUint16(offset, true); offset += 2;

  const hitstunFramesRemaining = view.getUint16(offset, true); offset += 2;
  const blockstunFramesRemaining = view.getUint16(offset, true); offset += 2;

  const flags = view.getUint8(offset); offset += 1;

  return {
    position: new FixedVector3(x, y, z),
    currentMove,
    moveFrame,
    health,
    maxHealth,
    hitstunFramesRemaining,
    blockstunFramesRemaining,
    isHoldingBlock: (flags & PlayerFlags.HoldingBlock) !== 0,
    isBeastForm: (flags & PlayerFlags.BeastForm) !== 0,
    facingSign: (flags & PlayerFlags.FacingPositive) !== 0 ? 1 : -1,
    hasCurrentAttackConnected: (flags & PlayerFlags.AttackConnected) !== 0,
  };
}
