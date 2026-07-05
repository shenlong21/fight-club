using CombatCore;

namespace Server.Networking;

/// <summary>
/// Transport-agnostic view of one connected player's socket. MatchSession and
/// GameLoopService are written against this interface only, never against
/// WebSocket or WebTransport types directly - that is what lets the transport
/// swap (or run side by side, WebSocket as a fallback for browsers that don't
/// speak WebTransport yet) without touching a single line of match logic.
///
/// Both "state" and "reliable" sends currently ride the same underlying
/// reliable, ordered channel on every implementation we have today (a
/// WebSocket message, or a WebTransport bidirectional stream - Kestrel's
/// WebTransport preview does not expose datagrams yet, see
/// WebTransportPlayerConnection). The distinction is kept in the interface
/// anyway because it is a real distinction at the protocol level the day
/// datagrams land, and call sites should already say what delivery guarantee
/// they actually need rather than everything looking identical.
/// </summary>
public interface IPlayerConnection
{
    string ConnectionId { get; }

    /// <summary>Raised on the connection's own read loop whenever a full input frame arrives.</summary>
    event Action<PlayerInput>? InputReceived;

    /// <summary>Best-effort, latest-value-wins delivery for the 60Hz state broadcast.</summary>
    Task SendStateAsync(ReadOnlyMemory<byte> encodedMatchState, CancellationToken ct);

    /// <summary>Ordered, must-arrive delivery for match lifecycle events (round start/end, etc).</summary>
    Task SendReliableAsync(ReadOnlyMemory<byte> payload, CancellationToken ct);

    /// <summary>Runs the connection's read loop until the peer disconnects or ct is cancelled.</summary>
    Task RunAsync(CancellationToken ct);
}
