import { FixedVector3 } from "./FixedVector3.ts";
import { DeterministicRandom } from "./DeterministicRandom.ts";
import { createDefaultPlayerState, clonePlayerState } from "./PlayerState.ts";
import type { PlayerState } from "./PlayerState.ts";

export const MatchPhase = {
  Fighting: 0,
  RoundEnd: 1,
} as const;
export type MatchPhaseValue = (typeof MatchPhase)[keyof typeof MatchPhase];

export interface MatchState {
  frameNumber: number;
  phase: MatchPhaseValue;
  player1: PlayerState;
  player2: PlayerState;
  rng: DeterministicRandom;
}

export function createInitialMatchState(rngSeed: number): MatchState {
  return {
    frameNumber: 0,
    phase: MatchPhase.Fighting,
    player1: createDefaultPlayerState(FixedVector3.fromFloats(-1.5, 0, 0), 1),
    player2: createDefaultPlayerState(FixedVector3.fromFloats(1.5, 0, 0), -1),
    rng: new DeterministicRandom(rngSeed),
  };
}

/** Deep-enough clone for a rollback snapshot buffer - matches C#'s struct-copy semantics. */
export function cloneMatchState(s: MatchState): MatchState {
  return {
    frameNumber: s.frameNumber,
    phase: s.phase,
    player1: clonePlayerState(s.player1),
    player2: clonePlayerState(s.player2),
    rng: s.rng.clone(),
  };
}
