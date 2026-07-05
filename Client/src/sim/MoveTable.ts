import { FixedVector3 } from "./FixedVector3.ts";
import { FrameBox, HitProperties, MoveId } from "./FrameData.ts";
import type { MoveDefinition, MoveIdValue } from "./FrameData.ts";

const STANDING_HURTBOX_OFFSET = FixedVector3.fromFloats(0, 0.9, 0);
const STANDING_HURTBOX_HALF_EXTENTS = FixedVector3.fromFloats(0.35, 0.9, 0.35);

function standingHurtbox(endFrame: number): FrameBox {
  return new FrameBox(0, endFrame, STANDING_HURTBOX_OFFSET, STANDING_HURTBOX_HALF_EXTENTS);
}

function build(): Map<MoveIdValue, MoveDefinition> {
  const table = new Map<MoveIdValue, MoveDefinition>();

  table.set(MoveId.Idle, {
    id: MoveId.Idle,
    totalFrames: 1,
    isCancelableByMovement: true,
    hitboxes: [],
    hurtboxes: [standingHurtbox(0)],
    hitProperties: HitProperties.NONE,
    isAttack: false,
  });

  table.set(MoveId.WalkForward, {
    id: MoveId.WalkForward,
    totalFrames: 1,
    isCancelableByMovement: true,
    hitboxes: [],
    hurtboxes: [standingHurtbox(0)],
    hitProperties: HitProperties.NONE,
    isAttack: false,
  });

  table.set(MoveId.WalkBackward, {
    id: MoveId.WalkBackward,
    totalFrames: 1,
    isCancelableByMovement: true,
    hitboxes: [],
    hurtboxes: [standingHurtbox(0)],
    hitProperties: HitProperties.NONE,
    isAttack: false,
  });

  table.set(MoveId.LightPunch, {
    id: MoveId.LightPunch,
    totalFrames: 12,
    isCancelableByMovement: false,
    hurtboxes: [standingHurtbox(11)],
    hitboxes: [
      new FrameBox(3, 4, FixedVector3.fromFloats(0.55, 1.1, 0), FixedVector3.fromFloats(0.3, 0.2, 0.2)),
    ],
    hitProperties: new HitProperties(6, 12, 6, FixedVector3.fromFloats(1.5, 0, 0)),
    isAttack: true,
  });

  table.set(MoveId.HeavyPunch, {
    id: MoveId.HeavyPunch,
    totalFrames: 24,
    isCancelableByMovement: false,
    hurtboxes: [standingHurtbox(23)],
    hitboxes: [
      new FrameBox(10, 13, FixedVector3.fromFloats(0.85, 1.1, 0), FixedVector3.fromFloats(0.35, 0.25, 0.25)),
    ],
    hitProperties: new HitProperties(18, 24, 14, FixedVector3.fromFloats(4.0, 0, 0)),
    isAttack: true,
  });

  table.set(MoveId.Block, {
    id: MoveId.Block,
    totalFrames: 1,
    isCancelableByMovement: true,
    hitboxes: [],
    hurtboxes: [standingHurtbox(0)],
    hitProperties: HitProperties.NONE,
    isAttack: false,
  });

  table.set(MoveId.Hitstun, {
    id: MoveId.Hitstun,
    totalFrames: 999,
    isCancelableByMovement: false,
    hitboxes: [],
    hurtboxes: [standingHurtbox(998)],
    hitProperties: HitProperties.NONE,
    isAttack: false,
  });

  table.set(MoveId.Blockstun, {
    id: MoveId.Blockstun,
    totalFrames: 999,
    isCancelableByMovement: false,
    hitboxes: [],
    hurtboxes: [standingHurtbox(998)],
    hitProperties: HitProperties.NONE,
    isAttack: false,
  });

  table.set(MoveId.KnockedOut, {
    id: MoveId.KnockedOut,
    totalFrames: 999,
    isCancelableByMovement: false,
    hitboxes: [],
    hurtboxes: [],
    hitProperties: HitProperties.NONE,
    isAttack: false,
  });

  return table;
}

export const MoveTable: ReadonlyMap<MoveIdValue, MoveDefinition> = build();

export function getMoveDef(id: MoveIdValue): MoveDefinition {
  const def = MoveTable.get(id);
  if (!def) throw new Error(`Unknown MoveId: ${id}`);
  return def;
}
