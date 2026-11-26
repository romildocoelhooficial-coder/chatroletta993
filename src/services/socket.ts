import { io, Socket } from 'socket.io-client';

class SocketService {
  private socket: Socket | null = null;
  private currentUser: { id: string; username: string; unique_code: string } | null = null;
  private activeRoomId: string | null = null;
  private broadcastChannel: BroadcastChannel | null = null;
  public isConnected = false;
  private channelListeners = new Map<string, Set<Function>>();
  private keepAliveInterval: ReturnType<typeof setInterval> | null = null;
  private isDirectCallActive = false;
  private earlyEvents: { event: string; payload: any; ts: number }[] = [];

  public setDirectCallMounted(mounted: boolean) {
    this.isDirectCallActive = mounted;
  }

  public drainEarlyEvents(): { event: string; payload: any }[] {
    const now = Date.now();
    const valid = this.earlyEvents.filter((item) => now - item.ts < 15000);
    this.earlyEvents = [];
    return valid.map(({ event, payload }) => ({ event, payload }));
  }

  public init(): Socket {
    if (!this.socket) {
      // Determine backend origin
      const customBackend = (import.meta as any).env?.VITE_BACKEND_URL;
      const isLocalOrCloud =
        typeof window !== 'undefined' &&
        (window.location.origin.includes('localhost') ||
          window.location.origin.includes('run.app') ||
          window.location.origin.includes('3000'));

      const targetUrl = customBackend || (isLocalOrCloud ? window.location.origin : undefined);

      this.socket = io(targetUrl || window.location.origin, {
        autoConnect: true,
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 4000,
        timeout: 10000,
        transports: ['websocket', 'polling'],
      });

      this.socket.on('connect', () => {
        this.isConnected = true;
        console.log('[SocketClient] Connected with id:', this.socket?.id);
        if (this.currentUser) {
          this.identify(this.currentUser);
        }
        this.startKeepAlive();
      });

      this.socket.on('disconnect', (reason) => {
        this.isConnected = false;
        console.log('[SocketClient] Disconnected:', reason);
      });

      this.socket.on('connect_error', (err) => {
        this.isConnected = false;
        // Stop aggressive retries ONLY if running on a static host returning 404 for socket.io
        if (err && err.message && err.message.includes('404')) {
          if (this.socket) {
            this.socket.io.opts.reconnectionAttempts = 2;
          }
        }
      });

      // Buffer WebRTC/chat packets that arrive right after clicking Atender before DirectCallView mounts
      ['call:accepted', 'webrtc:offer', 'webrtc:answer', 'webrtc:ice_candidate', 'chat:message'].forEach(
        (evt) => {
          this.socket!.on(evt, (payload: any) => {
            if (!this.isDirectCallActive) {
              this.earlyEvents.push({ event: evt, payload, ts: Date.now() });
              if (this.earlyEvents.length > 40) {
                this.earlyEvents.shift();
              }
            }
          });
        }
      );

      // Initialize cross-tab BroadcastChannel fallback
      this.initBroadcastChannel();
    }
    return this.socket;
  }

  private startKeepAlive() {
    if (this.keepAliveInterval) clearInterval(this.keepAliveInterval);
    this.keepAliveInterval = setInterval(() => {
      if (this.socket && this.socket.connected) {
        this.socket.emit('connection:keepalive', {
          roomId: this.activeRoomId,
          ts: Date.now(),
        });
      }
    }, 12000);
  }

  private initBroadcastChannel() {
    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        this.broadcastChannel = new BroadcastChannel('chatroulette_p2p_channel');
        this.broadcastChannel.onmessage = (event) => {
          const { eventName, payload } = event.data || {};
          if (eventName && this.channelListeners.has(eventName)) {
            this.channelListeners.get(eventName)!.forEach((cb) => {
              try {
                cb(payload);
              } catch (e) {
                console.warn('Error in BroadcastChannel listener:', e);
              }
            });
          }
        };
      }
    } catch {
      // BroadcastChannel not available
    }
  }

  public getSocket(): Socket {
    if (!this.socket) {
      return this.init();
    }
    return this.socket;
  }

  public setActiveRoomId(roomId: string | null) {
    this.activeRoomId = roomId;
  }

  public getActiveRoomId(): string | null {
    return this.activeRoomId;
  }

  public identify(user: { id: string; username: string; unique_code: string }) {
    const rawCode = String(user.unique_code || '').trim().toUpperCase();
    const normalizedCode = rawCode ? (rawCode.startsWith('#') ? rawCode : `#${rawCode}`) : '';
    const normalizedUser = { ...user, unique_code: normalizedCode };
    this.currentUser = normalizedUser;
    if (this.socket && this.socket.connected) {
      this.socket.emit('auth:identify', {
        userId: normalizedUser.id,
        username: normalizedUser.username,
        unique_code: normalizedCode,
        activeRoomId: this.activeRoomId,
      });
    }
    // Also broadcast presence cross-tab
    this.broadcastLocal('presence:change', {
      userId: normalizedUser.id,
      unique_code: normalizedCode,
      status: 'online',
    });
  }

  public clearIdentity() {
    if (this.currentUser) {
      this.broadcastLocal('presence:change', {
        userId: this.currentUser.id,
        unique_code: this.currentUser.unique_code,
        status: 'offline',
      });
    }
    if (this.socket && this.socket.connected) {
      this.socket.emit('auth:logout');
    }
    this.currentUser = null;
    this.activeRoomId = null;
  }

  // Broadcast message across tabs for multi-tab testing & offline fallback
  public broadcastLocal(eventName: string, payload: any) {
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage({ eventName, payload });
      } catch {
        // ignore
      }
    }
  }

  // Subscribe to local fallback events
  public onLocal(eventName: string, callback: Function) {
    if (!this.channelListeners.has(eventName)) {
      this.channelListeners.set(eventName, new Set());
    }
    this.channelListeners.get(eventName)!.add(callback);
  }

  public offLocal(eventName: string, callback: Function) {
    if (this.channelListeners.has(eventName)) {
      this.channelListeners.get(eventName)!.delete(callback);
    }
  }
}

export const socketService = new SocketService();
