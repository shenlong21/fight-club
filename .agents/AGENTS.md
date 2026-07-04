<RULE>
This project is "Fight Club", a 2D multiplayer arcade game. 
- **Client**: React (Vite)
- **Server**: .NET (SignalR)
For a complete breakdown of the game logic, server hubs, and React components, refer to `ARCHITECTURE.md` in the project root. Do not ask the user for architectural details without first consulting `ARCHITECTURE.md`.

### Engineering Standard
- **Code Quality**: Write code at a principal/senior engineering level. Emulate the rigorous, performance-first style used in the `CombatCore` engine.
- **Performance**: Enforce zero-allocation hot paths (e.g., the 60Hz tick loop). Rely heavily on value types (`struct`), stackalloc, and pre-allocated buffers.
- **Documentation**: Include comprehensive, highly-detailed XML comments (`///`) that explain the *why* (architectural intent, edge cases, tradeoffs) rather than just the *what*.
- **Determinism**: Never introduce non-deterministic logic (e.g., `float`, `double`, `DateTime.Now`, `System.Random`) into the simulation core.
</RULE>
