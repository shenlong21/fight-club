namespace CombatCore;

/// <summary>
/// Dummy entry point required for compiling the class library to a standalone WASM module.
/// When compiled normally as a library for the server, this is ignored.
/// </summary>
public class Program
{
    public static void Main()
    {
        System.Console.WriteLine("CombatCore WASM Module Initialized");
    }
}
