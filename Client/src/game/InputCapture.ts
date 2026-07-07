import { InputButtons } from "../sim/Input.ts";
import type { InputButtonsFlags } from "../sim/Input.ts";

export interface SampledInput {
  moveX: number;
  moveZ: number;
  buttons: InputButtonsFlags;
}

/**
 * Keyboard scheme:
 *   Arrow keys - movement (MoveX/MoveZ, digital -1/0/1 - see PlayerInput's
 *   own comment on why this is 8-way digital, not analog stick input).
 *   Z - Punch (arm swing, LightPunch), X - Kick (leg swing, HeavyPunch) -
 *   independent buttons, not a hold-both combo (see CombatSimulation's
 *   Kick-checked-before-Punch ordering for what happens if both are held).
 *   C - Block (held).
 *   V - Beast toggle (held - the sim reads this as a live hold, not an
 *   edge-triggered toggle, see PlayerState.IsBeastForm).
 *
 * Tracks currently-held keys and reduces them to the tiny shape
 * CombatCore's PlayerInput expects, sampled once per network send tick
 * rather than reacting to individual key events - the sim only cares about
 * "what was held during this tick," not event ordering within it.
 */
export class InputCapture {
  private readonly held = new Set<string>();

  constructor() {
    window.addEventListener("keydown", (e) => this.held.add(e.code));
    window.addEventListener("keyup", (e) => this.held.delete(e.code));
    // Held keys must not get "stuck" if focus leaves the page mid-press
    // (alt-tab, devtools, etc) - there is no matching keyup to clear them.
    window.addEventListener("blur", () => this.held.clear());
  }

  sample(): SampledInput {
    const moveX = this.axis("ArrowLeft", "ArrowRight");
    // ArrowDown is the negative key here (not ArrowUp) - see PlayerInput's Z
    // axis convention: this makes Down move the fighter toward the camera
    // and Up move it away, matching what players expect from the arrow keys
    // rather than the arena's raw +Z/-Z direction.
    const moveZ = this.axis("ArrowDown", "ArrowUp");

    let buttons: InputButtonsFlags = InputButtons.None;
    if (this.held.has("KeyZ")) buttons |= InputButtons.Punch;
    if (this.held.has("KeyX")) buttons |= InputButtons.Kick;
    if (this.held.has("KeyC")) buttons |= InputButtons.Block;
    if (this.held.has("KeyV")) buttons |= InputButtons.BeastToggle;

    return { moveX, moveZ, buttons };
  }

  private axis(negativeKey: string, positiveKey: string): number {
    const neg = this.held.has(negativeKey);
    const pos = this.held.has(positiveKey);
    if (neg === pos) return 0; // both or neither held - no movement, not an arbitrary tie-break
    return neg ? -1 : 1;
  }
}
