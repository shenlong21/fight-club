using System.Text.Json;
using CombatCore;

var results = new List<(string Name, bool Passed, string Detail)>();

void Check(string name, bool passed, string detail = "")
{
    results.Add((name, passed, detail));
    Console.WriteLine($"[{(passed ? "PASS" : "FAIL")}] {name}{(detail.Length > 0 ? $" - {detail}" : "")}");
}

// ---------------------------------------------------------------------------
// Scripted scenario: P1 walks toward P2, then lands a HeavyPunch, unblocked.
// ---------------------------------------------------------------------------
List<(PlayerInput p1, PlayerInput p2)> BuildHeavyPunchScript()
{
    var script = new List<(PlayerInput, PlayerInput)>();
    // 40 ticks of P1 walking toward P2 (P2 stands still).
    for (int i = 0; i < 40; i++)
        script.Add((new PlayerInput(1, 0, InputButtons.None), PlayerInput.None));
    // Trigger HeavyPunch (Kick alone - it's an independent attack, not a
    // Punch+Kick combo, see CombatSimulation.cs), then let it play out
    // untouched - StepPlayer ignores input entirely once a non-cancelable
    // attack is committed, so PlayerInput.None is correct here.
    script.Add((new PlayerInput(0, 0, InputButtons.Kick), PlayerInput.None));
    for (int i = 0; i < 40; i++)
        script.Add((PlayerInput.None, PlayerInput.None));
    return script;
}

List<(PlayerInput p1, PlayerInput p2)> BuildBlockedLightPunchScript()
{
    var script = new List<(PlayerInput, PlayerInput)>();
    for (int i = 0; i < 40; i++)
        script.Add((new PlayerInput(1, 0, InputButtons.None), new PlayerInput(0, 0, InputButtons.Block)));
    script.Add((new PlayerInput(0, 0, InputButtons.Punch), new PlayerInput(0, 0, InputButtons.Block)));
    for (int i = 0; i < 20; i++)
        script.Add((PlayerInput.None, new PlayerInput(0, 0, InputButtons.Block)));
    return script;
}

(MatchState final, List<uint> hashes, List<MatchState> history) RunScript(
    uint seed, List<(PlayerInput p1, PlayerInput p2)> script)
{
    var state = MatchState.CreateInitial(seed);
    var hashes = new List<uint> { StateHash.Compute(in state) };
    var history = new List<MatchState> { state };

    foreach (var (p1, p2) in script)
    {
        state = CombatSimulation.Tick(in state, p1, p2);
        hashes.Add(StateHash.Compute(in state));
        history.Add(state);
    }

    return (state, hashes, history);
}

Console.WriteLine("=== Test 1: Determinism (same script run twice, from scratch) ===");
{
    var script = BuildHeavyPunchScript();
    var runA = RunScript(seed: 12345, script);
    var runB = RunScript(seed: 12345, script);

    bool allHashesMatch = runA.hashes.SequenceEqual(runB.hashes);
    Check("Per-tick state hashes identical across two independent runs",
        allHashesMatch,
        $"{runA.hashes.Count} ticks compared, first divergence: " +
        (allHashesMatch ? "none" : FindFirstDivergence(runA.hashes, runB.hashes).ToString()));

    byte[] bytesA = NetCodec.Encode(in runA.final);
    byte[] bytesB = NetCodec.Encode(in runB.final);
    Check("Final encoded MatchState byte-for-byte identical", bytesA.SequenceEqual(bytesB));
}

int FindFirstDivergence(List<uint> a, List<uint> b)
{
    for (int i = 0; i < Math.Min(a.Count, b.Count); i++)
        if (a[i] != b[i]) return i;
    return -1;
}

Console.WriteLine();
Console.WriteLine("=== Test 2: HeavyPunch connects, unblocked ===");
{
    var script = BuildHeavyPunchScript();
    var (final, hashes, history) = RunScript(seed: 999, script);

    Check("Defender health reduced by exactly one hit (100 -> 82)",
        final.Player2.Health == 82 || WasHitAndRecovered(history, expectedHealth: 82),
        $"Player2.Health observed minimum = {history.Min(s => s.Player2.Health)}");

    int minHealthSeen = history.Min(s => s.Player2.Health);
    Check("Damage applied exactly once (18 dmg), not 4x for the 4-frame active window",
        minHealthSeen == 82,
        $"min health seen = {minHealthSeen} (expected 82; 4x-hit bug would show 28 or lower)");

    bool enteredHitstun = history.Any(s => s.Player2.CurrentMove == MoveId.Hitstun);
    Check("Defender entered Hitstun state", enteredHitstun);

    bool recoveredToIdle = history[^1].Player2.CurrentMove == MoveId.Idle
        || history[^1].Player2.CurrentMove == MoveId.WalkForward
        || history[^1].Player2.CurrentMove == MoveId.WalkBackward;
    Check("Defender recovered out of Hitstun back to an actionable state by end of script",
        recoveredToIdle,
        $"final CurrentMove = {history[^1].Player2.CurrentMove}");

    bool knockedBack = history[^1].Player2.Position.X.ToFloat() > 1.5f;
    Check("Defender was knocked back away from attacker (positive X displacement)",
        knockedBack,
        $"final Player2.X = {history[^1].Player2.Position.X.ToFloat():F4} (started at 1.5)");

    // Print a short human-readable log around the moment of impact for visual verification.
    int impactTick = history.FindIndex(s => s.Player2.Health < 100);
    Console.WriteLine($"    Frame log around impact (tick {impactTick}):");
    for (int i = Math.Max(0, impactTick - 2); i <= Math.Min(history.Count - 1, impactTick + 2); i++)
    {
        var s = history[i];
        Console.WriteLine($"      tick {i,3}: P1[{s.Player1.CurrentMove,-10} f{s.Player1.MoveFrame,2} x={s.Player1.Position.X.ToFloat(),6:F2}]  " +
                           $"P2[{s.Player2.CurrentMove,-10} f{s.Player2.MoveFrame,2} x={s.Player2.Position.X.ToFloat(),6:F2} hp={s.Player2.Health,3}]");
    }
}

bool WasHitAndRecovered(List<MatchState> history, int expectedHealth) =>
    history.Any(s => s.Player2.Health == expectedHealth);

Console.WriteLine();
Console.WriteLine("=== Test 3: LightPunch blocked ===");
{
    var script = BuildBlockedLightPunchScript();
    var (final, hashes, history) = RunScript(seed: 42, script);

    Check("Defender health unchanged when blocking (stays at 100)",
        final.Player2.Health == 100,
        $"final health = {final.Player2.Health}");

    bool enteredBlockstun = history.Any(s => s.Player2.CurrentMove == MoveId.Blockstun);
    Check("Defender entered Blockstun (not Hitstun) state", enteredBlockstun);

    bool neverEnteredHitstun = !history.Any(s => s.Player2.CurrentMove == MoveId.Hitstun);
    Check("Defender never entered Hitstun while blocking", neverEnteredHitstun);
}

Console.WriteLine();
Console.WriteLine("=== Test 4: Wire codec round-trip ===");
{
    var script = BuildHeavyPunchScript();
    var (final, _, history) = RunScript(seed: 7, script);
    MatchState midFight = history[45]; // a non-trivial, non-initial state

    byte[] encoded = NetCodec.Encode(in midFight);
    Check("Wire payload matches documented size", encoded.Length == NetCodec.WireSize,
        $"{encoded.Length} bytes (expected {NetCodec.WireSize})");

    MatchState roundTripped = NetCodec.Decode(encoded);

    Check("Hash of original equals hash of round-tripped state",
        StateHash.Compute(in midFight) == StateHash.Compute(in roundTripped));

    Check("Position survives round-trip exactly",
        midFight.Player1.Position.Equals(roundTripped.Player1.Position) &&
        midFight.Player2.Position.Equals(roundTripped.Player2.Position));

    Check("Health/CurrentMove/MoveFrame survive round-trip exactly",
        midFight.Player1.Health == roundTripped.Player1.Health &&
        midFight.Player2.Health == roundTripped.Player2.Health &&
        midFight.Player1.CurrentMove == roundTripped.Player1.CurrentMove &&
        midFight.Player2.CurrentMove == roundTripped.Player2.CurrentMove &&
        midFight.Player1.MoveFrame == roundTripped.Player1.MoveFrame &&
        midFight.Player2.MoveFrame == roundTripped.Player2.MoveFrame);
}

Console.WriteLine();
Console.WriteLine("=== Exporting golden replays for cross-language (TypeScript) parity testing ===");
{
    // Same seeds/scripts as Test 2 and Test 3 above, deliberately - the point
    // of a golden replay is that it is a real, already-verified scenario, not
    // a fresh one invented just for the export.
    ExportGoldenReplay("heavy_punch", seed: 999, BuildHeavyPunchScript());
    ExportGoldenReplay("blocked_light_punch", seed: 42, BuildBlockedLightPunchScript());
}

void ExportGoldenReplay(string name, uint seed, List<(PlayerInput p1, PlayerInput p2)> script)
{
    var (_, hashes, _) = RunScript(seed, script);

    var dto = new GoldenReplayDto
    {
        Seed = seed,
        Ticks = script.Select(t => new TickInputDto
        {
            P1 = new PlayerInputDto { MoveX = t.p1.MoveX, MoveZ = t.p1.MoveZ, Buttons = (byte)t.p1.Buttons },
            P2 = new PlayerInputDto { MoveX = t.p2.MoveX, MoveZ = t.p2.MoveZ, Buttons = (byte)t.p2.Buttons },
        }).ToList(),
        // hashes[0] is the initial state (before any tick); TypeScript's replay
        // runner starts from the same CreateInitialMatchState(seed) baseline
        // and appends one hash per tick, so the two arrays line up 1:1.
        // Kept unsigned (not cast to int32) because the TS side computes and
        // compares hashes as unsigned 32-bit values (`>>> 0`); serializing as
        // a signed int here would flip large hashes negative and break every
        // comparison for a hash above 0x7FFFFFFF even though the bits match.
        Hashes = hashes.ToList(),
    };

    string goldenDir = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "shared", "golden-replays"));
    Directory.CreateDirectory(goldenDir);
    string path = Path.Combine(goldenDir, $"{name}.json");
    File.WriteAllText(path, JsonSerializer.Serialize(dto, new JsonSerializerOptions { WriteIndented = true }));
    Console.WriteLine($"  wrote {path} ({dto.Ticks.Count} ticks, {dto.Hashes.Count} hashes)");
}

Console.WriteLine();
Console.WriteLine("=== Summary ===");
int passCount = results.Count(r => r.Passed);
Console.WriteLine($"{passCount}/{results.Count} checks passed.");
if (passCount != results.Count)
{
    Console.WriteLine("FAILED CHECKS:");
    foreach (var r in results.Where(r => !r.Passed))
        Console.WriteLine($"  - {r.Name}: {r.Detail}");
    return 1;
}

return 0;

// ---------------------------------------------------------------------------
// DTOs for the golden-replay JSON contract consumed by Client/src/parity.test.ts.
// Field names are PascalCase to match System.Text.Json's default output; the
// TypeScript side's GoldenReplayDto interface mirrors these names exactly.
// ---------------------------------------------------------------------------
class PlayerInputDto
{
    public sbyte MoveX { get; set; }
    public sbyte MoveZ { get; set; }
    public byte Buttons { get; set; }
}

class TickInputDto
{
    public required PlayerInputDto P1 { get; set; }
    public required PlayerInputDto P2 { get; set; }
}

class GoldenReplayDto
{
    public uint Seed { get; set; }
    public required List<TickInputDto> Ticks { get; set; }
    public required List<uint> Hashes { get; set; }
}
