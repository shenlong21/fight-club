import { decode, WIRE_SIZE } from "../sim/NetCodec.ts";
import type { MatchState } from "../sim/MatchState.ts";

export type ConnectionStatus = "connecting" | "waiting" | "in-match" | "disconnected";
export type PlayerSlot = 1 | 2;

/**
 * Thin wrapper around the WebSocket fallback transport - see
 * Server/Networking/WebSocketPlayerConnection.cs for the wire framing this
 * mirrors exactly. Outgoing messages are always a 3-byte PlayerInput frame
 * (sbyte MoveX, sbyte MoveZ, byte Buttons). Incoming messages are one of two
 * shapes, distinguished purely by length since there's no envelope byte:
 * a 1-byte player-assignment message (see MatchSession.SendPlayerAssignmentsAsync),
 * sent once per match, or a NetCodec.WIRE_SIZE-byte encoded MatchState,
 * sent every tick.
 *
 * This class only decodes and forwards - it doesn't predict or reconcile
 * anything itself. See Client/src/game/PredictedMatch.ts for that; it
 * consumes onState/onAssigned to run the local player's own input ahead of
 * the network round trip.
 */
export class ServerConnection {
  private socket: WebSocket | null = null;
  private status: ConnectionStatus = "connecting";
  private latestState: MatchState | null = null;
  private mySlot: PlayerSlot | null = null;

  onStatusChange: ((status: ConnectionStatus) => void) | null = null;
  onState: ((state: MatchState) => void) | null = null;
  onAssigned: ((slot: PlayerSlot) => void) | null = null;

  connect(url: string): void {
    const socket = new WebSocket(url);
    socket.binaryType = "arraybuffer";
    this.socket = socket;

    socket.addEventListener("open", () => this.setStatus("waiting"));
    socket.addEventListener("close", () => this.setStatus("disconnected"));
    socket.addEventListener("error", () => this.setStatus("disconnected"));
    socket.addEventListener("message", (event) => {
      const bytes = new Uint8Array(event.data as ArrayBuffer);

      if (bytes.length === 1) {
        const slot = bytes[0] as PlayerSlot;
        this.mySlot = slot;
        this.onAssigned?.(slot);
        return;
      }

      if (bytes.length !== WIRE_SIZE) return; // malformed/unexpected - drop rather than throw on an untrusted-ish transport

      const state = decode(bytes);
      this.latestState = state;

      // The server only ever broadcasts once MatchLobby has paired two
      // connections, so the first MatchState message is exactly the signal
      // that the match has actually started - there is no separate
      // "match started" message in the wire protocol today.
      if (this.status !== "in-match") this.setStatus("in-match");
      this.onState?.(state);
    });
  }

  disconnect(): void {
    this.socket?.close();
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  getMySlot(): PlayerSlot | null {
    return this.mySlot;
  }

  getLatestState(): MatchState | null {
    return this.latestState;
  }

  /** MoveX/MoveZ must already be clamped to -1/0/1 - see PlayerInput's own clamping in the sim for why. */
  sendInput(moveX: number, moveZ: number, buttons: number): void {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    const frame = new Uint8Array([moveX & 0xff, moveZ & 0xff, buttons & 0xff]);
    this.socket.send(frame);
  }

  private setStatus(status: ConnectionStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.onStatusChange?.(status);
  }
}
