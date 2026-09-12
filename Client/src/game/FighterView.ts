import { MoveId } from "../sim/FrameData.ts";
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
 *  - "timed": the clip plays over `durationMs` of real wall-clock time,
 *    deliberately NOT tied to the move's actual (much shorter) game-frame
 *    window. Mixamo mocap clips run a couple of seconds at their native
 *    pace; the first version of this scrubbed strictly from (moveFrame /
 *    totalFrames), which stretched the whole clip across a 12-24 tick
 *    (200-400ms) game window - many times faster than the mocap was ever
 *    meant to play, AND cut off wherever the game's frame count happened to
 *    land, not wherever the clip actually looked finished. `durationMs`
 *    fixes both: pick a value that lets the motion read naturally, and see
 *    FighterView.updateAnimation for how "timed" clips are allowed to keep
 *    playing past the point the underlying move has already ended in game
 *    terms, instead of hard-cutting.
 *    NOTE: this means the animation is no longer frame-locked to exactly
 *    when the hitbox is active, unlike the old CombatPose.ts procedural
 *    poses - a deliberate trade of strict sync for a readable, relaxed
 *    motion. Only the *visual* is affected; hit resolution still runs on
 *    the real, fast moveFrame data underneath, untouched.
 */
type ClipMode = "loop" | "timed";
interface ClipConfig {
  clipName: string;
  mode: ClipMode;
  /** "timed" only: how long (real ms) the clip plays over before holding on its last sampled frame. */
  durationMs?: number;
  /** "loop" only: Babylon playback speed multiplier (1 = clip's native pace). The Standing Walk clips read as a jog at native speed - not a change to actual movement speed (WalkSpeed in CombatSimulation), purely how fast the leg-cycle animation loops. Defaults to 1 if omitted. */
  speedRatio?: number;
}

const CLIP_FOR_MOVE: Partial<Record<number, ClipConfig>> = {
  [MoveId.Idle]: { clipName: "Idle", mode: "loop" },
  [MoveId.WalkForward]: { clipName: "Standing Walk Forward", mode: "loop", speedRatio: 0.65 },
  [MoveId.WalkBackward]: { clipName: "Standing Walk Back", mode: "loop", speedRatio: 0.65 },
  [MoveId.Block]: { clipName: "Body Block", mode: "loop" },
  [MoveId.Blockstun]: { clipName: "Body Block", mode: "loop" },
  [MoveId.LightPunch]: { clipName: "Cross Punch", mode: "timed", durationMs: 450 },
  [MoveId.HeavyPunch]: { clipName: "Roundhouse Kick", mode: "timed", durationMs: 600 },
  // Directional variants - first-pass clip picks by name/vibe from the
  // available Mixamo batch, not visually auditioned one-by-one; swap the
  // clipName here if a different clip in the merged glb reads better for a
  // given direction. Durations scale roughly with each move's MoveTable.cs
  // totalFrames (a "heavier"/longer game move gets a longer visual).
  [MoveId.UpPunch]: { clipName: "Elbow Punch", mode: "timed", durationMs: 480 },
  [MoveId.DownPunch]: { clipName: "Punching(1)", mode: "timed", durationMs: 350 },
  [MoveId.SidePunch]: { clipName: "Hook Punch", mode: "timed", durationMs: 500 },
  [MoveId.UpKick]: { clipName: "Flying Kick", mode: "timed", durationMs: 550 },
  [MoveId.DownKick]: { clipName: "Kicking(3)", mode: "timed", durationMs: 500 },
  [MoveId.SideKick]: { clipName: "Side Kick", mode: "timed", durationMs: 650 },
  [MoveId.Hitstun]: { clipName: "Hit Reaction", mode: "timed", durationMs: 450 },
  [MoveId.KnockedOut]: { clipName: "Hit Reaction", mode: "timed", durationMs: 450 },
};

// Higher = catches up to the real position faster. 1/RATE is roughly the
// smoothing's time constant in seconds - ~18 settles a big jump (knockback)
// in around 150-200ms, which reads as a real, physical shove rather than
// either an instant teleport or a floaty slow-motion drift. Applied
// uniformly to every position change, not knockback-specifically: normal
// per-tick walk movement is already such a small delta (WalkSpeed = 0.06
// units/tick) that smoothing it is imperceptible, so one code path handles
// both instead of needing to detect "was this a hit" separately.
const POSITION_SMOOTHING_RATE = 18;

const ATTACK_MOVES = new Set<number>([
  MoveId.LightPunch,
  MoveId.HeavyPunch,
  MoveId.UpPunch,
  MoveId.DownPunch,
  MoveId.SidePunch,
  MoveId.UpKick,
  MoveId.DownKick,
  MoveId.SideKick,
]);
const INTERRUPT_MOVES = new Set<number>([MoveId.Hitstun, MoveId.Blockstun, MoveId.KnockedOut]);

interface TimedPlayback {
  move: number;
  clipName: string;
  startMs: number;
  durationMs: number;
}

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

  // The rendered root position eases toward the real sim position instead of
  // snapping directly to it every frame - see POSITION_SMOOTHING_RATE. Null
  // until the first update() call, which seeds it directly (no smoothing
  // from nothing to the starting position).
  private renderedX: number | null = null;
  private renderedZ: number | null = null;
  private lastPositionUpdateMs: number | null = null;

  // An attack's "timed" clip is allowed to keep playing after the game's own
  // (much shorter) attack window ends, instead of hard-cutting to whatever
  // Idle/Walk/etc the sim has already moved on to - see ClipConfig's doc
  // comment. Getting hit always overrides this immediately regardless
  // (INTERRUPT_MOVES), since that has to read as instant no matter what the
  // attacker's own follow-through is doing.
  private attackPlayback: TimedPlayback | null = null;

  // Separate from attackPlayback: tracks Hitstun/KnockedOut's own timed
  // playback. Unlike an attack's follow-through, there's nothing sensible to
  // "carry over into" once a stun ends, so this always resets on a move
  // change rather than surviving past it.
  private reactionPlayback: TimedPlayback | null = null;

  onImpact: ((event: ImpactEvent) => void) | null = null;

  constructor(fighter: Fighter) {
    this.fighter = fighter;
  }

  update(state: PlayerState): void {
    const root = this.fighter.root;
    this.updateRenderedPosition(state);
    root.position.x = this.renderedX!;
    root.position.z = this.renderedZ!;
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

  /**
   * The eased render-layer X position (see updateRenderedPosition) - for
   * callers like main.ts's camera framing that need to stay visually in
   * sync with where the fighter is actually drawn, not the raw sim position
   * it's still catching up to after a knockback.
   */
  getRenderedX(): number {
    return this.renderedX ?? 0;
  }

  /**
   * Eases the rendered X/Z toward the sim's real position instead of
   * snapping straight to it - see POSITION_SMOOTHING_RATE. The sim applies
   * knockback as an instant, single-tick position delta (correct: knockback
   * distance/hitstun are resolved as of the frame the hit lands, nothing
   * about that should be slow), so rendering it directly reads as a
   * teleport. This only changes how the *rendered* position catches up to
   * that already-correct target; hit resolution, hurtbox position, and
   * everything gameplay-relevant still uses the real, un-smoothed
   * PlayerState.position, untouched.
   */
  private updateRenderedPosition(state: PlayerState): void {
    const now = performance.now();
    const targetX = state.position.x.toFloat();
    const targetZ = state.position.z.toFloat();

    if (this.renderedX === null || this.renderedZ === null || this.lastPositionUpdateMs === null) {
      this.renderedX = targetX;
      this.renderedZ = targetZ;
      this.lastPositionUpdateMs = now;
      return;
    }

    const dtSec = (now - this.lastPositionUpdateMs) / 1000;
    this.lastPositionUpdateMs = now;

    const smoothing = 1 - Math.exp(-POSITION_SMOOTHING_RATE * dtSec);
    this.renderedX += (targetX - this.renderedX) * smoothing;
    this.renderedZ += (targetZ - this.renderedZ) * smoothing;
  }

  private updateAnimation(state: PlayerState): void {
    const now = performance.now();

    if (state.moveFrame === 0 && state.currentMove !== this.lastRenderedMove && ATTACK_MOVES.has(state.currentMove)) {
      const config = CLIP_FOR_MOVE[state.currentMove]!;
      this.attackPlayback = { move: state.currentMove, clipName: config.clipName, startMs: now, durationMs: config.durationMs ?? 400 };
    }

    if (this.attackPlayback && !INTERRUPT_MOVES.has(state.currentMove)) {
      const elapsed = now - this.attackPlayback.startMs;
      const progress = Math.min(1, elapsed / this.attackPlayback.durationMs);
      this.playTimed(this.attackPlayback.clipName, progress);
      if (progress >= 1) this.attackPlayback = null;
      return;
    }
    this.attackPlayback = null;

    const config = CLIP_FOR_MOVE[state.currentMove] ?? CLIP_FOR_MOVE[MoveId.Idle]!;
    if (config.mode === "loop") {
      this.reactionPlayback = null;
      this.playLoop(config.clipName, config.speedRatio ?? 1);
      return;
    }

    // Non-attack "timed" clips (Hitstun/KnockedOut): start a fresh timer the
    // moment this move is entered, replayed from wherever the game's own
    // moveFrame already is if we're picking this up mid-state (e.g. a page
    // just loaded mid-hitstun) rather than assuming frame 0.
    if (this.reactionPlayback?.move !== state.currentMove) {
      this.reactionPlayback = {
        move: state.currentMove,
        clipName: config.clipName,
        startMs: now - state.moveFrame * (1000 / 60),
        durationMs: config.durationMs ?? 400,
      };
    }
    const elapsed = now - this.reactionPlayback.startMs;
    const progress = Math.min(1, elapsed / this.reactionPlayback.durationMs);
    this.playTimed(config.clipName, progress);
  }

  private playLoop(clipName: string, speedRatio: number): void {
    const group = this.fighter.animationGroups.get(clipName);
    if (!group) return; // clip missing from the merged glb - fail quiet, not fatal
    if (clipName === this.activeClipName) {
      group.speedRatio = speedRatio;
      return;
    }

    this.stopActiveClip();
    group.start(true, speedRatio);
    this.activeClipName = clipName;
  }

  private playTimed(clipName: string, progress: number): void {
    const group = this.fighter.animationGroups.get(clipName);
    if (!group) return; // clip missing from the merged glb - fail quiet, not fatal

    if (clipName !== this.activeClipName) {
      this.stopActiveClip();
      // goToFrame() requires the group to already be playing/paused (see its
      // own doc comment) - start once, then immediately pause so every
      // subsequent frame is driven purely by goToFrame(), not Babylon's own
      // clock.
      group.start(false);
      group.pause();
      this.activeClipName = clipName;
    }

    const clipLength = group.to - group.from;
    group.goToFrame(group.from + progress * clipLength);
  }

  private stopActiveClip(): void {
    if (!this.activeClipName) return;
    this.fighter.animationGroups.get(this.activeClipName)?.stop();
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
