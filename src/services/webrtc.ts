// WebRTC Peer Connection Manager optimized for desktop, mobile browsers, and multi-party mesh calls
// Includes STUN & TURN relay servers, polite renegotiation/rollback, and automatic ICE restart

export const RTC_CONFIGURATION: RTCConfiguration = {
  iceServers: [
    // Primary Google STUN (fast & global)
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    // Twilio & Cloudflare STUN
    { urls: 'stun:global.stun.twilio.com:3478' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    // OpenRelay TURN fallback for restrictive CGNAT / symmetric firewalls
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelay',
      credential: 'openrelay',
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelay',
      credential: 'openrelay',
    },
  ],
  iceCandidatePoolSize: 2,
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
};

export class WebRTCManager {
  public peerConnection: RTCPeerConnection | null = null;
  public localStream: MediaStream | null = null;
  public remoteStream: MediaStream = new MediaStream();
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private onRemoteStreamCallback: ((stream: MediaStream) => void) | null = null;
  private onIceCandidateCallback: ((candidate: RTCIceCandidate) => void) | null = null;
  private onConnectionStateChangeCallback: ((state: RTCPeerConnectionState) => void) | null = null;
  private onIceRestartNeededCallback: ((offer: RTCSessionDescriptionInit) => void) | null = null;
  private isInitiator = false;
  private isClosed = false;
  private disconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private lastIceRestartAt = 0;

  constructor(
    callbacks: {
      onRemoteStream?: (stream: MediaStream) => void;
      onIceCandidate?: (candidate: RTCIceCandidate) => void;
      onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
      onIceRestartNeeded?: (offer: RTCSessionDescriptionInit) => void;
      isInitiator?: boolean;
    } = {}
  ) {
    if (callbacks.onRemoteStream) this.onRemoteStreamCallback = callbacks.onRemoteStream;
    if (callbacks.onIceCandidate) this.onIceCandidateCallback = callbacks.onIceCandidate;
    if (callbacks.onConnectionStateChange) this.onConnectionStateChangeCallback = callbacks.onConnectionStateChange;
    if (callbacks.onIceRestartNeeded) this.onIceRestartNeededCallback = callbacks.onIceRestartNeeded;
    if (typeof callbacks.isInitiator === 'boolean') this.isInitiator = callbacks.isInitiator;
  }

  public initConnection(localStream: MediaStream | null): RTCPeerConnection {
    this.close();
    this.isClosed = false;

    this.localStream = localStream;
    this.remoteStream = new MediaStream();
    this.pendingCandidates = [];

    const pc = new RTCPeerConnection(RTC_CONFIGURATION);
    this.peerConnection = pc;

    // Add local tracks if available
    let hasTracks = false;
    if (localStream && localStream.getTracks().length > 0) {
      localStream.getTracks().forEach((track) => {
        try {
          pc.addTrack(track, localStream);
          hasTracks = true;
        } catch (e) {
          console.warn('[WebRTC] Error adding track:', e);
        }
      });
    }

    // Bidirectional transceivers ensure mobile & desktop negotiate audio and video
    if (!hasTracks) {
      try {
        pc.addTransceiver('video', { direction: 'sendrecv' });
        pc.addTransceiver('audio', { direction: 'sendrecv' });
      } catch (e) {
        console.warn('[WebRTC] Error adding transceivers:', e);
      }
    }

    // ICE Candidate handler
    pc.onicecandidate = (event) => {
      if (event.candidate && this.onIceCandidateCallback && !this.isClosed) {
        this.onIceCandidateCallback(event.candidate);
      }
    };

    // Remote Track handler (Mobile Safari & Chrome compatibility)
    pc.ontrack = (event) => {
      console.log('[WebRTC] Remote track received:', event.track.kind, event.streams);
      if (event.streams && event.streams[0]) {
        this.remoteStream = event.streams[0];
      } else {
        if (!this.remoteStream.getTracks().find((t) => t.id === event.track.id)) {
          this.remoteStream.addTrack(event.track);
        }
      }

      if (this.onRemoteStreamCallback && !this.isClosed) {
        // Clone MediaStream wrapper so React state always triggers audio/video element rebind
        this.onRemoteStreamCallback(new MediaStream(this.remoteStream.getTracks()));
      }
    };

    // Connection state changes
    pc.onconnectionstatechange = () => {
      console.log('[WebRTC] Connection state:', pc.connectionState);
      if (pc.connectionState === 'connected') {
        this.clearDisconnectTimer();
      }
      if (this.onConnectionStateChangeCallback && !this.isClosed) {
        this.onConnectionStateChangeCallback(pc.connectionState);
      }
    };

    // Auto-recover on ICE disconnection or failure without creating offer glare
    pc.oniceconnectionstatechange = () => {
      console.log('[WebRTC] ICE state:', pc.iceConnectionState);
      if (this.isClosed) return;

      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        this.clearDisconnectTimer();
      } else if (pc.iceConnectionState === 'disconnected') {
        if (!this.isInitiator) return;
        this.clearDisconnectTimer();
        this.disconnectTimer = setTimeout(() => {
          if (
            !this.isClosed &&
            this.peerConnection &&
            this.peerConnection.iceConnectionState === 'disconnected' &&
            this.peerConnection.connectionState !== 'connected'
          ) {
            this.triggerIceRestart();
          }
        }, 6000);
      } else if (pc.iceConnectionState === 'failed') {
        this.clearDisconnectTimer();
        const delay = this.isInitiator ? 300 : 3000;
        this.disconnectTimer = setTimeout(() => {
          if (
            !this.isClosed &&
            this.peerConnection &&
            this.peerConnection.iceConnectionState === 'failed' &&
            this.peerConnection.connectionState !== 'connected'
          ) {
            this.triggerIceRestart();
          }
        }, delay);
      }
    };

    return pc;
  }

  private clearDisconnectTimer() {
    if (this.disconnectTimer) {
      clearTimeout(this.disconnectTimer);
      this.disconnectTimer = null;
    }
  }

  public async triggerIceRestart() {
    if (this.isClosed || !this.peerConnection) return;
    if (
      this.peerConnection.connectionState === 'connected' ||
      this.peerConnection.iceConnectionState === 'connected' ||
      this.peerConnection.iceConnectionState === 'completed'
    ) {
      return;
    }
    const now = Date.now();
    if (now - this.lastIceRestartAt < 8000) return; // Throttle ICE restarts
    this.lastIceRestartAt = now;

    console.log('[WebRTC] Triggering ICE restart to maintain connection...');
    try {
      if (typeof this.peerConnection.restartIce === 'function') {
        this.peerConnection.restartIce();
      }
      if (this.onIceRestartNeededCallback && this.peerConnection.signalingState === 'stable') {
        const offer = await this.peerConnection.createOffer({
          iceRestart: true,
          offerToReceiveAudio: true,
          offerToReceiveVideo: true,
        });
        await this.peerConnection.setLocalDescription(offer);
        this.onIceRestartNeededCallback(offer);
      }
    } catch (err) {
      console.warn('[WebRTC] ICE restart attempt failed:', err);
    }
  }

  public async createOffer(iceRestart = false): Promise<RTCSessionDescriptionInit> {
    if (!this.peerConnection) throw new Error('Peer connection not initialized');
    const offer = await this.peerConnection.createOffer({
      iceRestart,
      offerToReceiveAudio: true,
      offerToReceiveVideo: true,
    });
    await this.peerConnection.setLocalDescription(offer);
    return offer;
  }

  public async handleOffer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    if (!this.peerConnection) throw new Error('Peer connection not initialized');

    // Handle glare / renegotiation gracefully via rollback
    if (this.peerConnection.signalingState !== 'stable') {
      try {
        await this.peerConnection.setLocalDescription({ type: 'rollback' });
      } catch {
        // Ignore rollback if unsupported
      }
    }

    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    await this.processPendingCandidates();

    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);
    return answer;
  }

  public async handleAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.peerConnection) throw new Error('Peer connection not initialized');
    if (this.peerConnection.signalingState === 'have-local-offer') {
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
      await this.processPendingCandidates();
    }
  }

  public async addIceCandidate(candidateInit: RTCIceCandidateInit): Promise<void> {
    if (!candidateInit || !candidateInit.candidate || this.isClosed) return;

    if (!this.peerConnection || !this.peerConnection.remoteDescription || !this.peerConnection.remoteDescription.type) {
      this.pendingCandidates.push(candidateInit);
      return;
    }
    try {
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidateInit));
    } catch (err) {
      console.warn('[WebRTC] Failed to add ICE candidate:', err);
    }
  }

  private async processPendingCandidates() {
    if (!this.peerConnection || !this.peerConnection.remoteDescription || this.isClosed) return;
    while (this.pendingCandidates.length > 0) {
      const cand = this.pendingCandidates.shift();
      if (cand) {
        try {
          await this.peerConnection.addIceCandidate(new RTCIceCandidate(cand));
        } catch (e) {
          console.warn('[WebRTC] Failed to process queued candidate:', e);
        }
      }
    }
  }

  public async replaceAudioTrack(track: MediaStreamTrack): Promise<void> {
    if (!this.peerConnection || this.isClosed) return;
    try {
      const sender =
        this.peerConnection.getSenders().find((s) => s.track?.kind === 'audio') ||
        this.peerConnection
          .getTransceivers()
          .find((t) => t.receiver?.track?.kind === 'audio' || t.sender?.track?.kind === 'audio')?.sender;
      if (sender) {
        await sender.replaceTrack(track);
      } else {
        const targetStream = this.localStream || new MediaStream([track]);
        if (this.localStream && !this.localStream.getTracks().includes(track)) {
          this.localStream.addTrack(track);
        }
        this.peerConnection.addTrack(track, targetStream);
      }
    } catch (err) {
      console.warn('[WebRTC] Failed to replace audio track:', err);
    }
  }

  public close() {
    this.isClosed = true;
    this.clearDisconnectTimer();
    if (this.peerConnection) {
      try {
        this.peerConnection.onicecandidate = null;
        this.peerConnection.ontrack = null;
        this.peerConnection.onconnectionstatechange = null;
        this.peerConnection.oniceconnectionstatechange = null;
        this.peerConnection.close();
      } catch {
        // ignore
      }
      this.peerConnection = null;
    }
    this.remoteStream = new MediaStream();
    this.pendingCandidates = [];
  }
}

// Helper to generate a realistic mock video & audio stream if camera is unavailable or for testing
export function createMockPeerStream(userName: string = 'Alex (Simulador)'): MediaStream {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 480;
  const ctx = canvas.getContext('2d')!;

  let frame = 0;
  const colors = ['#6366f1', '#ec4899', '#06b6d4', '#10b981', '#f59e0b'];
  const baseColor = colors[Math.abs(userName.length) % colors.length];

  function draw() {
    frame++;
    // Background gradient
    const grad = ctx.createLinearGradient(0, 0, 640, 480);
    grad.addColorStop(0, '#090d16');
    grad.addColorStop(1, '#1e1b4b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 640, 480);

    // Dynamic grid overlay
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    for (let x = 0; x < 640; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 480);
      ctx.stroke();
    }
    for (let y = 0; y < 480; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(640, y);
      ctx.stroke();
    }

    // Decorative circle glow
    ctx.save();
    ctx.fillStyle = baseColor + '25';
    ctx.beginPath();
    ctx.arc(320, 240, 140 + Math.sin(frame * 0.05) * 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Stylized Avatar head
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.arc(320, 200, 70, 0, Math.PI * 2);
    ctx.fill();

    // Avatar shoulders
    ctx.beginPath();
    ctx.ellipse(320, 360, 135, 85, 0, 0, Math.PI * 2);
    ctx.fill();

    // Eyes with blinking
    const isBlinking = frame % 100 > 94;
    ctx.fillStyle = '#ffffff';
    if (!isBlinking) {
      ctx.beginPath();
      ctx.arc(295, 195, 9, 0, Math.PI * 2);
      ctx.arc(345, 195, 9, 0, Math.PI * 2);
      ctx.fill();

      // Pupils
      ctx.fillStyle = baseColor;
      ctx.beginPath();
      ctx.arc(295 + Math.sin(frame * 0.03) * 3, 195, 5, 0, Math.PI * 2);
      ctx.arc(345 + Math.sin(frame * 0.03) * 3, 195, 5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(285, 195);
      ctx.lineTo(305, 195);
      ctx.moveTo(335, 195);
      ctx.lineTo(355, 195);
      ctx.stroke();
    }

    // Mouth with talking animation
    const mouthOpen = 4 + Math.abs(Math.sin(frame * 0.12)) * 14;
    ctx.fillStyle = '#f43f5e';
    ctx.beginPath();
    ctx.ellipse(320, 235, 16, mouthOpen / 2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Name and live badge
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.roundRect?.(20, 420, 280, 42, 10);
    ctx.fill();
    ctx.fillStyle = '#10b981';
    ctx.beginPath();
    ctx.arc(40, 441, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText(`${userName}`, 55, 446);

    requestAnimationFrame(draw);
  }

  draw();

  const videoStream = canvas.captureStream(30);

  // Audio track (gentle audible tone)
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioCtx) {
      const audioCtx = new AudioCtx();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      gain.gain.value = 0.001; // subtle audible feedback
      osc.connect(gain);
      const dest = audioCtx.createMediaStreamDestination();
      gain.connect(dest);
      osc.start();

      const audioTrack = dest.stream.getAudioTracks()[0];
      if (audioTrack) {
        videoStream.addTrack(audioTrack);
      }
    }
  } catch {
    // ignore
  }

  return videoStream;
}
