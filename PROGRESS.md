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
- **`Client`** - Babylon.js + TypeScript (Vite), **not** React. Placeholder
  jointed-box fighter rigs (no real character models/animations yet) driven
  by server-authoritative `MatchState` over the WebSocket path
  (`Client/src/net/ServerConnection.ts`). No client-side prediction/rollback
  yet - the client just renders whatever the server last broadcast.
  - Controls: Arrow keys move, `Z` Punch, `X` Kick (hold both = HeavyPunch),
    `C` Block (hold), `V` Beast form (hold).
  - HUD: plain HTML/CSS health bars + connection status line.
  - **Live-tested end-to-end** with two independent browser clients
    (Playwright-driven Chromium, no project run-skill existed yet so this
    used the generic browser-driven fallback): both connect, `MatchLobby`
    pairs them, a HeavyPunch lands for the exact expected 18 damage
    (100%→82%) and both clients show identical health - confirmed via
    screenshots too.
- **Docs**: `ARCHITECTURE.md`, `.agents/AGENTS.md`, and `README.md` (incl. a
  full local HTTPS/HTTP-3/WebTransport certificate setup walkthrough) are
  all up to date with the above.

## Not done yet (known gaps, not oversights)

- **No client-side prediction/rollback.** The whole point of the
  deterministic-sim architecture (see `ARCHITECTURE.md`) is to let the
  client predict locally and reconcile against the server; today's client
  is a "dumb" renderer of server state only. This is the next big piece.
- **No WASM build pipeline.** `WasmInterop.cs` exists but nothing actually
  publishes `CombatCore` to a `.wasm` module or loads it client-side yet.
  The TypeScript port is what's really running today.
- **No disconnect/cleanup handling.** `MatchLobby` never notices "both
  players gone" - a session with two dead sockets just keeps occupying a
  `GameLoopService` tick slot forever (documented as a TODO in
  `MatchLobby.cs`).
- **No real matchmaking, rounds, timer, or win/lose screens** - deliberately
  out of scope for this first vertical slice.
- **No real character art/animations** - jointed placeholder boxes stand in
  for skinned models; human/beast rig retargeting (see `ARCHITECTURE.md`)
  hasn't been started.
- **No project-specific `run` skill yet** for launching/driving the app -
  worth generating one (`/run-skill-generator`) given how much of this
  session was spent hand-rolling Playwright drivers.

## Suggested next steps (not yet started)

1. Client-side prediction: run the TS sim locally on input, reconcile against
   server broadcasts.
2. `MatchLobby` disconnect detection/cleanup.
3. Either wire up the real WASM publish pipeline, or explicitly decide to
   stay TS-only for longer and update `ARCHITECTURE.md` accordingly.
4. Real character models + animation (replacing the placeholder rigs).
