import Peer, { DataConnection } from 'peerjs';
import { PieceColor, Move } from '../engine/chess.ts';
import { ArenaId } from '../audio/soundEngine.ts';

export type MultiplayerRole = 'host' | 'guest';

export interface RemoteMovePayload {
  from: number;
  to: number;
  promotion?: string;
  san?: string;
  fen?: string;
}

export interface RoomStatePayload {
  fen: string;
  activeTurn: PieceColor;
  hostColor: PieceColor;
  guestColor: PieceColor;
  hostName: string;
  guestName: string;
  arena: ArenaId;
  whiteTime: number;
  blackTime: number;
}

export interface MultiplayerMessage {
  id: string;
  type:
    | 'JOIN'
    | 'JOIN_ACK'
    | 'STATE_SYNC'
    | 'MOVE'
    | 'DRAW_OFFER'
    | 'DRAW_ACCEPT'
    | 'DRAW_DECLINE'
    | 'RESIGN'
    | 'REMATCH'
    | 'ARENA_CHANGE';
  payload?: any;
  senderRole: MultiplayerRole;
  timestamp: number;
}

/** Piece materials agreed when the guest joins. `changed` is true when the guest's pick clashed with the host's and was swapped. */
export interface MaterialInfo {
  mine?: string;
  theirs?: string;
  changed?: boolean;
}

/** The guest may not use the host's piece material; this picks a clearly different one instead. */
export function contrastingMaterial(hostMaterial: string): string {
  return hostMaterial === 'obsidian' ? 'marble' : 'obsidian';
}

export interface MultiplayerCallbacks {
  onConnected?: (peerName: string, role: MultiplayerRole, assignedColor: PieceColor, materials?: MaterialInfo) => void;
  onDisconnected?: () => void;
  onMoveReceived?: (move: RemoteMovePayload) => void;
  onStateSync?: (state: RoomStatePayload) => void;
  onDrawOfferReceived?: () => void;
  onDrawAcceptReceived?: () => void;
  onDrawDeclineReceived?: () => void;
  onResignReceived?: (color: PieceColor) => void;
  onRematchReceived?: () => void;
  onArenaChangeReceived?: (arena: ArenaId) => void;
  onError?: (err: string) => void;
}

export class OnlineMultiplayerManager {
  private peer: Peer | null = null;
  private connection: DataConnection | null = null;
  private broadcastChannel: BroadcastChannel | null = null;
  private processedMessageIds: Set<string> = new Set();

  public role: MultiplayerRole = 'host';
  public roomCode: string = '';
  public isConnected: boolean = false;
  public myColor: PieceColor = 'w';
  public opponentName: string = 'Friend';
  /** This player's piece material (sent to the other side on join). */
  public myMaterial: string | undefined;
  public callbacks: MultiplayerCallbacks = {};

  constructor(callbacks?: MultiplayerCallbacks) {
    if (callbacks) {
      this.callbacks = callbacks;
    }
  }

  // Generates formatted 6-char room code: e.g. "CW-8492"
  public static generateRoomCode(): string {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let code = 'CW-';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  private getSanitizedPeerId(roomCode: string): string {
    const clean = roomCode.toUpperCase().replace(/[^A-Z0-9]/g, '');
    return `cw-room-${clean}`;
  }

  // Host creates an online room
  public async createRoom(
    roomCode: string,
    hostColorPref: 'w' | 'b' | 'random',
    hostName: string,
    hostMaterial?: string
  ): Promise<string> {
    this.disconnect();
    this.myMaterial = hostMaterial;
    this.role = 'host';
    this.roomCode = roomCode;

    // Determine host color
    if (hostColorPref === 'random') {
      this.myColor = Math.random() < 0.5 ? 'w' : 'b';
    } else {
      this.myColor = hostColorPref;
    }

    const hostPeerId = this.getSanitizedPeerId(roomCode);

    // Setup local BroadcastChannel for instant same-browser / cross-tab testing
    this.setupBroadcastChannel(roomCode, hostName);

    return new Promise((resolve, reject) => {
      try {
        const peer = new Peer(hostPeerId, {
          debug: 1,
          config: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' },
            ],
          },
        });

        this.peer = peer;

        peer.on('open', id => {
          resolve(id);
        });

        peer.on('connection', conn => {
          this.connection = conn;
          this.setupConnection(conn, hostName);
        });

        peer.on('error', err => {
          // If ID is already taken on cloud, we can still fall back or report
          if (err.type === 'unavailable-id') {
            // Already created or retry
            resolve(hostPeerId);
          } else {
            this.callbacks.onError?.(err.message || 'Peer connection error');
            reject(err);
          }
        });
      } catch (err: any) {
        // Fallback to BroadcastChannel alone if WebRTC blocked in restricted environment
        resolve(hostPeerId);
      }
    });
  }

  // Guest joins an existing room by code
  public async joinRoom(roomCode: string, guestName: string, guestMaterial?: string): Promise<boolean> {
    this.disconnect();
    this.myMaterial = guestMaterial;
    this.role = 'guest';
    this.roomCode = roomCode.trim().toUpperCase();

    const hostPeerId = this.getSanitizedPeerId(this.roomCode);

    // Setup BroadcastChannel for instant local testing
    this.setupBroadcastChannel(this.roomCode, guestName);

    // Broadcast JOIN message locally immediately
    this.broadcastMessage({
      id: this.generateMsgId(),
      type: 'JOIN',
      payload: { guestName, guestMaterial: this.myMaterial },
      senderRole: 'guest',
      timestamp: Date.now(),
    });

    return new Promise((resolve) => {
      try {
        const guestPeer = new Peer({
          debug: 1,
          config: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' },
            ],
          },
        });

        this.peer = guestPeer;

        guestPeer.on('open', () => {
          const conn = guestPeer.connect(hostPeerId, {
            reliable: true,
          });

          this.connection = conn;

          conn.on('open', () => {
            this.setupConnection(conn, guestName);
            // Send JOIN message through WebRTC
            this.sendMessage({
              id: this.generateMsgId(),
              type: 'JOIN',
              payload: { guestName, guestMaterial: this.myMaterial },
              senderRole: 'guest',
              timestamp: Date.now(),
            });
            resolve(true);
          });

          conn.on('error', () => {
            resolve(true); // Still allow BroadcastChannel to handle if on same device
          });
        });

        guestPeer.on('error', () => {
          resolve(true);
        });

        // Timeout fallback
        setTimeout(() => {
          resolve(true);
        }, 2000);
      } catch {
        resolve(true);
      }
    });
  }

  private setupBroadcastChannel(roomCode: string, myName: string) {
    if (typeof BroadcastChannel === 'undefined') return;

    try {
      this.broadcastChannel = new BroadcastChannel(`chessworld_${roomCode}`);
      this.broadcastChannel.onmessage = (event) => {
        const msg = event.data as MultiplayerMessage;
        this.handleIncomingMessage(msg, myName);
      };
    } catch {
      // Ignored if unavailable
    }
  }

  private setupConnection(conn: DataConnection, myName: string) {
    conn.on('data', data => {
      const msg = data as MultiplayerMessage;
      this.handleIncomingMessage(msg, myName);
    });

    conn.on('close', () => {
      this.isConnected = false;
      this.callbacks.onDisconnected?.();
    });
  }

  private handleIncomingMessage(msg: MultiplayerMessage, myName: string) {
    if (!msg || !msg.id || this.processedMessageIds.has(msg.id)) return;
    this.processedMessageIds.add(msg.id);

    // Prevent echoing own messages
    if (msg.senderRole === this.role) return;

    switch (msg.type) {
      case 'JOIN': {
        if (this.role === 'host') {
          this.isConnected = true;
          this.opponentName = msg.payload?.guestName || 'Player 2';
          const guestColor = this.myColor === 'w' ? 'b' : 'w';
          // The guest picks their own pieces, but not the host's.
          const asked: string | undefined = msg.payload?.guestMaterial;
          const clash = !!asked && !!this.myMaterial && asked === this.myMaterial;
          const guestMaterial = clash ? contrastingMaterial(this.myMaterial!) : asked;

          // Acknowledge join and assign colors
          this.broadcastMessage({
            id: this.generateMsgId(),
            type: 'JOIN_ACK',
            payload: {
              hostName: myName,
              hostColor: this.myColor,
              guestColor,
              hostMaterial: this.myMaterial,
              guestMaterial,
              materialChanged: clash,
            },
            senderRole: 'host',
            timestamp: Date.now(),
          });

          this.callbacks.onConnected?.(this.opponentName, 'host', this.myColor, { mine: this.myMaterial, theirs: guestMaterial });
        }
        break;
      }

      case 'JOIN_ACK': {
        if (this.role === 'guest') {
          this.isConnected = true;
          this.opponentName = msg.payload?.hostName || 'Host';
          this.myColor = msg.payload?.guestColor || 'b';
          if (msg.payload?.guestMaterial) this.myMaterial = msg.payload.guestMaterial;
          this.callbacks.onConnected?.(this.opponentName, 'guest', this.myColor, {
            mine: this.myMaterial,
            theirs: msg.payload?.hostMaterial,
            changed: !!msg.payload?.materialChanged,
          });
        }
        break;
      }

      case 'STATE_SYNC': {
        if (msg.payload) {
          this.callbacks.onStateSync?.(msg.payload);
        }
        break;
      }

      case 'MOVE': {
        if (msg.payload) {
          this.callbacks.onMoveReceived?.(msg.payload);
        }
        break;
      }

      case 'DRAW_OFFER': {
        this.callbacks.onDrawOfferReceived?.();
        break;
      }

      case 'DRAW_ACCEPT': {
        this.callbacks.onDrawAcceptReceived?.();
        break;
      }

      case 'DRAW_DECLINE': {
        this.callbacks.onDrawDeclineReceived?.();
        break;
      }

      case 'RESIGN': {
        this.callbacks.onResignReceived?.(msg.payload?.color);
        break;
      }

      case 'REMATCH': {
        this.callbacks.onRematchReceived?.();
        break;
      }

      case 'ARENA_CHANGE': {
        if (msg.payload?.arena) {
          this.callbacks.onArenaChangeReceived?.(msg.payload.arena);
        }
        break;
      }
    }
  }

  private generateMsgId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Sends message across both WebRTC DataConnection and BroadcastChannel
  public broadcastMessage(msg: MultiplayerMessage) {
    this.processedMessageIds.add(msg.id);

    // 1. Send via WebRTC if open
    if (this.connection && this.connection.open) {
      try {
        this.connection.send(msg);
      } catch {
        // Fallback
      }
    }

    // 2. Send via BroadcastChannel
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage(msg);
      } catch {
        // Fallback
      }
    }
  }

  public sendMessage(msg: MultiplayerMessage) {
    this.broadcastMessage(msg);
  }

  public sendMove(move: RemoteMovePayload) {
    this.broadcastMessage({
      id: this.generateMsgId(),
      type: 'MOVE',
      payload: move,
      senderRole: this.role,
      timestamp: Date.now(),
    });
  }

  public sendStateSync(state: RoomStatePayload) {
    this.broadcastMessage({
      id: this.generateMsgId(),
      type: 'STATE_SYNC',
      payload: state,
      senderRole: this.role,
      timestamp: Date.now(),
    });
  }

  public sendDrawOffer() {
    this.broadcastMessage({
      id: this.generateMsgId(),
      type: 'DRAW_OFFER',
      senderRole: this.role,
      timestamp: Date.now(),
    });
  }

  public sendDrawAccept() {
    this.broadcastMessage({
      id: this.generateMsgId(),
      type: 'DRAW_ACCEPT',
      senderRole: this.role,
      timestamp: Date.now(),
    });
  }

  public sendDrawDecline() {
    this.broadcastMessage({
      id: this.generateMsgId(),
      type: 'DRAW_DECLINE',
      senderRole: this.role,
      timestamp: Date.now(),
    });
  }

  public sendResign(color: PieceColor) {
    this.broadcastMessage({
      id: this.generateMsgId(),
      type: 'RESIGN',
      payload: { color },
      senderRole: this.role,
      timestamp: Date.now(),
    });
  }

  public sendRematch() {
    this.broadcastMessage({
      id: this.generateMsgId(),
      type: 'REMATCH',
      senderRole: this.role,
      timestamp: Date.now(),
    });
  }

  public sendArenaChange(arena: ArenaId) {
    this.broadcastMessage({
      id: this.generateMsgId(),
      type: 'ARENA_CHANGE',
      payload: { arena },
      senderRole: this.role,
      timestamp: Date.now(),
    });
  }

  public disconnect() {
    if (this.connection) {
      try {
        this.connection.close();
      } catch {}
      this.connection = null;
    }

    if (this.peer) {
      try {
        this.peer.destroy();
      } catch {}
      this.peer = null;
    }

    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.close();
      } catch {}
      this.broadcastChannel = null;
    }

    this.isConnected = false;
    this.processedMessageIds.clear();
  }
}

export const onlineMultiplayer = new OnlineMultiplayerManager();
