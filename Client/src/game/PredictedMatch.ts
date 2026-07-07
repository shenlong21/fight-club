import { tick } from "../sim/CombatSimulation.ts";
import { cloneMatchState } from "../sim/MatchState.ts";
import type { MatchState } from "../sim/MatchState.ts";
import { PlayerInput } from "../sim/Input.ts";
import type { PlayerSlot } from "../net/ServerConnection.ts";

interface PendingInput {
  frameNumber: number;
  input: PlayerInput;
}

/**
 * Client-side prediction for the LOCAL player only - Valve-style "apply your
 * own input immediately, resync + replay unconfirmed inputs whenever the
 * server's authoritative state arrives," not full two-sided GGPO rollback.
 * Without this, every input has to round-trip to the server before you see
 * its effect on screen; fine for a shooter's occasional correction, not for
 * a fighting game where block/hit timing is judged frame-by-frame.
 *
 * The opponent's input during the replay window is guessed as "doing
 * nothing" (PlayerInput.NONE). That's deliberately not a real prediction of
 * their behavior - it doesn't need to be, because the replay window this
 * covers is only ever the handful of ticks between "I applied my input
 * locally" and "the server's broadcast confirming/denying that tick came
 * back," typically a couple of frames on a LAN. Every new broadcast
 * re-seeds from the server's real truth (including the real opponent
 * state), so a wrong guess here only ever survives for that same tiny
 * window before self-correcting - it is not accumulated error.
 *
 * Because the guess above can occasionally be wrong about incoming hits
 * against the local player too (the server may confirm a hit the local
 * prediction didn't see coming, since it never simulated the opponent's
 * real attack), corrections here are hard resyncs, not smoothed - which is
 * correct, not a compromise: getting hit *should* look like a sudden state
 * change, not something to interpolate away.
 */
export class PredictedMatch {
  private mySlot: PlayerSlot | null = null;
  private predicted: MatchState | null = null;
  private pending: PendingInput[] = [];

  setMySlot(slot: PlayerSlot): void {
    this.mySlot = slot;
  }

  /** Feed every authoritative broadcast through this, in arrival order. */
  onServerState(serverState: MatchState): void {
    if (this.mySlot === null) return;

    // Anything the server's frame number has already passed is accounted
    // for (whether it agreed with our guess or not) - only replay what it
    // hasn't seen yet.
    this.pending = this.pending.filter((p) => p.frameNumber > serverState.frameNumber);

    let state = cloneMatchState(serverState);
    for (const { input } of this.pending) {
      state = this.tickWithLocalInput(state, input);
    }
    this.predicted = state;
  }

  /** Feed the local player's freshly-sampled input through this every input-send tick. */
  applyLocalInput(input: PlayerInput): void {
    if (this.predicted === null || this.mySlot === null) return;
    this.predicted = this.tickWithLocalInput(this.predicted, input);
    this.pending.push({ frameNumber: this.predicted.frameNumber, input });
  }

  /** What to render this frame. Null until both a slot assignment and a first broadcast have arrived - caller should fall back to raw server state until then. */
  getRenderState(): MatchState | null {
    return this.predicted;
  }

  private tickWithLocalInput(state: MatchState, localInput: PlayerInput): MatchState {
    return this.mySlot === 1
      ? tick(state, localInput, PlayerInput.NONE)
      : tick(state, PlayerInput.NONE, localInput);
  }
}
