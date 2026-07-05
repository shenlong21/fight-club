<RULE>
This project is "Fight Club", a web-based 3D fighting game (Bloody Roar 2
style) built on a deterministic, rollback-friendly simulation shared between
server and client.
- **Client**: Babylon.js + TypeScript (Vite), not React.
- **Server**: .NET (ASP.NET Core), WebTransport over HTTP/3 as the primary
  transport with a WebSocket fallback for browsers without WebTransport
  support (pre-Safari 26.4).
- **CombatCore**: a headless, deterministic C# class library - the single
  source of truth for combat rules, referenced directly by the server and
  compiled to WASM for the client. A hand-ported, golden-replay-verified
  TypeScript mirror (`Client/src/sim/`) exists as a fallback for when WASM
  isn't available; it is not a second, independent design.

For a complete breakdown of project layout, the client-simulation strategy,
determinism rules, and the network protocol, see `ARCHITECTURE.md` in the
project root. Do not ask the user for architectural details without first
consulting `ARCHITECTURE.md`.

### Engineering Standard
- **Code Quality**: Write code at a principal/senior engineering level. Emulate
  the rigorous, performance-first style used in the `CombatCore` engine.
- **Performance**: Enforce zero-allocation hot paths (e.g. the 60Hz tick loop,
  per-tick network encode/broadcast). Rely heavily on value types (`struct`),
  `stackalloc`/reused buffers, and pre-allocated buffers.
- **Documentation**: Include comprehensive, highly detailed comments (`///` in
  C#, `/** */` in TypeScript) that explain the *why* (architectural intent,
  edge cases, tradeoffs) rather than just the *what*.
- **Determinism**: Never introduce non-deterministic logic (e.g. `float`,
  `double`, `DateTime.Now`/`Date.now()`, `System.Random`/`Math.random()`) into
  the simulation core (`CombatCore/`, `Client/src/sim/`). Any change to one
  side of the C#/TypeScript sim mirror must be verified against the other via
  `Client/src/parity.test.ts` (`npm run test:parity` in `/Client`) before it's
  considered done.
</RULE>
