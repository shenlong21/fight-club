namespace CombatCore;

[Flags]
public enum InputButtons : byte
{
    None = 0,
    Punch = 1 << 0,
    Kick = 1 << 1,
    Block = 1 << 2,
    BeastToggle = 1 << 3,
    Jump = 1 << 4,
}

/// <summary>
/// One player's input for exactly one simulation frame. Deliberately tiny and
/// deliberately NOT analog - Bloody Roar-style movement is 8-way digital, so we
/// don't need (and don't want) float stick values entering the deterministic
/// core. MoveX/MoveZ are -1/0/1.
///
/// Packs into 3 bytes of payload (MoveX, MoveZ, Buttons) plus whatever frame
/// number/sequencing the transport layer wants to attach - see NetCodec.cs for
/// the actual wire layout.
/// </summary>
public readonly struct PlayerInput : IEquatable<PlayerInput>
{
    public readonly sbyte MoveX;
    public readonly sbyte MoveZ;
    public readonly InputButtons Buttons;

    public PlayerInput(sbyte moveX, sbyte moveZ, InputButtons buttons)
    {
        MoveX = Clamp(moveX);
        MoveZ = Clamp(moveZ);
        Buttons = buttons;
    }

    private static sbyte Clamp(sbyte v) => v switch { < -1 => -1, > 1 => 1, _ => v };

    public static readonly PlayerInput None = new(0, 0, InputButtons.None);

    public bool Has(InputButtons b) => (Buttons & b) == b;

    public bool Equals(PlayerInput other) =>
        MoveX == other.MoveX && MoveZ == other.MoveZ && Buttons == other.Buttons;

    public override bool Equals(object? obj) => obj is PlayerInput p && Equals(p);
    public override int GetHashCode() => HashCode.Combine(MoveX, MoveZ, Buttons);
    public override string ToString() => $"[{MoveX},{MoveZ},{Buttons}]";
}

/// <summary>
/// Fixed-capacity ring buffer of inputs indexed by absolute frame number.
/// Both client and server use this: the client needs it to know which of its
/// own past inputs to replay during a rollback; the server needs it to tolerate
/// inputs arriving slightly out of order or to substitute a "repeat last input"
/// guess when a packet hasn't arrived yet for the frame it's about to simulate.
/// </summary>
public sealed class InputHistory
{
    private readonly PlayerInput[] _buffer;
    private readonly bool[] _has;
    private readonly int _capacity;

    public InputHistory(int capacity = 600) // 10 seconds at 60Hz
    {
        _capacity = capacity;
        _buffer = new PlayerInput[capacity];
        _has = new bool[capacity];
    }

    private int Slot(uint frame) => (int)(frame % (uint)_capacity);

    public void Set(uint frame, PlayerInput input)
    {
        int slot = Slot(frame);
        _buffer[slot] = input;
        _has[slot] = true;
    }

    /// <summary>
    /// Returns the real input for a frame if we have it, otherwise the most
    /// recent known input at or before that frame (GGPO-style "predict: repeat
    /// last input"), or PlayerInput.None if we have nothing at all yet.
    /// </summary>
    public (PlayerInput input, bool wasReal) GetOrPredict(uint frame)
    {
        int slot = Slot(frame);
        if (_has[slot]) return (_buffer[slot], true);

        for (uint back = 1; back <= (uint)_capacity; back++)
        {
            if (frame < back) break;
            uint candidateFrame = frame - back;
            int candidateSlot = Slot(candidateFrame);
            if (_has[candidateSlot]) return (_buffer[candidateSlot], false);
        }

        return (PlayerInput.None, false);
    }

    public bool HasReal(uint frame) => _has[Slot(frame)];
}
