import { MoveId } from "../sim/FrameData.ts";
import { moveDef } from "../sim/PlayerState.ts";
import type { PlayerState } from "../sim/PlayerState.ts";
import type { Fighter } from "./createFighter.ts";

export interface ImpactEvent {
  /** Whichever of Hitstun/Blockstun this fighter just entered. */
  kind: typeof MoveId.Hitstun | typeof MoveId.Blockstun;
  /** How many hitstun/blockstun frames the hit carries - used to scale hitstop/shake so a LightPunch doesn't feel as heavy as a HeavyPunch. */
  stunFrames: number;
}

/**
 * Which Mixamo clip plays for which move, and how its playhead is driven:
 *
 *  - "loop": Babylon's own free-running playback. For ambient/held states
 *    (idle, walking, holding block) that have no hit window to keep
 *    frame-locked - looking natural matters more than exact sync here.
 *  - "scrub": the clip's playhead is set directly from (moveFrame /
 *    totalFrames) every render frame, matching MoveTable's real startup/
 *    active/recovery windows - the same reasoning the old CombatPose.ts
 *    procedural poses used, now applied to a real animation clip instead of
 *    hand-computed joint rotations. This is what keeps the animation's
 *    visual "reach" frame-locked to when the hitbox is actually active, and
 *    immune to client-prediction reconciliation replaying several ticks at
 *    once (an independent Animation/AnimationGroup.play() would visibly
 *    desync from the real attack the moment that happens).
 *  - "scrubHold": like "scrub", but moveFrame isn't bounded by a meaningful
 *    totalFrames (Hitstun/KnockedOut use 999 as "a very long time," not a
 *    real clip length) - so the clip plays at roughly 1 game-tick per clip
 *    frame and then holds on its last frame, rather than being stretched
 *    across the whole (irrelevant) 999-frame window.
 */
type ClipMode = "loop" | "scrub" | "scrubHold";
interface ClipConfig {
  clipName: string;
  mode: ClipMode;
  /**
   * "scrub" only: caps how far into the clip we scrub (0..1) even once
   * moveFrame reaches the move's last frame. Mixamo mocap clips run a
   * couple of seconds at their native pace; stretching the FULL clip
   * across a 12-24 tick (200-400ms) game window blurs through the whole
   * thing many times faster than it was ever meant to play. Playing only
   * the clip's opening slice (windup through impact - the visually
   * important part for a fast game hit) over that same real window instead
   * covers less visual distance per unit time, i.e. looks slower and more
   * deliberate, with no change to the game's actual attack timing.
   * Defaults to 1 (play the whole clip) if omitted.
   */
  maxProgress?: number;
}

const CLIP_FOR_MOVE: Partial<Record<number, ClipConfig>> = {
  [MoveId.Idle]: { clipName: "Idle", mode: "loop" },
  [MoveId.WalkForward]: { clipName: "Standing Walk Forward", mode: "loop" },
  [MoveId.WalkBackward]: { clipName: "Standing Walk Back", mode: "loop" },
  [MoveId.Block]: { clipName: "Body Block", mode: "loop" },
  [MoveId.Blockstun]: { clipName: "Body Block", mode: "loop" },
  [MoveId.LightPunch]: { clipName: "Cross Punch", mode: "scrub", maxProgress: 0.3 },
  [MoveId.HeavyPunch]: { clipName: "Roundhouse Kick", mode: "scrub", maxProgress: 0.35 },
  [MoveId.Hitstun]: { clipName: "Hit Reaction", mode: "scrubHold" },
  [MoveId.KnockedOut]: { clipName: "Hit Reaction", mode: "scrubHold" },
};

/**
 * Drives one fighter's real animated model from a networked (or locally
 * predicted - see PredictedMatch) PlayerState every render frame: which
 * clip is playing and at what frame (see CLIP_FOR_MOVE above), position/
 * facing, and edge-triggered impact notifications for whatever main.ts
 * wants to do with them (hitstop, camera shake).
 */
export class FighterView {
  private readonly fighter: Fighter;
  private lastRenderedMove: number = MoveId.Idle;
  private activeClipName: string | null = null;

  onImpact: ((event: ImpactEvent) => void) | null = null;

  constructor(fighter: Fighter) {
    this.fighter = fighter;
  }

  update(state: PlayerState): void {
    const root = this.fighter.root;
    root.position.x = state.position.x.toFloat();
    root.position.z = state.position.z.toFloat();
    // +PI from the box-rig's old formula - fighter_combined.glb's rest pose
    // faces the opposite way around Y compared to the placeholder rig this
    // replaced, so the un-adjusted formula had both fighters facing away
    // from each other instead of toward.
    root.rotation.y = (state.facingSign > 0 ? Math.PI / 2 : -Math.PI / 2) + Math.PI;

    // Fall-over for a knockout - simple, readable feedback that doesn't
    // depend on having a dedicated "knocked out" clip (the source Mixamo
    // batch didn't include one - see PROGRESS.md).
    root.rotation.z = state.health <= 0 ? Math.PI / 2 : 0;

    this.updateAnimation(state);
    this.detectImpactEdge(state);
    this.lastRenderedMove = state.currentMove;
  }

  private updateAnimation(state: PlayerState): void {
    const config = CLIP_FOR_MOVE[state.currentMove] ?? CLIP_FOR_MOVE[MoveId.Idle]!;
    const group = this.fighter.animationGroups.get(config.clipName);
    if (!group) return; // clip missing from the merged glb - fail quiet, not fatal

    if (config.clipName !== this.activeClipName) {
      const previous = this.activeClipName ? this.fighter.animationGroups.get(this.activeClipName) : undefined;
      previous?.stop();

      if (config.mode === "loop") {
        group.start(true);
      } else {
        // goToFrame() requires the group to already be playing/paused (see
        // its own doc comment) - start once, then immediately pause so
        // every subsequent frame is driven purely by goToFrame(), not by
        // Babylon's own clock.
        group.start(false);
        group.pause();
      }
      this.activeClipName = config.clipName;
    }

    if (config.mode === "loop") return;

    const clipLength = group.to - group.from;
    let progress: number;
    if (config.mode === "scrub") {
      const totalFrames = moveDef(state).totalFrames;
      const rawProgress = totalFrames <= 1 ? 0 : state.moveFrame / (totalFrames - 1);
      progress = rawProgress * (config.maxProgress ?? 1);
    } else {
      // scrubHold: 1 game tick ~= 1 clip frame, clamped to hold the last pose.
      progress = clipLength <= 0 ? 0 : Math.min(1, state.moveFrame / clipLength);
    }

    group.goToFrame(group.from + progress * clipLength);
  }

  private detectImpactEdge(state: PlayerState): void {
    if (state.moveFrame !== 0 || state.currentMove === this.lastRenderedMove) return;

    if (state.currentMove === MoveId.Hitstun) {
      this.fighter.flashHit();
      this.onImpact?.({ kind: MoveId.Hitstun, stunFrames: state.hitstunFramesRemaining });
    } else if (state.currentMove === MoveId.Blockstun) {
      this.onImpact?.({ kind: MoveId.Blockstun, stunFrames: state.blockstunFramesRemaining });
    }
  }
}
