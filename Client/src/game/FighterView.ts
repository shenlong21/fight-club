import { Color3, Scene } from "@babylonjs/core";
import { MoveId } from "../sim/FrameData.ts";
import type { PlayerState } from "../sim/PlayerState.ts";
import type { Fighter } from "./createFighter.ts";
import { playKick, playPunch } from "./createFighter.ts";

/**
 * Drives one placeholder fighter rig from a networked, server-authoritative
 * PlayerState every render frame. There is no local prediction here (see
 * ServerConnection's doc comment) - this just renders whatever the server
 * last said was true, snapping position/facing directly rather than
 * interpolating. Good enough for a first vertical slice on a LAN-local
 * connection; interpolation/prediction is follow-up work once the network
 * path is proven correct.
 */
export class FighterView {
  private lastRenderedMove: number = MoveId.Idle;
  private readonly scene: Scene;
  private readonly fighter: Fighter;
  private readonly baseColor: Color3;

  constructor(scene: Scene, fighter: Fighter, baseColor: Color3) {
    this.scene = scene;
    this.fighter = fighter;
    this.baseColor = baseColor;
  }

  update(state: PlayerState): void {
    const root = this.fighter.root;
    root.position.x = state.position.x.toFloat();
    root.position.z = state.position.z.toFloat();
    root.rotation.y = state.facingSign > 0 ? Math.PI / 2 : -Math.PI / 2;

    // Fall-over pose for a knockout - simple, readable placeholder feedback
    // that doesn't need a real animation rig to communicate "this fighter is
    // down."
    root.rotation.z = state.health <= 0 ? Math.PI / 2 : 0;

    this.applyTint(state);
    this.triggerAttackAnimationOnEdge(state);
    this.lastRenderedMove = state.currentMove;
  }

  private applyTint(state: PlayerState): void {
    let color = this.baseColor;

    if (state.health <= 0) {
      color = new Color3(0.25, 0.25, 0.25);
    } else if (state.currentMove === MoveId.Hitstun) {
      color = new Color3(1, 1, 1);
    } else if (state.currentMove === MoveId.Blockstun) {
      color = new Color3(0.2, 0.9, 0.9);
    } else if (state.isBeastForm) {
      color = new Color3(1, 0.55, 0);
    }

    this.fighter.setTint(color);
  }

  private triggerAttackAnimationOnEdge(state: PlayerState): void {
    if (state.moveFrame !== 0 || state.currentMove === this.lastRenderedMove) return;

    // Purely cosmetic distinction between the two attacks so they don't look
    // identical on screen - LightPunch swings an arm, HeavyPunch swings a leg.
    if (state.currentMove === MoveId.LightPunch) {
      playPunch(this.scene, this.fighter);
    } else if (state.currentMove === MoveId.HeavyPunch) {
      playKick(this.scene, this.fighter);
    }
  }
}
