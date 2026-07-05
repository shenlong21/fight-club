import { decode } from "../sim/NetCodec.ts";
import type { MatchState } from "../sim/MatchState.ts";

export type ConnectionStatus = "connecting" | "waiting" | "in-match" | "disconnected";

/**
 * Thin wrapper around the WebSocket fallback transport - see
 * Server/Networking/WebSocketPlayerConnection.cs for the wire framing this
 * mirrors exactly. Outgoing messages are always a 3-byte PlayerInput frame
 * (sbyte MoveX, sbyte MoveZ, byte Buttons); incoming messages are always a
 * NetCodec.WIRE_SIZE-byte encoded MatchState. There is no envelope beyond
 * that - each side already knows what to expect from the other, matching
 * the same "no framing overhead on the 60Hz path" reasoning as NetCodec
 * itself.
 *
 * This client does not predict or reconcile - it renders whatever MatchState
 * the server last broadcast, plain and authoritative. That is a deliberate
 * scope cut for this first vertical slice, not an oversight: local
 * prediction needs the TypeScript sim actually driving a speculative tick
 * plus a rollback/reconciliation strategy, which is follow-up work layered
 * on top of this connection, not a change to it.
 */
export class ServerConnection {
  private socket: WebSocket | null = null;
  private status: ConnectionStatus = "connecting";
  private latestState: MatchState | null = null;

  onStatusChange: ((status: ConnectionStatus) => void) | null = null;
  onState: ((state: MatchState) => void) | null = null;

  connect(url: string): void {
    const socket = new WebSocket(url);
    socket.binaryType = "arraybuffer";
    this.socket = socket;

    socket.addEventListener("open", () => this.setStatus("waiting"));
    socket.addEventListener("close", () => this.setStatus("disconnected"));
    socket.addEventListener("error", () => this.setStatus("disconnected"));
    socket.addEventListener("message", (event) => {
      const bytes = new Uint8Array(event.data as ArrayBuffer);
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
