using System.Buffers;
using CombatCore;
using Microsoft.AspNetCore.Connections;
using System.IO.Pipelines;

namespace Server.Networking;

/// <summary>
/// Adapts a Kestrel WebTransport session (HTTP/3, preview as of .NET 8/9/10 -
/// see the EnablePreviewFeatures/RuntimeHostConfigurationOption switches in
/// Server.csproj) to IPlayerConnection.
///
/// Kestrel's current WebTransport implementation exposes only streams
/// (IWebTransportSession.AcceptStreamAsync / OpenUnidirectionalStreamAsync) -
/// there is no datagram API on IWebTransportSession as of this writing. That
/// means the "unreliable, latest-wins" 60Hz state broadcast this class was
/// designed around does not actually get to skip queued/dropped-frame
/// semantics yet: it rides the same bidirectional stream as everything else,
/// exactly like the WebSocket fallback. This is a known, deliberate
/// limitation, not an oversight - swap SendStateAsync to a real datagram
/// write the day Kestrel exposes one, without touching MatchSession or
/// GameLoopService, since both only ever see IPlayerConnection.
/// </summary>
public sealed class WebTransportPlayerConnection : IPlayerConnection
{
    private const int InputFrameSize = 3;

    private readonly ConnectionContext _stream;
    private readonly SemaphoreSlim _sendLock = new(1, 1);

    // A Span<byte>/stackalloc can't stay alive across an `await` (the async
    // state machine has no way to preserve a ref struct across a suspension
    // point), and RunAsync's read loop awaits every iteration - so this is a
    // small reused heap buffer instead. It is only ever touched from within
    // RunAsync's own loop, never concurrently.
    private readonly byte[] _frameBytes = new byte[InputFrameSize];

    public string ConnectionId { get; }
    public event Action<PlayerInput>? InputReceived;

    public WebTransportPlayerConnection(string connectionId, ConnectionContext stream)
    {
        ConnectionId = connectionId;
        _stream = stream;
    }

    public async Task RunAsync(CancellationToken ct)
    {
        PipeReader reader = _stream.Transport.Input;
        try
        {
            while (!ct.IsCancellationRequested)
            {
                ReadResult result = await reader.ReadAsync(ct);
                ReadOnlySequence<byte> buffer = result.Buffer;

                while (buffer.Length >= InputFrameSize)
                {
                    ReadOnlySequence<byte> frame = buffer.Slice(0, InputFrameSize);
                    frame.CopyTo(_frameBytes);

                    var input = new PlayerInput((sbyte)_frameBytes[0], (sbyte)_frameBytes[1], (InputButtons)_frameBytes[2]);
                    InputReceived?.Invoke(input);

                    buffer = buffer.Slice(InputFrameSize);
                }

                // Only the bytes we actually consumed above are marked
                // examined/consumed; any partial (< InputFrameSize) tail
                // stays in the pipe and is prefixed onto the next read.
                reader.AdvanceTo(buffer.Start, result.Buffer.End);

                if (result.IsCompleted) break;
            }
        }
        finally
        {
            await reader.CompleteAsync();
        }
    }

    public Task SendStateAsync(ReadOnlyMemory<byte> encodedMatchState, CancellationToken ct) =>
        SendAsync(encodedMatchState, ct);

    public Task SendReliableAsync(ReadOnlyMemory<byte> payload, CancellationToken ct) =>
        SendAsync(payload, ct);

    private async Task SendAsync(ReadOnlyMemory<byte> payload, CancellationToken ct)
    {
        await _sendLock.WaitAsync(ct);
        try
        {
            await _stream.Transport.Output.WriteAsync(payload, ct);
        }
        catch (Exception ex) when (ex is IOException or InvalidOperationException)
        {
            // Peer went away mid-send (IOException), or this send raced the
            // stream's own teardown right after the peer closed it
            // (InvalidOperationException: "Writing is not allowed after
            // writer was completed" - observed in local WebTransport
            // testing). Swallowed rather than rethrown so one dead peer
            // doesn't fault the whole tick for the other player; the match
            // itself is not yet torn down here - see MatchLobby's TODO on
            // proper disconnect handling.
        }
        finally
        {
            _sendLock.Release();
        }
    }
}
