using System;
using System.Runtime.InteropServices.JavaScript;

namespace CombatCore;

/// <summary>
/// The WebAssembly bridge. This exposes CombatSimulation.Tick to the JavaScript/React client.
/// 
/// Performance Note: We intentionally avoid passing complex objects across the JS-to-WASM boundary.
/// JS passes simple primitives (integers/bytes) representing the inputs, and C# returns a flat byte array
/// containing the serialized MatchState. 
/// 
/// For extreme optimization later, we can expose a memory pointer to `_outBuffer` and let JS read directly 
/// from the WASM linear memory to avoid the array marshalling cost entirely.
/// </summary>
public partial class WasmInterop
{
    private static MatchState _currentState;
    private static readonly byte[] _outBuffer = new byte[NetCodec.WireSize];

    [JSExport]
    public static void Initialize(int seed)
    {
        _currentState = MatchState.CreateInitial((uint)seed);
    }

    [JSExport]
    public static void LoadState(byte[] serializedState)
    {
        _currentState = NetCodec.Decode(serializedState);
    }

    /// <summary>
    /// Executes a single simulation frame.
    /// </summary>
    [JSExport]
    public static byte[] Tick(int p1MoveX, int p1MoveZ, int p1Buttons, int p2MoveX, int p2MoveZ, int p2Buttons)
    {
        var p1 = new PlayerInput((sbyte)p1MoveX, (sbyte)p1MoveZ, (InputButtons)p1Buttons);
        var p2 = new PlayerInput((sbyte)p2MoveX, (sbyte)p2MoveZ, (InputButtons)p2Buttons);

        _currentState = CombatSimulation.Tick(in _currentState, p1, p2);
        
        NetCodec.Encode(in _currentState, _outBuffer);
        return _outBuffer; // Marshals to a JS Uint8Array
    }

    [JSExport]
    public static int GetStateHash()
    {
        return (int)StateHash.Compute(in _currentState);
    }
}
