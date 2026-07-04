# Fight Club - Project Architecture

## Core Principle: One Deterministic Simulation, Two Runtimes
The game uses a **Rollback Netcode** architecture. The combat logic (movement, hit resolution, state machine, damage, stun) must produce bit-identical output given the same inputs, whether it runs on the .NET Server or in the browser via WebAssembly (WASM).

### Project Layout
1. **`/CombatCore`**: The headless, completely deterministic C# class library. It acts as a pure mathematical function: `(Previous MatchState + Inputs) -> Next MatchState`.
2. **`/Server`**: .NET 8/9 ASP.NET Core app. It references `CombatCore` directly. It acts as the authoritative truth, processing inputs via WebTransport and broadcasting confirmed `MatchState` snapshots.
3. **`/Client`**: React + Vite + Canvas. It loads `CombatCore` as a compiled WASM module. It predicts frames locally for zero-latency feel and rolls back its state if the server's confirmed state diverges from its prediction.

## Determinism Rules (The "Non-Negotiables")
To ensure the Server and WASM Client never desync:
- **NO Floats/Doubles**: `CombatCore` uses a custom `Fixed` struct (Q16.16 fixed-point integers). Float arithmetic differs across CPU architectures and JIT compilers.
- **NO System Time**: `DateTime.Now` is strictly banned.
- **NO System.Random**: We use `DeterministicRandom` (a custom xorshift32 implementation) stored inside the `MatchState` so random events (like critical hits) roll back flawlessly.
- **Data-Driven Frame Data**: Hitboxes and hurtboxes are authored offline per animation frame in `MoveTable.cs`. We use purely integer-based AABB overlap tests.

## Network Protocol & State Hashing
- **Binary NetCodec**: We use a hand-rolled, 57-byte, little-endian binary codec (`NetCodec.cs`) instead of MessagePack or MemoryPack for the 60Hz simulation hot-path. This guarantees the lowest possible bandwidth and removes serialization overhead.
- **StateHash (FNV-1a)**: Both the Client and Server compute an FNV-1a hash over the encoded 57 bytes of every frame. If the Client's hash for Frame N doesn't match the Server's hash for Frame N, a desync has occurred and the client must snap to the server's truth.
