/**
 * InputButtons is a plain numeric bit-flag object rather than a TS `enum`.
 * Real TS enums compile to a runtime object *with* reverse lookups, which is
 * a non-erasable transform - running under Node's `--experimental-strip-types`
 * (type-erasure only, no code transformation) would fail on it. A `const`
 * object with `as const` gives the same ergonomics for our purposes without
 * needing the extra `--experimental-transform-types` flag. If this project
 * grows a real build step (bundler, tsc) later, switching back to `enum` is a
 * trivial, purely stylistic change.
 */
export const InputButtons = {
  None: 0,
  Punch: 1 << 0,
  Kick: 1 << 1,
  Block: 1 << 2,
  BeastToggle: 1 << 3,
  Jump: 1 << 4,
} as const;

export type InputButtonsFlags = number;

export class PlayerInput {
  readonly moveX: number; // -1, 0, 1
  readonly moveZ: number; // -1, 0, 1
  readonly buttons: InputButtonsFlags;

  constructor(moveX: number, moveZ: number, buttons: InputButtonsFlags) {
    this.moveX = PlayerInput.clampAxis(moveX);
    this.moveZ = PlayerInput.clampAxis(moveZ);
    this.buttons = buttons;
  }

  private static clampAxis(v: number): number {
    if (v < -1) return -1;
    if (v > 1) return 1;
    return v;
  }

  static readonly NONE = new PlayerInput(0, 0, InputButtons.None);

  has(flag: InputButtonsFlags): boolean {
    return (this.buttons & flag) === flag;
  }
}

/**
 * Mirrors CombatCore/Input.cs's InputHistory: a fixed-capacity ring buffer of
 * inputs by absolute frame number, with GGPO-style "repeat last known input"
 * prediction for frames we haven't received real input for yet.
 */
export class InputHistory {
  private readonly buffer: (PlayerInput | undefined)[];
  private readonly capacity: number;

  constructor(capacity = 600) {
    this.capacity = capacity;
    this.buffer = new Array(capacity);
  }

  private slot(frame: number): number {
    return frame % this.capacity;
  }

  set(frame: number, input: PlayerInput): void {
    this.buffer[this.slot(frame)] = input;
  }

  getOrPredict(frame: number): { input: PlayerInput; wasReal: boolean } {
    const direct = this.buffer[this.slot(frame)];
    if (direct !== undefined) return { input: direct, wasReal: true };

    for (let back = 1; back <= this.capacity; back++) {
      if (frame < back) break;
      const candidate = this.buffer[this.slot(frame - back)];
      if (candidate !== undefined) return { input: candidate, wasReal: false };
    }

    return { input: PlayerInput.NONE, wasReal: false };
  }

  hasReal(frame: number): boolean {
    return this.buffer[this.slot(frame)] !== undefined;
  }
}
