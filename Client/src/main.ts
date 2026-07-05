import './style.css'
import {
    Engine, Scene, TargetCamera, Vector3, HemisphericLight, MeshBuilder,
    StandardMaterial, Color3
} from '@babylonjs/core';

import { createFighter } from './game/createFighter.ts';
import { FighterView } from './game/FighterView.ts';
import { InputCapture } from './game/InputCapture.ts';
import { ServerConnection } from './net/ServerConnection.ts';
import type { ConnectionStatus } from './net/ServerConnection.ts';

const SERVER_URL = 'wss://localhost:5252/match';
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

    // Fixed Camera pointing at the center
    const camera = new TargetCamera("fixedCamera", new Vector3(0, 3, -11), scene);
    camera.setTarget(new Vector3(0, 1.5, 0));
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

    return scene;
};

const scene = createScene();

// Placeholder rigs - see createFighter.ts for why these are jointed boxes,
// not real character models, for this first vertical slice.
const fighter1 = createFighter(scene, "Player1", new Vector3(-1.5, 0, 0), new Color3(0.8, 0.2, 0.2));
const fighter2 = createFighter(scene, "Player2", new Vector3(1.5, 0, 0), new Color3(0.2, 0.2, 0.8));

const fighterView1 = new FighterView(scene, fighter1, new Color3(0.8, 0.2, 0.2));
const fighterView2 = new FighterView(scene, fighter2, new Color3(0.2, 0.2, 0.8));

// --- Networking -------------------------------------------------------------

const connection = new ServerConnection();
connection.onStatusChange = (status) => {
    statusEl.textContent = STATUS_MESSAGES[status];
};
connection.connect(SERVER_URL);

// Devtools/QA hook - lets you inspect the live networked MatchState from the
// browser console (`__fightClub.connection.getLatestState()`) without
// wiring up a debugger session.
(window as unknown as { __fightClub: unknown }).__fightClub = { connection };

// --- Input: sampled and sent at a fixed rate, independent of render rate ---

const input = new InputCapture();
setInterval(() => {
    const { moveX, moveZ, buttons } = input.sample();
    connection.sendInput(moveX, moveZ, buttons);
}, 1000 / INPUT_SEND_HZ);

// --- Render loop: always just reflects the latest server-authoritative state ---

engine.runRenderLoop(() => {
    const state = connection.getLatestState();
    if (state) {
        fighterView1.update(state.player1);
        fighterView2.update(state.player2);

        healthP1El.style.width = `${Math.max(0, (state.player1.health / state.player1.maxHealth) * 100)}%`;
        healthP2El.style.width = `${Math.max(0, (state.player2.health / state.player2.maxHealth) * 100)}%`;
    }

    scene.render();
});

window.addEventListener('resize', () => {
    engine.resize();
});
