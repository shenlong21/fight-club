using System.Net.WebSockets;
using CombatCore;

namespace Server.Networking;

/// <summary>
/// Fallback transport for any browser without WebTransport support (notably
/// every Safari/iOS release before 26.4 - see ARCHITECTURE.md). One standard
/// WebSocket message per frame in each direction: an incoming message is
/// always exactly a 3-byte PlayerInput frame (sbyte MoveX, sbyte MoveZ, byte
/// Buttons), an outgoing message is always exactly NetCodec.WireSize bytes of
/// an encoded MatchState. There is no additional envelope - each side already
/// knows what to expect from the other, so a length prefix would be pure
/// overhead on a 60Hz path.
/// </summary>
public sealed class WebSocketPlayerConnection : IPlayerConnection
{
    private const int InputFrameSize = 3;

    private readonly WebSocket _socket;
    private readonly SemaphoreSlim _sendLock = new(1, 1);

    public string ConnectionId { get; }
    public event Action<PlayerInput>? InputReceived;

    public WebSocketPlayerConnection(string connectionId, WebSocket socket)
    {
        ConnectionId = connectionId;
        _socket = socket;
    }

    public async Task RunAsync(CancellationToken ct)
    {
        byte[] buffer = new byte[InputFrameSize];

        while (_socket.State == WebSocketState.Open && !ct.IsCancellationRequested)
        {
            WebSocketReceiveResult result;
            try
            {
                result = await _socket.ReceiveAsync(buffer, ct);
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (WebSocketException)
            {
                break;
            }

            if (result.MessageType == WebSocketMessageType.Close) break;

            // The client is untrusted - a malformed or short frame is dropped
            // silently rather than treated as a protocol error, since a lost
            // or truncated input frame should just fall back to
            // InputHistory's "repeat last known input" prediction, not tear
            // the connection down.
            if (result.Count != InputFrameSize) continue;

            var input = new PlayerInput((sbyte)buffer[0], (sbyte)buffer[1], (InputButtons)buffer[2]);
            InputReceived?.Invoke(input);
        }
    }

    public Task SendStateAsync(ReadOnlyMemory<byte> encodedMatchState, CancellationToken ct) =>
        SendAsync(encodedMatchState, ct);

    public Task SendReliableAsync(ReadOnlyMemory<byte> payload, CancellationToken ct) =>
        SendAsync(payload, ct);

    private async Task SendAsync(ReadOnlyMemory<byte> payload, CancellationToken ct)
    {
        if (_socket.State != WebSocketState.Open) return;

        // WebSocket.SendAsync on a single socket must not be called
        // concurrently from multiple call sites; the game loop broadcasts to
        // every session on the same tick, so this lock keeps a still-in-
        // flight send from overlapping with the next tick's send.
        await _sendLock.WaitAsync(ct);
        try
        {
            await _socket.SendAsync(payload, WebSocketMessageType.Binary, endOfMessage: true, ct);
        }
        catch (WebSocketException)
        {
            // Peer went away mid-send; MatchLobby/GameLoopService reconcile on the next tick.
        }
        finally
        {
            _sendLock.Release();
        }
    }
}
