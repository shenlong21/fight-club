using Microsoft.AspNetCore.SignalR;
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace Server.Hubs
{
    public class PlayerInfo
    {
        public string Id { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public string RoomId { get; set; } = string.Empty;
    }

    public class PlayerState
    {
        public string ConnectionId { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public float X { get; set; }
        public float Y { get; set; }
        public int Health { get; set; } = 100;
        public bool IsAttacking { get; set; }
        public string AttackType { get; set; } = string.Empty;
        public int Direction { get; set; } = 1;
        public string Color { get; set; } = string.Empty;
    }

    public class GameState
    {
        // Support N-number of players
        public ConcurrentDictionary<string, PlayerState> Players { get; set; } = new();
    }

    public class GameHub : Hub
    {
        private static readonly ConcurrentDictionary<string, PlayerInfo> RoomPlayers = new();
        private static readonly ConcurrentDictionary<string, GameState> Games = new();
        private static readonly string[] Colors = { "#ff007f", "#00f2fe", "#00ff00", "#ffaa00", "#aa00ff", "#ffff00", "#00ffff", "#ff00ff" };
        private static readonly Random Rnd = new Random();

        public async Task<IEnumerable<object>> JoinRoom(string roomId, string playerName)
        {
            var player = new PlayerInfo { Id = Context.ConnectionId, Name = playerName, RoomId = roomId };
            RoomPlayers[Context.ConnectionId] = player;
            
            await Groups.AddToGroupAsync(Context.ConnectionId, roomId);
            
            if (!Games.ContainsKey(roomId))
            {
                Games[roomId] = new GameState();
            }

            var game = Games[roomId];
            
            var newPlayer = new PlayerState 
            { 
                ConnectionId = Context.ConnectionId, 
                Name = playerName, 
                X = Rnd.Next(100, 700), 
                Y = 400, 
                Direction = Rnd.Next(0, 2) == 0 ? 1 : -1,
                Color = Colors[Rnd.Next(Colors.Length)]
            };
            
            game.Players[Context.ConnectionId] = newPlayer;

            await Clients.Group(roomId).SendAsync("PlayerJoined", Context.ConnectionId, playerName);
            await Clients.Group(roomId).SendAsync("GameStateUpdated", game);

            return RoomPlayers.Values
                .Where(p => p.RoomId == roomId)
                .Select(p => new { id = p.Id, name = p.Name });
        }

        public async Task HandleInput(string roomId, string inputType)
        {
            if (!Games.TryGetValue(roomId, out var game)) return;
            if (!game.Players.TryGetValue(Context.ConnectionId, out var current)) return;

            // Movement logic
            float speed = 25f;
            if (inputType == "left") { current.X -= speed; current.Direction = -1; }
            if (inputType == "right") { current.X += speed; current.Direction = 1; }

            if (current.X < 50) current.X = 50;
            if (current.X > 750) current.X = 750;

            if (inputType == "punch" || inputType == "kick")
            {
                current.IsAttacking = true;
                current.AttackType = inputType;

                // Hit detection against ALL other players
                foreach (var opponent in game.Players.Values)
                {
                    if (opponent.ConnectionId == current.ConnectionId) continue;
                    
                    float distance = Math.Abs(current.X - opponent.X);
                    bool facingOpponent = (current.Direction == 1 && opponent.X > current.X) || (current.Direction == -1 && opponent.X < current.X);
                    
                    if (distance < 90 && facingOpponent)
                    {
                        int damage = inputType == "punch" ? 5 : 10;
                        opponent.Health -= damage;
                        if (opponent.Health < 0) opponent.Health = 0;
                    }
                }
            }

            await Clients.Group(roomId).SendAsync("GameStateUpdated", game);
            
            if (current.IsAttacking)
            {
                await Task.Delay(150); // Fast snap back
                current.IsAttacking = false;
                await Clients.Group(roomId).SendAsync("GameStateUpdated", game);
            }
        }

        public async Task LeaveRoom(string roomId)
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, roomId);
            RemovePlayerFromGame(roomId, Context.ConnectionId);
        }

        public override async Task OnDisconnectedAsync(Exception? exception)
        {
            if (RoomPlayers.TryRemove(Context.ConnectionId, out var player))
            {
                await Clients.Group(player.RoomId).SendAsync("PlayerLeft", Context.ConnectionId, player.Name);
                RemovePlayerFromGame(player.RoomId, Context.ConnectionId);
            }
            await base.OnDisconnectedAsync(exception);
        }

        private void RemovePlayerFromGame(string roomId, string connectionId)
        {
            if (Games.TryGetValue(roomId, out var game))
            {
                game.Players.TryRemove(connectionId, out _);
                Clients.Group(roomId).SendAsync("GameStateUpdated", game);
            }
        }
    }
}
