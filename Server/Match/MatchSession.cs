using CombatCore;
using Server.Networking;

namespace Server.Match;

/// <summary>
/// One live 1v1 match: the authoritative MatchState, each player's input
/// history, and the two IPlayerConnections carrying bytes to/from them.
/// GameLoopService ticks every active MatchSession once per 60Hz frame; all
/// of the actual rules live in CombatCore.CombatSimulation.Tick, which this
/// class does not reimplement or duplicate - that single call is the entire
/// authority boundary between "server truth" and everything else, by design
/// (see ARCHITECTURE.md's rollback section).
/// </summary>
public sealed class MatchSession
{
    private readonly InputHistory _p1History = new();
    private readonly InputHistory _p2History = new();

    // Reused every tick instead of allocating a new byte[] per broadcast -
    // this runs at 60Hz for every active match, so a per-tick allocation here
    // would be exactly the kind of hot-path garbage AGENTS.md rules out.
    private readonly byte[] _broadcastBuffer = new byte[NetCodec.WireSize];

    public string MatchId { get; }
    public IPlayerConnection Player1Connection { get; }
    public IPlayerConnection Player2Connection { get; }
    public MatchState State { get; private set; }
    public bool IsComplete => State.Phase == MatchPhase.RoundEnd;

    public MatchSession(string matchId, IPlayerConnection player1, IPlayerConnection player2, uint rngSeed)
    {
        MatchId = matchId;
        Player1Connection = player1;
        Player2Connection = player2;
        State = MatchState.CreateInitial(rngSeed);

        // Keyed by "the frame about to be simulated" (State.FrameNumber at the
        // moment the input arrives), which TickAsync below reads with the
        // same key before advancing the state - so an input that arrives
        // between tick N and tick N+1 is recorded against N and gets
        // consumed by the tick that produces N+1, matching InputHistory's
        // GetOrPredict/Set contract exactly.
        player1.InputReceived += input => _p1History.Set(State.FrameNumber, input);
        player2.InputReceived += input => _p2History.Set(State.FrameNumber, input);
    }

    /// <summary>
    /// Tells each connection which PlayerState slot is theirs (1 or 2, as a
    /// single raw byte - not a MatchState broadcast, distinguished purely by
    /// length on the client). The wire protocol otherwise never says this:
    /// MatchState is symmetric, and the client needs to know which half of
    /// it to predict locally versus just render from the server (see
    /// Client/src/game/PredictedMatch.ts). Sent once, right when the match
    /// is created, before any tick broadcasts - so it isn't tied to
    /// TickAsync and doesn't need to be re-sent.
    /// </summary>
    public Task SendPlayerAssignmentsAsync(CancellationToken ct = default) =>
        Task.WhenAll(
            Player1Connection.SendReliableAsync(new byte[] { 1 }, ct),
            Player2Connection.SendReliableAsync(new byte[] { 2 }, ct));

    /// <summary>
    /// Advances the match by exactly one 16.6ms frame using whatever real or
    /// predicted input each player's history has for the frame about to be
    /// simulated, then broadcasts the resulting confirmed state to both
    /// players. Called once per tick by GameLoopService - never concurrently
    /// with itself for the same session.
    /// </summary>
    public async Task TickAsync(CancellationToken ct)
    {
        MatchState current = State;
        (PlayerInput p1Input, _) = _p1History.GetOrPredict(current.FrameNumber);
        (PlayerInput p2Input, _) = _p2History.GetOrPredict(current.FrameNumber);

        current = CombatSimulation.Tick(in current, p1Input, p2Input);
        State = current;
        NetCodec.Encode(in current, _broadcastBuffer);

        await Task.WhenAll(
            Player1Connection.SendStateAsync(_broadcastBuffer, ct),
            Player2Connection.SendStateAsync(_broadcastBuffer, ct));
    }
}
