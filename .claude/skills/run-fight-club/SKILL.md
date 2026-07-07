---
name: run-fight-club
description: Build, run, and drive the Fight Club game (Server + Client) for agent-driven testing. Use when asked to start the server/client, take a screenshot of the game, check that a movement/animation/combat change actually works, or drive a live two-player match.
---

Fight Club is a networked 2-player fighting game: an ASP.NET Core `Server`
(WebSocket/WebTransport, ticks the authoritative sim at 60Hz) and a
Babylon.js/TypeScript `Client` (Vite). "Running the app" means both
processes plus a browser driving the client - there is no single binary.

For agent/automated use, drive it via the Playwright driver at
`.claude/skills/run-fight-club/driver.mjs`. It opens **two** independent
browser contexts (simulating the two networked players) against the Vite
dev server - that's the whole point of this game, so the driver always
launches both at once.

All paths below are relative to the repo root.

## Prerequisites

```bash
cd .claude/skills/run-fight-club && npm install   # playwright-core
npx playwright install chromium                    # once, if not already installed
```

Also needs the ASP.NET Core dev certificate trusted once (`dotnet dev-certs
https --trust`) - see the root `README.md` if `wss://` connections fail.

## Build / start the app

```bash
# Terminal 1
cd Server && dotnet run

# Terminal 2
cd Client && npm run dev
```

Server listens on `https://localhost:5252` (WebSocket at `/match`,
WebTransport preview at `/wt-match`). Client dev server is Vite, normally
`http://localhost:5173` (falls back to another port if busy - check the
`npm run dev` output and set `CLIENT_URL` below if it did).

Nothing needs building beyond that - the server is a normal `dotnet run`,
the client is served straight from source by Vite.

## Run (agent path)

The driver has two modes:

**Script mode** (preferred for one-shot checks - no interactive terminal
multiplexer needed, works the same on Windows/macOS/Linux):

```bash
cd .claude/skills/run-fight-club
cat > /tmp/check.txt <<'EOF'
launch
hold 1 ArrowRight 700
down 1 KeyZ
down 1 KeyX
wait 500
up 1 KeyZ
up 1 KeyX
wait 300
state 1
health
ss result
EOF
node driver.mjs /tmp/check.txt
```

Runs every line as a command, in order, then exits. Screenshots land in
`.claude/skills/run-fight-club/shots/` (override: `SCREENSHOT_DIR`).

**REPL mode** (interactive - if you have tmux available):

```bash
node driver.mjs   # no script arg = REPL over stdin
```

```bash
tmux new-session -d -s fc -x 200 -y 50
tmux send-keys -t fc 'cd .claude/skills/run-fight-club && node driver.mjs' Enter
timeout 20 bash -c 'until tmux capture-pane -t fc -p | grep -q "driver>"; do sleep 0.3; done'
tmux send-keys -t fc 'launch' Enter
timeout 15 bash -c 'until tmux capture-pane -t fc -p | grep -q "launched"; do sleep 0.3; done'
tmux send-keys -t fc 'ss landing' Enter
tmux capture-pane -t fc -p
```

If the client dev server isn't on the default port, set `CLIENT_URL`:
`CLIENT_URL=http://localhost:5174/ node driver.mjs ...`

### Commands

| command | what it does |
|---|---|
| `launch` | open 2 browser contexts, navigate both to `CLIENT_URL` |
| `ss [name]` | screenshot both players → `shots/<name>-p1.png` / `-p2.png` |
| `down <n> <key>` / `up <n> <key>` | key down/up for player `n` (1 or 2) |
| `press <n> <key>` | quick tap |
| `hold <n> <key> <ms>` | down, wait, up - for movement bursts |
| `wait <ms>` | just wait |
| `state <n>` | print the real decoded `MatchState` for player `n` (position, facing, currentMove, moveFrame, health, beast) - via the `window.__fightClub` debug hook in `main.ts`, not just the DOM |
| `status <n>` | print the `#status` HUD text (connecting/waiting/empty=in-match) |
| `health` | print both health bar CSS widths |
| `console <n>` | print any captured browser console errors for player `n` |
| `eval <n> <js>` | evaluate arbitrary JS in that page, print the JSON result |
| `quit` | close the browser |

Keys are Playwright key names: `ArrowLeft`, `ArrowRight`, `ArrowUp`,
`ArrowDown`, `KeyZ` (Punch), `KeyX` (Kick - held with Punch = HeavyPunch),
`KeyC` (Block), `KeyV` (Beast toggle, not implemented server-side yet).

## Run (human path)

```bash
cd Server && dotnet run
cd Client && npm run dev
```

Open `http://localhost:5173` in two browser tabs/windows/machines.

## Gotchas

- **No tmux on Windows.** Use script mode there - it's not just a fallback,
  it's arguably the better fit for one-shot agent checks anyway (no risk of
  stdin closing mid-command, which the REPL mode has to guard against
  explicitly - see the comment above the REPL's `queue` variable in
  `driver.mjs`).
- **`MatchLobby` pairs the first two connections it sees, FIFO.** If a
  previous driver run didn't cleanly `quit()` (crashed instead), its
  still-open sockets may still be sitting in the server's queue/an active
  match, and a fresh `launch` can pair with a leftover connection instead of
  its own second page - symptom: `status 1` reads `""` (in-match) instantly,
  before player 2 even connects. Restart the server if a run behaves
  unexpectedly right after a crashed one.
- **Punch/kick hitboxes have a valid range band, not just "close enough."**
  Walking in too far (near point-blank) makes the hitbox overshoot past the
  defender and whiff, same as walking in too little. If a `hold ArrowRight`
  script whiffs, that's very likely spacing, not a bug - see
  `CombatCore/MoveTable.cs`'s hitbox offsets, or just poll `state <n>` in a
  loop and stop movement once the gap looks right instead of guessing a
  fixed hold duration.
- **The server is `wss://`-only** (Kestrel binds HTTPS even for the
  WebSocket fallback) - `ignoreHTTPSErrors: true` on the browser context
  (already set in `driver.mjs`) is what makes this work without needing the
  dev cert trusted inside the driver's own Chromium instance.

## Troubleshooting

- **`ERROR: player 1 not launched`**: run `launch` first, or (script mode)
  check the earlier lines in your script for an error that stopped it short.
- **`state <n>` returns `null`**: no `MatchState` has been decoded yet -
  either still waiting for a second player (`launch` only opens 2, so this
  usually means the WebSocket itself failed; check `console <n>`), or you
  called it before the pairing broadcast arrived (add a `wait 500` after
  `launch`).
- **Browser install missing**: `npx playwright install chromium`.
