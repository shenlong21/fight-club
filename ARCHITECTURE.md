# Fight Club - Project Architecture

A web-based, 3D fighting game in the style of *Bloody Roar 2*: server-authoritative
for anti-cheat, but built around a deterministic, rollback-friendly simulation so
combat still feels locally instant rather than round-trip-delayed.

## Core Principle: One Deterministic Simulation, Multiple Runtimes
The combat logic (movement, hit resolution, state machine, damage, stun) must
produce bit-identical output given the same inputs, on every runtime it executes
on. That's what lets a client predict its own attacks/blocks locally, ahead of
server confirmation, and only rarely need correcting - the alternative
(server-authoritative-with-snap-back, the naive shooter-style model) puts a full
network round-trip of dead air between every attack and its hit confirmation,
which is not acceptable for frame-precise fighting-game combat.

### Project Layout
1. **`/CombatCore`**: The headless, completely deterministic C# class library.
   It acts as a pure function: `(Previous MatchState, P1 Input, P2 Input) -> Next MatchState`.
   This is the only place combat rules are allowed to live.
2. **`/CombatCore.Harness`**: A console test project referencing `CombatCore`.
   Proves determinism, hit/block resolution, and wire round-tripping against
   scripted scenarios, and exports **golden replays** (`/shared/golden-replays/*.json`)
   - recorded input scripts plus their per-tick state hashes - that any other
   language's port of the sim must reproduce exactly.
3. **`/Server`**: .NET (`net10.0`) ASP.NET Core app. References `CombatCore`
   directly (same compiled IL, not a port) and is the authoritative truth for
   every match. See "Server" below for the transport and game-loop design.
4. **`/Client`**: Babylon.js + TypeScript (Vite), not React. Runs the same
   simulation locally for prediction. See "Client simulation" below for how -
   there are two viable paths, both currently built, both currently required.
5. **`/shared/golden-replays`**: Cross-language contract. `CombatCore.Harness`
   writes these; `Client/src/parity.test.ts` reads them. If either side's sim
   changes and the recorded hashes stop matching, that is a determinism bug to
   fix immediately, not a flaky test to retry.

## Client simulation: WASM primary, TypeScript port as a verified fallback
The client needs the *exact* same tick function the server runs. There are two
implementations of it in this repo, and both exist on purpose:

- **Primary: `CombatCore` compiled to WASM** (`CombatCore/WasmInterop.cs`,
  `[JSExport]`-annotated). Same source, same IL as the server - divergence risk
  is close to zero. This is the preferred path whenever the WASM module loads
  successfully.
- **Fallback: a hand-ported TypeScript mirror** (`Client/src/sim/*.ts`), used if
  the WASM module fails to load/initialize, or for environments where shipping
  a WASM binary is undesirable. Because "port the logic by hand" is exactly the
  kind of thing that silently rots, this port is **not trusted on faith** - it
  is verified tick-by-tick against the C#-recorded golden replays by
  `Client/src/parity.test.ts` (`npm run test:parity` in `/Client`), and must stay
  green. A TypeScript change to `sim/` that isn't also reflected in
  `CombatCore` (or vice versa) will show up there as a hash mismatch.

Both implementations must independently obey the determinism rules below.

## Determinism Rules (The "Non-Negotiables")
To ensure the Server, the WASM client, and the TypeScript fallback never desync:
- **NO Floats/Doubles**: `CombatCore` uses a custom `Fixed` struct (Q16.16
  fixed-point integers), mirrored by `Client/src/sim/Fixed.ts`. Float arithmetic
  differs across CPU architectures and JIT/JS engines; fixed-point integer math
  does not.
- **NO System Time**: `DateTime.Now` (or `Date.now()`) is strictly banned from
  the simulation.
- **NO System.Random / Math.random()**: `DeterministicRandom` (a custom
  xorshift32 implementation) lives inside `MatchState` so random events roll
  back and replay identically on every runtime.
- **Data-Driven Frame Data**: Hitboxes and hurtboxes are authored offline per
  animation frame in `MoveTable.cs` (mirrored by `MoveTable.ts`). Hit
  resolution is a table lookup plus integer AABB overlap tests, not a physics
  query.

## Network Protocol & State Hashing
- **Binary NetCodec**: A hand-rolled, 57-byte, little-endian binary codec
  (`NetCodec.cs` / `NetCodec.ts`) instead of MessagePack or MemoryPack for the
  60Hz simulation hot-path - the wire schema is small, fixed, and known at
  compile time on both ends, so a general-purpose serializer solves a harder
  problem than exists here. MessagePack remains a reasonable choice for
  non-hot-path traffic (chat, match setup, end-of-round summaries) if that's
  ever added.
- **StateHash (FNV-1a)**: Every runtime computes an FNV-1a hash over the
  encoded 57 bytes of every frame (`StateHash.cs` / `StateHash.ts`). This is
  the cross-language contract - the golden-replay parity test is exactly "do
  these hashes match," and at runtime a client/server hash mismatch for the
  same frame number means a desync has occurred and the client must
  reconcile to the server's truth.

## Server: transport and game loop
- **Transport**: **WebTransport over HTTP/3** is the primary transport
  (`Server.csproj` enables Kestrel's WebTransport preview via
  `EnablePreviewFeatures` + the `WebTransportAndH3Datagrams` runtime switch).
  WebTransport reached Baseline browser support in March 2026 (Safari 26.4),
  but every pre-26.4 Safari/iOS release has zero support, so a **WebSocket
  fallback** (`/match` endpoint, plain HTTP/1.1) is a first-class second
  transport, not an afterthought - both map to the same `IPlayerConnection`
  abstraction (`Server/Networking/`) so match logic never touches transport
  specifics.
  - Kestrel's current WebTransport implementation exposes only bidirectional
    streams (`IWebTransportSession.AcceptStreamAsync`) - there is no datagram
    API yet, despite the "unreliable, latest-wins" design this was originally
    intended for. `WebTransportPlayerConnection` documents this as a known,
    temporary limitation, not an oversight; swapping in real datagrams later
    only touches that one file.
- **Game loop**: `GameLoopService` (`Server/Match/`) is a `BackgroundService`
  running a drift-corrected ~60Hz accumulator loop over every active
  `MatchSession`. Each tick reads real-or-predicted input from each player's
  `InputHistory` (GGPO-style "repeat last known input" when a packet hasn't
  arrived yet), calls `CombatSimulation.Tick` - the same function the client
  runs - and broadcasts the encoded result to both players.
- **Matchmaking**: `MatchLobby` is deliberately the simplest possible
  matchmaker (FIFO pairing, no ranking/rooms/reconnect). It exists to get two
  real transports talking to one real match, not to be a matchmaking service.
