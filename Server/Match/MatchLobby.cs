using System.Collections.Concurrent;
using Server.Networking;

namespace Server.Match;

/// <summary>
/// Deliberately the simplest possible matchmaker: a single FIFO queue that
/// pairs up connections two at a time as they arrive. There is no ranking, no
/// room codes, no reconnection support - this exists to get two real
/// transports (WebSocket and WebTransport) talking to one real CombatCore
/// match, not to be a matchmaking service. Replace this, not GameLoopService
/// or MatchSession, when real matchmaking is needed.
///
/// TODO: neither this nor MatchSession currently detects "both players are
/// gone" - a session whose sends are silently failing (see the catch blocks
/// in WebSocketPlayerConnection/WebTransportPlayerConnection) keeps occupying
/// a GameLoopService tick slot until IsComplete flips via an actual
/// knockout. Fine for this vertical slice; a real disconnect/timeout policy
/// belongs here before this ships to real players.
/// </summary>
public sealed class MatchLobby
{
    private readonly object _gate = new();
    private readonly Queue<IPlayerConnection> _waiting = new();
    private readonly ConcurrentDictionary<string, MatchSession> _active = new();

    /// <summary>Snapshot of currently active sessions - safe to enumerate while GameLoopService removes finished matches.</summary>
    public IReadOnlyCollection<MatchSession> ActiveSessions => _active.Values.ToList();

    public void Enqueue(IPlayerConnection connection)
    {
        MatchSession? created = null;

        lock (_gate)
        {
            _waiting.Enqueue(connection);
            if (_waiting.Count >= 2)
            {
                IPlayerConnection p1 = _waiting.Dequeue();
                IPlayerConnection p2 = _waiting.Dequeue();
                string matchId = Guid.NewGuid().ToString("N");
                var seed = (uint)Random.Shared.Next();
                created = new MatchSession(matchId, p1, p2, seed);
            }
        }

        if (created is not null)
        {
            _active[created.MatchId] = created;
            // Fire-and-forget: a one-time, best-effort informational message.
            // Worst case if it's lost is the client never learns its slot and
            // falls back to non-predicted rendering (see PredictedMatch.ts) -
            // not worth blocking match creation on, or plumbing a logger into
            // MatchLobby for.
            _ = created.SendPlayerAssignmentsAsync();
        }
    }

    public void Remove(MatchSession session) => _active.TryRemove(session.MatchId, out _);
}
