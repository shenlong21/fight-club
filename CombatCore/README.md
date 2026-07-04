# CombatCore

This is the mathematical heart of the Fight Club engine. It is a headless, purely deterministic C# library. 
It must be compilable to WebAssembly (WASM) to run in the browser, while simultaneously being referenced natively by the ASP.NET Server.

## Key Components

### 1. `MatchState` and `PlayerState`
The simulation state is represented by deeply-nested `struct` types rather than `class` types. 
This ensures that `MatchState` can be copied instantly via a flat memory copy. This is critical for the client's Rollback Controller, which must store a ring-buffer of the last 60 frames (1 second) of game state to rewind and replay quickly.

### 2. `CombatSimulation.Tick()`
The core pipeline of the game. On every frame, it:
1. **Snapshots positions** to determine facing direction symmetrically.
2. **Steps both players** forward based on their buffered `PlayerInput` (MoveX, MoveZ, Buttons).
3. **Resolves Hits** by checking AABB overlaps of the active `FrameBox` hitboxes and hurtboxes.
4. **Applies Damage & Stun**, taking into account Block states and Beast form multipliers.

### 3. `MoveTable` & `FrameData`
Instead of using physical colliders attached to bones, hitboxes are authored statically. 
For example, `MoveId.HeavyPunch` defines exactly which frames its hitbox is active (`StartFrame: 10, EndFrame: 13`), and what its knockback and damage values are. This makes hit detection an `O(1)` data lookup, guaranteeing determinism across any rendering engine.

### 4. `NetCodec` & `StateHash`
The entire `MatchState` is serialized into exactly 57 bytes of raw little-endian data. This array is broadcast over WebTransport and hashed using `FNV-1a` to instantly detect cheating or desyncs between the WASM client and the native Server.
