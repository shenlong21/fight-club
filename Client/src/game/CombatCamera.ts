import { TargetCamera, Vector3 } from "@babylonjs/core";

const MIN_DISTANCE = 5.5; // close enough that guard/kick/hitstun poses are legible up close
const MAX_DISTANCE = 10; // far enough to keep both fighters in frame at the arena's realistic max spacing
const MIN_HEIGHT = 1.9;
const MAX_HEIGHT = 2.5;
const TARGET_HEIGHT = 1.3;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * A fixed camera can't win: close enough to make the placeholder rig's
 * poses legible (see CombatPose.ts) and a real fight will walk a fighter
 * right out of frame the moment they separate; wide enough to always keep
 * both fighters in frame and the animation work is too small to see. Real
 * fighting games solve exactly this with a camera that dollies in when
 * fighters are close and pulls back as they separate - this is that, in its
 * simplest form (distance/height as a function of horizontal separation
 * only, no collision-avoidance or cinematic framing).
 */
export class CombatCamera {
  private readonly camera: TargetCamera;

  constructor(camera: TargetCamera) {
    this.camera = camera;
  }

  update(p1X: number, p2X: number, shakeOffsetX: number, shakeOffsetY: number): void {
    const midX = (p1X + p2X) / 2;
    const separation = Math.abs(p2X - p1X);

    const distance = clamp(4.2 + separation * 0.5, MIN_DISTANCE, MAX_DISTANCE);
    const height = clamp(MIN_HEIGHT + separation * 0.06, MIN_HEIGHT, MAX_HEIGHT);

    this.camera.position.set(midX + shakeOffsetX, height + shakeOffsetY, -distance);
    this.camera.setTarget(new Vector3(midX, TARGET_HEIGHT, 0));
  }
}
