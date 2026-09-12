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

  // Directional attack variants - triggered by holding a direction while
  // Punch/Kick is pressed (see CombatSimulation.ts's stepPlayer). Frame
  // counts/damage are a first pass, not a tuned balance target: roughly,
  // "up" variants are quick with modest reach, "down" variants are fast and
  // low-damage, "side" variants are the slowest/heaviest-hitting of each
  // pair. Y offsets on the hitboxes are semantically correct (higher for
  // "up," lower for "down") even though they don't currently change
  // hit/miss against a single whole-body standingHurtbox - only matters if
  // hurtboxes are ever split high/low.

  // Startup 0-4 (5f), active 5-6 (2f), recovery 7-13 (7f) = 14f total.
  table.set(MoveId.UpPunch, {
    id: MoveId.UpPunch,
    totalFrames: 14,
    isCancelableByMovement: false,
    hurtboxes: [standingHurtbox(13)],
    hitboxes: [
      new FrameBox(5, 6, FixedVector3.fromFloats(0.55, 1.6, 0), FixedVector3.fromFloats(0.3, 0.25, 0.2)),
    ],
    hitProperties: new HitProperties(8, 14, 7, FixedVector3.fromFloats(2.0, 0, 0)),
    isAttack: true,
  });

  // Startup 0-2 (3f), active 3-3 (1f), recovery 4-9 (6f) = 10f total.
  table.set(MoveId.DownPunch, {
    id: MoveId.DownPunch,
    totalFrames: 10,
    isCancelableByMovement: false,
    hurtboxes: [standingHurtbox(9)],
    hitboxes: [
      new FrameBox(3, 3, FixedVector3.fromFloats(0.5, 0.6, 0), FixedVector3.fromFloats(0.3, 0.2, 0.2)),
    ],
    hitProperties: new HitProperties(5, 9, 4, FixedVector3.fromFloats(1.0, 0, 0)),
    isAttack: true,
  });

  // Startup 0-5 (6f), active 6-7 (2f), recovery 8-15 (8f) = 16f total.
  table.set(MoveId.SidePunch, {
    id: MoveId.SidePunch,
    totalFrames: 16,
    isCancelableByMovement: false,
    hurtboxes: [standingHurtbox(15)],
    hitboxes: [
      new FrameBox(6, 7, FixedVector3.fromFloats(0.6, 1.1, 0), FixedVector3.fromFloats(0.35, 0.25, 0.25)),
    ],
    hitProperties: new HitProperties(9, 15, 8, FixedVector3.fromFloats(2.5, 0, 0)),
    isAttack: true,
  });

  // Startup 0-7 (8f), active 8-10 (3f), recovery 11-19 (9f) = 20f total.
  table.set(MoveId.UpKick, {
    id: MoveId.UpKick,
    totalFrames: 20,
    isCancelableByMovement: false,
    hurtboxes: [standingHurtbox(19)],
    hitboxes: [
      new FrameBox(8, 10, FixedVector3.fromFloats(0.8, 1.7, 0), FixedVector3.fromFloats(0.35, 0.3, 0.25)),
    ],
    hitProperties: new HitProperties(14, 18, 10, FixedVector3.fromFloats(3.0, 0, 0)),
    isAttack: true,
  });

  // Startup 0-4 (5f), active 5-6 (2f), recovery 7-15 (9f) = 16f total.
  table.set(MoveId.DownKick, {
    id: MoveId.DownKick,
    totalFrames: 16,
    isCancelableByMovement: false,
    hurtboxes: [standingHurtbox(15)],
    hitboxes: [
      new FrameBox(5, 6, FixedVector3.fromFloats(0.75, 0.3, 0), FixedVector3.fromFloats(0.4, 0.2, 0.25)),
    ],
    hitProperties: new HitProperties(10, 13, 6, FixedVector3.fromFloats(2.0, 0, 0)),
    isAttack: true,
  });

  // Startup 0-8 (9f), active 9-11 (3f), recovery 12-21 (10f) = 22f total.
  table.set(MoveId.SideKick, {
    id: MoveId.SideKick,
    totalFrames: 22,
    isCancelableByMovement: false,
    hurtboxes: [standingHurtbox(21)],
    hitboxes: [
      new FrameBox(9, 11, FixedVector3.fromFloats(0.9, 1.2, 0), FixedVector3.fromFloats(0.4, 0.3, 0.3)),
    ],
    hitProperties: new HitProperties(16, 20, 11, FixedVector3.fromFloats(4.0, 0, 0)),
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
