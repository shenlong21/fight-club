using System.Net.WebSockets;
using Microsoft.AspNetCore.Connections;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Server.Kestrel.Core;
using Server.Match;
using Server.Networking;

const int HttpsPort = 5252;

var builder = WebApplication.CreateBuilder(args);

builder.WebHost.ConfigureKestrel(options =>
{
    // WebTransport (HTTP/3 over QUIC) has no plaintext mode - TLS 1.3 is
    // mandatory, not optional. Binding a single HTTPS endpoint that speaks
    // HTTP/1.1 (the WebSocket fallback's Upgrade handshake), HTTP/2, and
    // HTTP/3 (WebTransport) means both transports share one certificate and
    // one port in local development. `UseHttps()` with no explicit
    // certificate picks up the ASP.NET Core HTTPS development certificate
    // (`dotnet dev-certs https --trust`) exactly the way the default
    // "https" launch profile does - no cert material is checked in.
    //
    // This is an explicit `Listen*` call rather than relying on `--urls` /
    // launchSettings.json, because Kestrel only negotiates HTTP/3 on
    // endpoints it knows are HTTPS at bind time; configuring protocols via
    // ConfigureEndpointDefaults does not reliably reach endpoints supplied
    // through ASPNETCORE_URLS.
    options.ListenLocalhost(HttpsPort, listenOptions =>
    {
        // Optional override: a real WebTransport client validates a
        // self-signed cert via `serverCertificateHashes` (a pinned SHA-256 of
        // the DER cert), and that pinning path is spec-required to reject
        // certs valid for more than ~2 weeks - the standard 1-year
        // `dotnet dev-certs` certificate fails that check with a generic
        // "CertificateUnknown" TLS alert from the client. For WebTransport
        // interop testing, generate a short-lived cert (see
        // ARCHITECTURE.md's "Local WebTransport testing" note) and point
        // Kestrel:CertPath/CertPassword at it; otherwise this falls back to
        // the normal long-lived ASP.NET Core HTTPS dev certificate, which is
        // what the WebSocket fallback and plain browser HTTPS use.
        string? certPath = builder.Configuration["Kestrel:CertPath"];
        if (certPath is not null)
        {
            listenOptions.UseHttps(certPath, builder.Configuration["Kestrel:CertPassword"]);
        }
        else
        {
            listenOptions.UseHttps();
        }

        listenOptions.Protocols = HttpProtocols.Http1AndHttp2AndHttp3;
    });
});

builder.Services.AddSingleton<MatchLobby>();
builder.Services.AddHostedService<GameLoopService>();

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowClient", policy =>
    {
        policy.WithOrigins("http://localhost:5173")
              .AllowAnyHeader()
              .AllowAnyMethod();
    });
});

var app = builder.Build();

app.UseCors("AllowClient");
app.UseWebSockets();

var lobby = app.Services.GetRequiredService<MatchLobby>();

app.MapGet("/", () => "Fight Club Server is running.");

// WebSocket fallback path - works everywhere today, no preview features
// required. See WebSocketPlayerConnection for the wire framing.
app.Map("/match", async context =>
{
    if (!context.WebSockets.IsWebSocketRequest)
    {
        context.Response.StatusCode = StatusCodes.Status400BadRequest;
        return;
    }

    using WebSocket socket = await context.WebSockets.AcceptWebSocketAsync();
    var connection = new WebSocketPlayerConnection(Guid.NewGuid().ToString("N"), socket);
    lobby.Enqueue(connection);
    await connection.RunAsync(context.RequestAborted);
});

// WebTransport path - preview, requires HTTP/3 plus the Kestrel experimental
// switch in Server.csproj. See WebTransportPlayerConnection for the
// stream-only limitation of Kestrel's current WebTransport implementation
// (no datagram API yet).
app.Map("/wt-match", async context =>
{
    IHttpWebTransportFeature? feature = context.Features.Get<IHttpWebTransportFeature>();
    if (feature is null || !feature.IsWebTransportRequest)
    {
        context.Response.StatusCode = StatusCodes.Status400BadRequest;
        return;
    }

    IWebTransportSession session = await feature.AcceptAsync(context.RequestAborted);
    ConnectionContext? stream = await session.AcceptStreamAsync(context.RequestAborted);
    if (stream is null)
    {
        context.Response.StatusCode = StatusCodes.Status400BadRequest;
        return;
    }

    var connection = new WebTransportPlayerConnection(Guid.NewGuid().ToString("N"), stream);
    lobby.Enqueue(connection);
    await connection.RunAsync(context.RequestAborted);
});

app.Run();
