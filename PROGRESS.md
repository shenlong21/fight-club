# Progress Log

Status snapshot of the Fight Club project. See [`ARCHITECTURE.md`](ARCHITECTURE.md)
for design/rationale and [`README.md`](README.md) for setup/run instructions -
this file is just "what's done, what's tested, what's next."

## Done and verified

- **`CombatCore`** - deterministic C# combat simulation (fixed-point math,
  frame-data-driven hitboxes/hurtboxes, xorshift32 RNG, 57-byte `NetCodec`
  wire format, FNV-1a `StateHash`). Compiles to WASM via `WasmInterop.cs`
  (interop shim exists; the actual WASM build/publish pipeline has **not**
  been set up/tested yet - see Not done below).
- **`CombatCore.Harness`** - console test suite: determinism, HeavyPunch hit
  resolution, LightPunch block resolution, wire codec round-trip. 14/14
  checks passing. Also exports golden replays to `shared/golden-replays/`.
- **TypeScript sim port** (`Client/src/sim/`) - hand-ported mirror of
  `CombatCore`, verified **bit-identical** to the C# golden replays via
  `Client/src/parity.test.ts` (`npm run test:parity`). This is the
  simulation path actually driving the client today (see "Client" below) -
  the WASM path is still a planned future swap-in, not yet wired up.
- **`Server`** - ASP.NET Core, `net10.0`. WebTransport (HTTP/3/QUIC, Kestrel
  preview) as primary transport, WebSocket (`/match`) as fallback. Both map
  to a shared `IPlayerConnection` abstraction (`Server/Networking/`).
  `GameLoopService` runs a drift-corrected ~60Hz tick over all active
  `MatchSession`s (`Server/Match/`); `MatchLobby` does simple FIFO pairing.
  - Live-verified: real HTTP/3 negotiation (`RequestVersionExact` succeeds),
    and a real two-client WebTransport session (Node `@fails-components/webtransport`,
    hash-pinned short-lived ECDSA cert) exchanging live 60Hz `MatchState`
    broadcasts.
- **`Client`** - Babylon.js + TypeScript (Vite), **not** React, over the
  WebSocket path (`Client/src/net/ServerConnection.ts`).
  - **Client-side prediction** (`Client/src/game/PredictedMatch.ts`): the
    local player's own input is applied immediately via the TS sim, not
    just rendered after a server round trip - Valve-style predict +
    reconcile (resync + replay unconfirmed inputs on every broadcast), not
    full two-sided GGPO rollback. The server tells each connection which
    `MatchState` slot is theirs via a one-time 1-byte message
    (`MatchSession.SendPlayerAssignmentsAsync`) since the wire protocol
    otherwise has no way to say that. Live-verified: predicted position
    visibly moves a tick before the raw broadcast catches up, and both
    converge with no drift once movement stops.
  - Controls: Arrow keys move (Down = toward camera, Up = away - inverted
    from the arena's raw +Z/-Z), `Z` Punch, `X` Kick (independent buttons,
    not a hold-both combo - `Kick` checked before `Punch` in
    `CombatSimulation` if both are somehow held), `C` Block (hold), `V`
    Beast form (hold - functional in the sim as a 2x damage multiplier, but
    deliberately not a current focus: no visual transformation, no
    meter/cooldown - see `MoveTable.cs`'s own comment on this).
  - HUD: plain HTML/CSS health bars + connection status line.
  - **Live-tested end-to-end** with two independent browser clients (the
    `run-fight-club` project skill's Playwright driver): both connect,
    `MatchLobby` pairs them, a HeavyPunch/Kick lands for the exact expected
    18 damage (100%→82%) and both clients show identical health.
  - **Real animated character model** (`Client/src/game/createFighter.ts`,
    `fighter_combined.glb`): a Mixamo-rigged model (user-provided) merged
    with 36 Mixamo mocap animation clips (also user-provided, as separate
    FBX files) into one glb via a **headless Blender script**
    (`bpy`/`io_scene_gltf2`, run via `blender --background --python`, no
    Blender GUI work needed) - imports the base model, imports each
    animation FBX to harvest its Action, reattaches each Action as an NLA
    strip on the base armature (bone names match across all Mixamo assets,
    so this retargets cleanly), exports one glTF with 36 named animation
    clips. Placeholder jointed-box rig (`CombatPose.ts` procedural
    posing) is gone, fully replaced.
    - The merged model measures ~11x smaller than our game's real-world
      scale (consistent across the base model AND every source FBX - a
      Mixamo/Blender-pipeline unit convention, not a bug) - corrected via a
      single scale factor in `createFighter.ts`.
  - **Animation playback is frame-locked to game state**
    (`Client/src/game/FighterView.ts`): each `AnimationGroup`'s playhead is
    set directly via `goToFrame(moveFrame/totalFrames * clipLength)` for
    attacks/hitstun - the same "recompute fresh every frame from
    (currentMove, moveFrame), don't let it run on its own clock" reasoning
    the old `CombatPose.ts` used, now applied to real clips instead of
    hand-computed joint rotations. Idle/walk/block use normal looped
    playback instead (no hit window to keep frame-locked, natural looping
    motion matters more than exact sync there). Live-verified via
    screenshots: guard stance, punch, and kick (leg clearly raised
    mid-kick) all visually confirmed correct, health drops on the expected
    frame, no console errors.
  - **Hitstop + camera shake** on impact (`main.ts`), scaled by how much
    hitstun/blockstun the hit actually carries - presentation-only (the
    server tick and local prediction keep running at full speed
    underneath; only what's drawn freezes/shakes), so none of this touches
    `CombatCore`'s tested determinism. Hit-flash (brief white emissive
    pulse on the real model's materials) replaced the old placeholder's
    full-body recolor tint.
  - **Dynamic follow/zoom camera** (`Client/src/game/CombatCamera.ts`):
    dollies in when fighters are close, pulls back as they separate.
- **`.claude/skills/run-fight-club`** - project skill for launching/driving
  the game: a Playwright driver (`driver.mjs`) that opens two browser
  contexts (one per networked player), with commands for keyboard
  input, reading live `MatchState` via a `window.__fightClub` debug hook,
  health/status, and screenshots. Script-file mode (no tmux needed - this
  runs on Windows) or REPL mode.
- **Docs**: `ARCHITECTURE.md`, `.agents/AGENTS.md`, and `README.md` (incl.
  full local HTTPS/HTTP-3/WebTransport certificate setup, and a LAN-testing
  certificate walkthrough for playing from a second machine) are all up to
  date with the above.

## Not done yet (known gaps, not oversights)

- **Prediction only covers the local player, not full rollback.** The
  opponent's motion during the small replay window is guessed as "no
  input," and corrections (e.g. getting hit) are hard resyncs, not smoothed.
  Both are deliberate MVP scope cuts (see `PredictedMatch.ts`'s doc
  comment), not bugs - revisit if opponent rendering looks jittery in
  practice or corrections feel too abrupt.
- **No WASM build pipeline.** `WasmInterop.cs` exists but nothing actually
  publishes `CombatCore` to a `.wasm` module or loads it client-side yet.
  The TypeScript port is what's really running today, on both the
  networked-state and now the prediction path.
- **No disconnect/cleanup handling.** `MatchLobby` never notices "both
  players gone" - a session with two dead sockets just keeps occupying a
  `GameLoopService` tick slot forever (documented as a TODO in
  `MatchLobby.cs`).
- **No real matchmaking, rounds, timer, or win/lose screens** - deliberately
  out of scope for this first vertical slice.
- **No dedicated "knocked out" animation clip** - the user's Mixamo batch
  didn't include a death/KO clip. `FighterView` currently reuses `Hit
  Reaction` (held on its last frame) plus the existing fall-over root
  rotation. Fine for now; swap in a real clip if/when one gets added.
- **Both fighters use the identical model/skin** - no P1/P2 palette
  distinction beyond the HUD's red/blue health bars and facing direction.
- **Animation-to-move mapping is a first pass**, picked by name/vibe from
  the 36 available clips (`Cross Punch` for LightPunch, `Roundhouse Kick`
  for HeavyPunch/Kick, `Body Block` for Block/Blockstun, `Hit Reaction` for
  Hitstun/KnockedOut) - swap any of these in `FighterView.ts`'s
  `CLIP_FOR_MOVE` table if a different clip reads better.

## Suggested next steps (not yet started)

1. Keep iterating on movement/animation feel by eye/feel now that real
   animations are in - e.g. movement acceleration curves (currently
   instant-velocity, no ramp-up), knockback "pop," reconsidering which clip
   plays for which move.
2. `MatchLobby` disconnect detection/cleanup.
3. Either wire up the real WASM publish pipeline, or explicitly decide to
   stay TS-only for longer and update `ARCHITECTURE.md` accordingly.
4. Consider a distinct look for Player 2 (recolor/second skin) so the two
   fighters aren't visually identical.
