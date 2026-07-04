using Server.Hubs;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSignalR();

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowClient", policy =>
    {
        policy.WithOrigins("http://localhost:5173")
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

var app = builder.Build();

app.UseCors("AllowClient");

app.MapHub<GameHub>("/gameHub");

app.MapGet("/", () => "Fight Club Server is running.");

app.Run();
