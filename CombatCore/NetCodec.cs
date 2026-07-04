using System.Buffers.Binary;

namespace CombatCore;

/// <summary>
/// Encodes/decodes a full MatchState to a tightly packed, explicit-little-endian
/// byte layout.
///
/// This deliberately replaces the "MemoryPack or MessagePack" line from the
/// original architecture doc for the hot-path 60Hz payload. Both of those are
/// good general-purpose binary serializers, but a general-purpose serializer is
/// solving a harder problem than we have here: our wire schema is small, fixed,
/// and known at compile time on both ends, so a hand-rolled writer is both
/// smaller on the wire and removes an entire dependency (and, for MemoryPack
/// specifically, a codegen step that has to be re-run and kept in sync) from
/// the most latency-sensitive part of the system.
///
/// MessagePack is still a perfectly reasonable choice for the WebTransport
/// *stream* traffic - chat, match setup, end-of-round summaries - where a
/// couple hundred extra bytes and a slower parse genuinely do not matter, and
/// where the flexibility of a schema-less format is actually useful.
///
/// Layout (57 bytes total, all little-endian):
///   [0]      FrameNumber        uint32
///   [4]      Phase              byte
///   [5]      Rng.State          uint32
///   [9]      Player1            24 bytes (see WritePlayer)
///   [33]     Player2            24 bytes
/// </summary>
public static class NetCodec
{
    public const int WireSize = 4 + 1 + 4 + PlayerWireSize * 2;
    private const int PlayerWireSize = 24;

    [Flags]
    private enum PlayerFlags : byte
    {
        None = 0,
        HoldingBlock = 1 << 0,
        BeastForm = 1 << 1,
        FacingPositive = 1 << 2,
        AttackConnected = 1 << 3,
    }

    public static void Encode(in MatchState state, Span<byte> destination)
    {
        if (destination.Length < WireSize)
            throw new ArgumentException($"Destination buffer too small: need {WireSize} bytes, got {destination.Length}.");

        int offset = 0;
        BinaryPrimitives.WriteUInt32LittleEndian(destination[offset..], state.FrameNumber); offset += 4;
        destination[offset] = (byte)state.Phase; offset += 1;
        BinaryPrimitives.WriteUInt32LittleEndian(destination[offset..], state.Rng.State); offset += 4;

        WritePlayer(state.Player1, destination[offset..]); offset += PlayerWireSize;
        WritePlayer(state.Player2, destination[offset..]); offset += PlayerWireSize;
    }

    public static byte[] Encode(in MatchState state)
    {
        var buffer = new byte[WireSize];
        Encode(in state, buffer);
        return buffer;
    }

    public static MatchState Decode(ReadOnlySpan<byte> source)
    {
        if (source.Length < WireSize)
            throw new ArgumentException($"Source buffer too small: need {WireSize} bytes, got {source.Length}.");

        int offset = 0;
        var state = new MatchState
        {
            FrameNumber = BinaryPrimitives.ReadUInt32LittleEndian(source[offset..]),
        };
        offset += 4;
        state.Phase = (MatchPhase)source[offset]; offset += 1;
        state.Rng = new DeterministicRandom(BinaryPrimitives.ReadUInt32LittleEndian(source[offset..])); offset += 4;

        state.Player1 = ReadPlayer(source[offset..]); offset += PlayerWireSize;
        state.Player2 = ReadPlayer(source[offset..]); offset += PlayerWireSize;

        return state;
    }

    private static void WritePlayer(in PlayerState p, Span<byte> dest)
    {
        int offset = 0;
        BinaryPrimitives.WriteInt32LittleEndian(dest[offset..], p.Position.X.Raw); offset += 4;
        BinaryPrimitives.WriteInt32LittleEndian(dest[offset..], p.Position.Y.Raw); offset += 4;
        BinaryPrimitives.WriteInt32LittleEndian(dest[offset..], p.Position.Z.Raw); offset += 4;

        dest[offset] = (byte)p.CurrentMove; offset += 1;
        BinaryPrimitives.WriteUInt16LittleEndian(dest[offset..], (ushort)p.MoveFrame); offset += 2;

        BinaryPrimitives.WriteUInt16LittleEndian(dest[offset..], (ushort)Math.Max(0, p.Health)); offset += 2;
        BinaryPrimitives.WriteUInt16LittleEndian(dest[offset..], (ushort)p.MaxHealth); offset += 2;

        BinaryPrimitives.WriteUInt16LittleEndian(dest[offset..], (ushort)p.HitstunFramesRemaining); offset += 2;
        BinaryPrimitives.WriteUInt16LittleEndian(dest[offset..], (ushort)p.BlockstunFramesRemaining); offset += 2;

        PlayerFlags flags = PlayerFlags.None;
        if (p.IsHoldingBlock) flags |= PlayerFlags.HoldingBlock;
        if (p.IsBeastForm) flags |= PlayerFlags.BeastForm;
        if (p.FacingSign > 0) flags |= PlayerFlags.FacingPositive;
        if (p.HasCurrentAttackConnected) flags |= PlayerFlags.AttackConnected;
        dest[offset] = (byte)flags; offset += 1;
        // offset is now 24, matching PlayerWireSize.
    }

    private static PlayerState ReadPlayer(ReadOnlySpan<byte> src)
    {
        int offset = 0;
        var x = Fixed.FromRaw(BinaryPrimitives.ReadInt32LittleEndian(src[offset..])); offset += 4;
        var y = Fixed.FromRaw(BinaryPrimitives.ReadInt32LittleEndian(src[offset..])); offset += 4;
        var z = Fixed.FromRaw(BinaryPrimitives.ReadInt32LittleEndian(src[offset..])); offset += 4;

        var move = (MoveId)src[offset]; offset += 1;
        int moveFrame = BinaryPrimitives.ReadUInt16LittleEndian(src[offset..]); offset += 2;

        int health = BinaryPrimitives.ReadUInt16LittleEndian(src[offset..]); offset += 2;
        int maxHealth = BinaryPrimitives.ReadUInt16LittleEndian(src[offset..]); offset += 2;

        int hitstun = BinaryPrimitives.ReadUInt16LittleEndian(src[offset..]); offset += 2;
        int blockstun = BinaryPrimitives.ReadUInt16LittleEndian(src[offset..]); offset += 2;

        var flags = (PlayerFlags)src[offset]; offset += 1;

        return new PlayerState
        {
            Position = new FixedVector3(x, y, z),
            CurrentMove = move,
            MoveFrame = moveFrame,
            Health = health,
            MaxHealth = maxHealth,
            HitstunFramesRemaining = hitstun,
            BlockstunFramesRemaining = blockstun,
            IsHoldingBlock = (flags & PlayerFlags.HoldingBlock) != 0,
            IsBeastForm = (flags & PlayerFlags.BeastForm) != 0,
            FacingSign = (flags & PlayerFlags.FacingPositive) != 0 ? 1 : -1,
            HasCurrentAttackConnected = (flags & PlayerFlags.AttackConnected) != 0,
        };
    }
}
