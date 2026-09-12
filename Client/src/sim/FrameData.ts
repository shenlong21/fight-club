import { FixedVector3 } from "./FixedVector3.ts";

export const MoveId = {
  Idle: 0,
  WalkForward: 1,
  WalkBackward: 2,
  LightPunch: 3,
  HeavyPunch: 4,
  Block: 5,
  Hitstun: 6,
  Blockstun: 7,
  KnockedOut: 8,

  // Directional attack variants - appended rather than interleaved so the
  // existing values above (serialized as a raw byte on the wire, see
  // NetCodec.ts) never change meaning for anything already deployed.
  UpPunch: 9,
  DownPunch: 10,
  SidePunch: 11,
  UpKick: 12,
  DownKick: 13,
  SideKick: 14,
} as const;

export type MoveIdValue = (typeof MoveId)[keyof typeof MoveId];

export class FrameBox {
  readonly startFrame: number;
  readonly endFrame: number;
  readonly localOffset: FixedVector3;
  readonly halfExtents: FixedVector3;

  constructor(startFrame: number, endFrame: number, localOffset: FixedVector3, halfExtents: FixedVector3) {
    this.startFrame = startFrame;
    this.endFrame = endFrame;
    this.localOffset = localOffset;
    this.halfExtents = halfExtents;
  }

  isActiveOnFrame(moveFrame: number): boolean {
    return moveFrame >= this.startFrame && moveFrame <= this.endFrame;
  }
}

export class HitProperties {
  readonly damage: number;
  readonly hitstunFrames: number;
  readonly blockstunFrames: number;
  readonly knockback: FixedVector3;

  constructor(damage: number, hitstunFrames: number, blockstunFrames: number, knockback: FixedVector3) {
    this.damage = damage;
    this.hitstunFrames = hitstunFrames;
    this.blockstunFrames = blockstunFrames;
    this.knockback = knockback;
  }

  static readonly NONE = new HitProperties(0, 0, 0, FixedVector3.ZERO);
}

export interface MoveDefinition {
  id: MoveIdValue;
  totalFrames: number;
  isCancelableByMovement: boolean;
  hitboxes: FrameBox[];
  hurtboxes: FrameBox[];
  hitProperties: HitProperties;
  isAttack: boolean;
}
