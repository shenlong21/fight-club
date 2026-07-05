namespace Server.Match;

/// <summary>
/// The headless, fixed-timestep authority for every active match. Runs at
/// ~60Hz (16.6ms) using a drift-corrected accumulator rather than a plain
/// "await Task.Delay(16) in a loop", so a slow tick (a GC pause, a burst of
/// new connections) doesn't compound into permanent lag relative to
/// wall-clock time - a missed tick is caught up on the next iteration
/// instead of quietly pushing every future tick later forever.
/// </summary>
public sealed class GameLoopService : BackgroundService
{
    private static readonly TimeSpan TickInterval = TimeSpan.FromSeconds(1.0 / 60.0);

    private readonly MatchLobby _lobby;
    private readonly ILogger<GameLoopService> _logger;

    public GameLoopService(MatchLobby lobby, ILogger<GameLoopService> logger)
    {
        _lobby = lobby;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        DateTime nextTick = DateTime.UtcNow;

        while (!stoppingToken.IsCancellationRequested)
        {
            nextTick += TickInterval;

            foreach (MatchSession session in _lobby.ActiveSessions)
            {
                try
                {
                    await session.TickAsync(stoppingToken);
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    _logger.LogError(ex, "Match {MatchId} faulted mid-tick; removing it.", session.MatchId);
                    _lobby.Remove(session);
                    continue;
                }

                if (session.IsComplete) _lobby.Remove(session);
            }

            TimeSpan delay = nextTick - DateTime.UtcNow;
            if (delay > TimeSpan.Zero)
            {
                await Task.Delay(delay, stoppingToken);
            }
            else
            {
                // Fell behind by more than one full tick - resync to now
                // instead of trying to burn through a backlog of ticks
                // instantly, which would just spike CPU and make things worse.
                nextTick = DateTime.UtcNow;
            }
        }
    }
}
