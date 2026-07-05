import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { createInitialMatchState } from "./sim/MatchState.ts";
import { tick } from "./sim/CombatSimulation.ts";
import { computeStateHash } from "./sim/StateHash.ts";
import { PlayerInput } from "./sim/Input.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const goldenDir = join(__dirname, "..", "..", "shared", "golden-replays");

interface PlayerInputDto {
  MoveX: number;
  MoveZ: number;
  Buttons: number;
}
interface TickInputDto {
  P1: PlayerInputDto;
  P2: PlayerInputDto;
}
interface GoldenReplayDto {
  Seed: number;
  Ticks: TickInputDto[];
  Hashes: number[];
}

function runReplay(name: string): { passed: boolean; firstDivergence: number } {
  const raw = readFileSync(join(goldenDir, `${name}.json`), "utf-8");
  const replay: GoldenReplayDto = JSON.parse(raw);

  let state = createInitialMatchState(replay.Seed);
  const tsHashes: number[] = [computeStateHash(state)];

  for (const t of replay.Ticks) {
    const p1 = new PlayerInput(t.P1.MoveX, t.P1.MoveZ, t.P1.Buttons);
    const p2 = new PlayerInput(t.P2.MoveX, t.P2.MoveZ, t.P2.Buttons);
    state = tick(state, p1, p2);
    tsHashes.push(computeStateHash(state));
  }

  if (tsHashes.length !== replay.Hashes.length) {
    console.log(`  [FAIL] ${name}: hash count mismatch (TS=${tsHashes.length}, golden=${replay.Hashes.length})`);
    return { passed: false, firstDivergence: -1 };
  }

  for (let i = 0; i < tsHashes.length; i++) {
    if (tsHashes[i] !== replay.Hashes[i]) {
      console.log(`  [FAIL] ${name}: diverged at tick ${i} (TS=0x${tsHashes[i].toString(16)}, golden=0x${replay.Hashes[i].toString(16)})`);
      return { passed: false, firstDivergence: i };
    }
  }

  console.log(`  [PASS] ${name}: all ${tsHashes.length} ticks match the C#-recorded golden hashes exactly`);
  return { passed: true, firstDivergence: -1 };
}

console.log("=== Cross-language parity test: TypeScript port vs C# golden replays ===");
const results = [runReplay("heavy_punch"), runReplay("blocked_light_punch")];

const allPassed = results.every((r) => r.passed);
console.log();
console.log(allPassed
  ? "ALL REPLAYS MATCH - the TypeScript port is bit-identical to the C# simulation for these scripts."
  : "MISMATCH DETECTED - the TS port has diverged from the C# sim. Do not ship until this is green.");

process.exit(allPassed ? 0 : 1);
