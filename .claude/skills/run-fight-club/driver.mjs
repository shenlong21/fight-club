// REPL driver for the Fight Club client. Launches two independent browser
// contexts (simulating two networked players) against the Vite dev server,
// and exposes stdin commands to drive keyboard input and inspect live game
// state - both the rendered DOM (health bars, status line) and the raw
// decoded MatchState via the `window.__fightClub` debug hook in main.ts.
//
// Designed for agents: run it, pipe/type commands, read the output. Also
// usable under tmux for interactive iteration (send-keys one command at a
// time, capture-pane the result) - see SKILL.md.
import { chromium } from "playwright-core";
import * as readline from "node:readline";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173/";
const SHOT_DIR = process.env.SCREENSHOT_DIR || path.join(__dirname, "shots");
fs.mkdirSync(SHOT_DIR, { recursive: true });

let browser = null;
let contexts = []; // [ctx1, ctx2]
let pages = [];    // [page1, page2] - 1-indexed access via pageFor()
const consoleErrors = [[], []];

function pageFor(n) {
  const idx = Number(n) - 1;
  const page = pages[idx];
  if (!page) throw new Error(`player ${n} not launched - run "launch" first`);
  return page;
}

const COMMANDS = {
  async launch() {
    if (browser) return console.log("already launched");
    browser = await chromium.launch({ args: ["--no-sandbox", "--ignore-certificate-errors"] });
    contexts = [
      await browser.newContext({ ignoreHTTPSErrors: true }),
      await browser.newContext({ ignoreHTTPSErrors: true }),
    ];
    pages = [];
    for (let i = 0; i < 2; i++) {
      const page = await contexts[i].newPage();
      page.on("console", (msg) => { if (msg.type() === "error") consoleErrors[i].push(msg.text()); });
      page.on("pageerror", (err) => consoleErrors[i].push(`pageerror: ${err.message}`));
      pages.push(page);
    }
    await Promise.all(pages.map((p) => p.goto(CLIENT_URL)));
    console.log(`launched. 2 players navigated to ${CLIENT_URL}`);
  },

  async ss(name) {
    const label = name || `ss-${Date.now()}`;
    for (let i = 0; i < pages.length; i++) {
      if (!pages[i]) continue;
      const f = path.join(SHOT_DIR, `${label}-p${i + 1}.png`);
      await pages[i].screenshot({ path: f });
      console.log("screenshot:", f);
    }
  },

  async down(n, key) { await pageFor(n).keyboard.down(key); console.log(`p${n} down ${key}`); },
  async up(n, key) { await pageFor(n).keyboard.up(key); console.log(`p${n} up ${key}`); },
  async press(n, key) { await pageFor(n).keyboard.press(key); console.log(`p${n} press ${key}`); },

  // Convenience for movement bursts: hold a key for <ms> then release.
  async hold(n, key, ms) {
    const page = pageFor(n);
    await page.keyboard.down(key);
    await new Promise((r) => setTimeout(r, Number(ms) || 500));
    await page.keyboard.up(key);
    console.log(`p${n} held ${key} for ${ms}ms`);
  },

  async wait(ms) {
    await new Promise((r) => setTimeout(r, Number(ms) || 500));
  },

  async status(n) {
    const text = await pageFor(n).locator("#status").innerText();
    console.log(`p${n} status:`, JSON.stringify(text));
  },

  async health() {
    const page = pages[0] || pages[1];
    if (!page) return console.log("ERROR: launch first");
    const widths = await page.evaluate(() => ({
      p1: document.getElementById("healthP1")?.style.width,
      p2: document.getElementById("healthP2")?.style.width,
    }));
    console.log("health:", widths);
  },

  // Raw decoded MatchState via the window.__fightClub debug hook (see main.ts).
  async state(n) {
    const state = await pageFor(n).evaluate(() => {
      const s = window.__fightClub?.connection?.getLatestState?.();
      if (!s) return null;
      const p = (ps) => ({
        x: ps.position.x.toFloat(),
        z: ps.position.z.toFloat(),
        facing: ps.facingSign,
        move: ps.currentMove,
        moveFrame: ps.moveFrame,
        hp: ps.health,
        beast: ps.isBeastForm,
      });
      return { frame: s.frameNumber, phase: s.phase, player1: p(s.player1), player2: p(s.player2) };
    });
    console.log(`p${n} state:`, JSON.stringify(state));
  },

  async eval(n, ...exprParts) {
    const expr = exprParts.join(" ");
    try {
      console.log(JSON.stringify(await pageFor(n).evaluate(expr)));
    } catch (e) {
      console.log("ERROR:", e.message);
    }
  },

  async console(n) {
    console.log(`p${n} console errors:`, JSON.stringify(consoleErrors[Number(n) - 1] || []));
  },

  async quit() {
    if (browser) await browser.close().catch(() => {});
    browser = null; contexts = []; pages = [];
  },

  help() {
    console.log("commands:", Object.keys(COMMANDS).join(", "));
    console.log("player args (n) are 1 or 2. keys are Playwright key names: ArrowLeft, ArrowRight, ArrowUp, ArrowDown, KeyZ, KeyX, KeyC, KeyV.");
  },
};

async function runCommandLine(line) {
  const [cmd, ...rest] = line.trim().split(/\s+/);
  if (!cmd || cmd.startsWith("#")) return;
  const fn = COMMANDS[cmd];
  if (!fn) { console.log("unknown:", cmd, "- try: help"); return; }
  try { await fn(...rest); } catch (e) { console.log("ERROR:", e.message); }
}

const scriptPath = process.argv[2];

if (scriptPath) {
  // Script mode: read commands from a file, one per line, run them serially,
  // exit when done. This is the mode to use here - there's no tmux on
  // Windows for the interactive REPL-under-a-multiplexer pattern the
  // driver.mjs skeleton this is based on assumes, and a script file is
  // arguably a better fit for non-interactive agent use anyway (no risk of
  // stdin closing mid-command - see the REPL mode's own history of that bug).
  const lines = fs.readFileSync(scriptPath, "utf-8").split("\n");
  (async () => {
    for (const line of lines) await runCommandLine(line);
    await COMMANDS.quit();
  })();
} else {
  // REPL mode: for interactive use (a human's own terminal, or tmux
  // send-keys on a platform that has it).
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: "driver> " });

  // Lines can arrive faster than a command finishes (e.g. several send-keys
  // in quick succession) - readline emits "line" synchronously per line as
  // it parses a chunk, it does NOT wait for an async listener to resolve
  // before emitting the next one. Chaining onto a single running promise
  // serializes them regardless of arrival timing.
  let queue = Promise.resolve();

  rl.on("line", (line) => {
    queue = queue.then(async () => {
      await runCommandLine(line);
      const cmd = line.trim().split(/\s+/)[0];
      if (cmd === "quit") { rl.close(); process.exit(0); return; }
      rl.prompt();
    });
  });
  // Wait for any already-queued commands to actually finish before quitting -
  // stdin can hit EOF while the queue is still working through earlier
  // commands like "launch".
  rl.on("close", async () => {
    await queue.catch(() => {});
    await COMMANDS.quit();
    process.exit(0);
  });

  console.log("Fight Club driver - \"help\" for commands, \"launch\" to start (2 players)");
  rl.prompt();
}
