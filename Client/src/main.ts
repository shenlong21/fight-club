import './style.css'
import {
    Engine, Scene, TargetCamera, Vector3, HemisphericLight, MeshBuilder,
    StandardMaterial, Color3
} from '@babylonjs/core';

import { CombatCamera } from './game/CombatCamera.ts';
import { createFighter } from './game/createFighter.ts';
import { FighterView } from './game/FighterView.ts';
import type { ImpactEvent } from './game/FighterView.ts';
import { InputCapture } from './game/InputCapture.ts';
import { PredictedMatch } from './game/PredictedMatch.ts';
import { PlayerInput } from './sim/Input.ts';
import { MoveId } from './sim/FrameData.ts';
import { ServerConnection } from './net/ServerConnection.ts';
import type { ConnectionStatus } from './net/ServerConnection.ts';

// Derived from wherever the page itself was loaded from, not hardcoded to
// "localhost" - a machine on the network loads this page via the host's LAN
// IP/hostname (e.g. http://192.168.1.5:5173), and "localhost" from THAT
// machine's perspective means itself, not the host running the server. The
// game server always listens on a fixed port (see Server/Program.cs), only
// the host part needs to travel with wherever the page was fetched from.
const SERVER_PORT = 5252;
const SERVER_URL = `wss://${window.location.hostname}:${SERVER_PORT}/match`;
const INPUT_SEND_HZ = 60;

const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement;
const engine = new Engine(canvas, true);

const statusEl = document.getElementById('status') as HTMLDivElement;
const healthP1El = document.getElementById('healthP1') as HTMLDivElement;
const healthP2El = document.getElementById('healthP2') as HTMLDivElement;

const STATUS_MESSAGES: Record<ConnectionStatus, string> = {
    connecting: 'Connecting to server...',
    waiting: 'Waiting for opponent...',
    'in-match': '',
    disconnected: 'Disconnected from server',
};

const createScene = function () {
    const scene = new Scene(engine);

    // Dollies in/out based on fighter separation every render frame (see
    // CombatCamera.ts) - a fixed camera can't be both close enough for the
    // placeholder rigs' poses to be legible AND wide enough to never lose a
    // fighter who's walked away, so this isn't a fixed TargetCamera position.
    const camera = new TargetCamera("combatCamera", new Vector3(0, 2.1, -6.5), scene);
    camera.setTarget(new Vector3(0, 1.3, 0));
    // Intentionally omitted: camera.attachControl(canvas, true); to lock it in place.

    const light = new HemisphericLight("light", new Vector3(0, 1, 0), scene);
    light.intensity = 0.9;

    // Arena Floor (Octagon)
    const floorMaterial = new StandardMaterial("floorMat", scene);
    floorMaterial.diffuseColor = new Color3(0.4, 0.4, 0.4);

    const floor = MeshBuilder.CreateCylinder("floor", { diameter: 12, height: 0.2, tessellation: 8 }, scene);
    floor.position.y = -0.1; // Make top surface flush with y=0
    floor.material = floorMaterial;

    // Arena Cage (Bloody Roar vibe)
    const cageMaterial = new StandardMaterial("cageMat", scene);
    cageMaterial.diffuseColor = new Color3(0.5, 0.1, 0.1);
    cageMaterial.wireframe = true; // Gives an instant "chainlink fence" look

    const cage = MeshBuilder.CreateCylinder("cage", { diameter: 11.5, height: 4, tessellation: 8 }, scene);
    cage.position.y = 2; // Sit on the floor
    cage.material = cageMaterial;

    return { scene, camera };
};

const { scene, camera } = createScene();

// fighter_combined.glb (Mixamo base model + 36 merged animation clips - see
// PROGRESS.md) loaded once per fighter; ImportMeshAsync gives each its own
// independent meshes/materials/animation groups, so this is safe to await
// twice rather than loading once and cloning.
const [fighter1, fighter2] = await Promise.all([
    createFighter(scene, "Player1", new Vector3(-1.5, 0, 0)),
    createFighter(scene, "Player2", new Vector3(1.5, 0, 0)),
]);

const fighterView1 = new FighterView(fighter1);
const fighterView2 = new FighterView(fighter2);
const combatCamera = new CombatCamera(camera);

// --- Impact effects: hitstop + camera shake ---------------------------------
//
// Both are purely a client-side *presentation* effect - the underlying
// simulation (server tick, or the local prediction replaying against it)
// keeps running at full speed underneath. Only what gets drawn each frame
// freezes/shakes. That's deliberate: pausing the actual sim for hitstop
// would mean pausing GameLoopService server-side too (a much bigger, riskier
// change touching CombatCore's tested determinism), for a purely cosmetic
// payoff that a presentation-only freeze already delivers.

let hitstopUntilMs = 0;
let shakeMagnitude = 0;

function handleImpact(event: ImpactEvent): void {
    // Scale by how much stun the hit actually carries (HeavyPunch's 24
    // frames vs LightPunch's 12) so a heavy hit reads as heavier - clamped
    // so this never freezes long enough to feel unresponsive.
    const isBlocked = event.kind === MoveId.Blockstun;
    const severity = Math.min(1, event.stunFrames / 24);

    hitstopUntilMs = Math.max(hitstopUntilMs, performance.now() + (isBlocked ? 40 : 60 + severity * 60));
    shakeMagnitude = Math.max(shakeMagnitude, (isBlocked ? 0.05 : 0.15) + severity * 0.15);
}

fighterView1.onImpact = handleImpact;
fighterView2.onImpact = handleImpact;

// --- Networking -------------------------------------------------------------

const connection = new ServerConnection();
const predictedMatch = new PredictedMatch();

connection.onStatusChange = (status) => {
    statusEl.textContent = STATUS_MESSAGES[status];
};
connection.onAssigned = (slot) => predictedMatch.setMySlot(slot);
connection.onState = (state) => predictedMatch.onServerState(state);
connection.connect(SERVER_URL);

// Devtools/QA hook - lets you inspect the live networked MatchState and the
// locally-predicted one from the browser console
// (`__fightClub.connection.getLatestState()`) without wiring up a debugger
// session.
(window as unknown as { __fightClub: unknown }).__fightClub = { connection, predictedMatch };

// --- Input: sampled and sent at a fixed rate, independent of render rate ---
//
// Every sampled input is both sent to the server (unchanged) AND applied
// immediately to the local prediction, so the local player's own actions
// show up on screen this frame rather than after a network round trip.

const input = new InputCapture();
setInterval(() => {
    const { moveX, moveZ, buttons } = input.sample();
    connection.sendInput(moveX, moveZ, buttons);
    predictedMatch.applyLocalInput(new PlayerInput(moveX, moveZ, buttons));
}, 1000 / INPUT_SEND_HZ);

// --- Render loop -------------------------------------------------------------
//
// Prefer the locally-predicted state (instant response to the local
// player's own input); fall back to the raw last-broadcast state until
// prediction has what it needs (a slot assignment + a first broadcast to
// seed from) - see PredictedMatch's own doc comment for why this is a safe
// fallback rather than a half-working state.

engine.runRenderLoop(() => {
    const now = performance.now();
    const state = predictedMatch.getRenderState() ?? connection.getLatestState();

    if (state && now >= hitstopUntilMs) {
        fighterView1.update(state.player1);
        fighterView2.update(state.player2);
    }

    // Health bars update even during hitstop - the freeze is about the pose
    // reading as an impact, not about hiding/delaying the damage result.
    if (state) {
        healthP1El.style.width = `${Math.max(0, (state.player1.health / state.player1.maxHealth) * 100)}%`;
        healthP2El.style.width = `${Math.max(0, (state.player2.health / state.player2.maxHealth) * 100)}%`;
    }

    let shakeOffsetX = 0;
    let shakeOffsetY = 0;
    if (shakeMagnitude > 0.001) {
        shakeOffsetX = (Math.random() * 2 - 1) * shakeMagnitude;
        shakeOffsetY = (Math.random() * 2 - 1) * shakeMagnitude;
        shakeMagnitude *= 0.85;
    } else {
        shakeMagnitude = 0;
    }

    if (state) {
        // Framed on the fighters' eased render position (FighterView), not
        // the raw sim position - otherwise the camera would re-frame
        // instantly on a knockback while the character mesh is still easing
        // toward it, visibly detaching the two.
        combatCamera.update(fighterView1.getRenderedX(), fighterView2.getRenderedX(), shakeOffsetX, shakeOffsetY);
    }

    scene.render();
});

window.addEventListener('resize', () => {
    engine.resize();
});
