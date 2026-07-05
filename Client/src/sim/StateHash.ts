import type { MatchState } from "./MatchState.ts";
import { encode } from "./NetCodec.ts";

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

export function computeStateHash(state: MatchState): number {
  return computeOverBytes(encode(state));
}

export function computeOverBytes(bytes: Uint8Array): number {
  let hash = FNV_OFFSET_BASIS >>> 0;
  for (let i = 0; i < bytes.length; i++) {
    hash = (hash ^ bytes[i]) >>> 0;
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash >>> 0;
}
