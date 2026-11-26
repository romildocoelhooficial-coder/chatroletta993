import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { socketService } from '../services/socket.ts';
import { WebRTCManager, createMockPeerStream } from '../services/webrtc.ts';
import { mediaBridge } from '../services/mediaBridge.ts';
import { sounds } from '../services/audio.ts';
import { localDb } from '../services/localDatabase.ts';
import { resolveAvatarUrl } from '../services/avatar.ts';
import {
  Phone,
  PhoneOff,
  Video,
  VideoOff,
  Mic,
  MicOff,
  Delete,
  Users,
  Flag,
  MessageSquare,
  Send,
  AlertCircle,
  BellRing,
  Volume2,
  UserPlus,
  X,
  ArrowLeftRight,
  Maximize2,
  Minimize2,
  Crown,
  Wifi,
  CheckCircle2,
  Headphones,
  Mail,
  Calendar,
  ArrowUpRight,
} from 'lucide-react';

interface DirectCallViewProps {
  onReportUser: (code: string, name: string) => void;
  activeIncomingCallSession?: any;
  onClearIncomingSession?: () => void;
  onTriggerTestIncomingCall?: () => void;
}

interface TargetUserPreview {
  id: string;
  unique_code: string;
  username: string;
  avatar?: string;
  country?: string;
  bio?: string;
  status: 'online' | 'busy' | 'offline' | 'banned';
}

interface RemotePeer {
  socketId: string;
  id: string;
  username: string;
  unique_code: string;
  avatar?: string;
  country?: string;
  stream: MediaStream | null;
  isHost?: boolean;
  isGuest?: boolean;
  isMicMuted?: boolean;
  isVideoDisabled?: boolean;
  isReconnecting?: boolean;
  connectionState?: string;
}

interface InCallMessage {
  id: string;
  sender_name: string;
  sender_code?: string;
  text: string;
  timestamp: string;
  isSelf: boolean;
  isSystem?: boolean;
}

// Resilient video element binder that reliably attaches MediaStream across DOM transitions
const VideoStreamPlayer: React.FC<{
  stream: MediaStream | null;
  muted?: boolean;
  mirrored?: boolean;
  className?: string;
}> = ({ stream, muted = false, mirrored = false, className = '' }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    if (!stream) {
      el.srcObject = null;
      return;
    }

    el.srcObject = stream;
    const attemptPlay = () => {
      el.play().catch(() => {
        // Mobile Safari/Chrome autoplay fallback
      });
    };
    attemptPlay();

    const onTrackChange = () => {
      if (el.srcObject !== stream) {
        el.srcObject = stream;
      }
      attemptPlay();
    };

    const tracks = stream.getTracks();
    tracks.forEach((t) => t.addEventListener('unmute', attemptPlay));
    stream.addEventListener('addtrack', onTrackChange);
    stream.addEventListener('removetrack', onTrackChange);
    return () => {
      tracks.forEach((t) => t.removeEventListener('unmute', attemptPlay));
      stream.removeEventListener('addtrack', onTrackChange);
      stream.removeEventListener('removetrack', onTrackChange);
    };
  }, [stream]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted={muted}
      className={`${className} ${mirrored ? 'transform scale-x-[-1]' : ''}`}
    />
  );
};

// Dedicated non-hidden audio element with autoplay-block unlock button for audio-only attendance calls
const AudioStreamPlayer: React.FC<{ stream: MediaStream | null }> = ({ stream }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [needsUnlock, setNeedsUnlock] = useState(false);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    if (!stream) {
      el.srcObject = null;
      setNeedsUnlock(false);
      return;
    }

    el.srcObject = stream;
    el.muted = false;
    el.volume = 1.0;
    const attemptPlay = () => {
      el.play()
        .then(() => setNeedsUnlock(false))
        .catch(() => setNeedsUnlock(true));
    };
    attemptPlay();

    const onTrackChange = () => {
      if (el.srcObject !== stream) el.srcObject = stream;
      attemptPlay();
    };
    const tracks = stream.getTracks();
    tracks.forEach((t) => t.addEventListener('unmute', attemptPlay));
    stream.addEventListener('addtrack', onTrackChange);
    return () => {
      tracks.forEach((t) => t.removeEventListener('unmute', attemptPlay));
      stream.removeEventListener('addtrack', onTrackChange);
    };
  }, [stream]);

  return (
    <>
      <audio ref={audioRef} autoPlay playsInline className="sr-only" />
      {needsUnlock && stream && (
        <div className="bg-emerald-600/95 text-white px-4 py-2 text-xs font-bold flex items-center justify-center gap-3 z-30">
          <span>O navegador bloqueou o som automático da chamada.</span>
          <button
            type="button"
            onClick={() => {
              const el = audioRef.current;
              if (el) {
                el.muted = false;
                el.volume = 1.0;
                el.play().then(() => setNeedsUnlock(false)).catch(() => {});
              }
            }}
            className="px-3 py-1 bg-white text-emerald-900 rounded-lg font-extrabold cursor-pointer"
          >
            Ativar Áudio Agora
          </button>
        </div>
      )}
    </>
  );
};

export const DirectCallView: React.FC<DirectCallViewProps> = ({
  onReportUser,
  activeIncomingCallSession,
  onClearIncomingSession,
  onTriggerTestIncomingCall,
}) => {
  const { user } = useAuth();
  const socket = socketService.getSocket();

  // Dial input state
  const [dialCode, setDialCode] = useState('');
  const [targetPreview, setTargetPreview] = useState<TargetUserPreview | null>(null);
  const [dialError, setDialError] = useState<string | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<
    { id: string; username: string; unique_code: string; country?: string; avatar?: string }[]
  >([]);

  // Call status: 'idle' | 'calling' | 'connected'
  const [callStatus, setCallStatus] = useState<'idle' | 'calling' | 'connected'>('idle');
  const [isTargetOffline, setIsTargetOffline] = useState(false);
  const [currentCallId, setCurrentCallId] = useState<string | null>(null);
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(null);
  const [isCallHost, setIsCallHost] = useState(false);
  const [activeCallPartner, setActiveCallPartner] = useState<{
    id: string;
    username: string;
    unique_code: string;
    avatar?: string;
    country?: string;
  } | null>(null);

  // Multi-party peers in the active call
  const [remotePeers, setRemotePeers] = useState<RemotePeer[]>([]);
  const [pinnedPeerSocketId, setPinnedPeerSocketId] = useState<string | null>(null);
  const [isOverlayExpanded, setIsOverlayExpanded] = useState(false);

  // Invite guest modal state (for the host who initiated the direct call)
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteCodeInput, setInviteCodeInput] = useState('');
  const [inviteFeedback, setInviteFeedback] = useState<{ type: 'info' | 'success' | 'error'; text: string } | null>(null);
  const [pendingInvitesList, setPendingInvitesList] = useState<string[]>([]);

  // Duration timer
  const [callDuration, setCallDuration] = useState(0);

  // Call mode & optional Web Client Widget metadata
  const [callMode, setCallMode] = useState<'video' | 'audio'>('video');
  const [activeClientMeta, setActiveClientMeta] = useState<{
    leadId?: string;
    clientLabel: string;
    name: string;
    whatsapp: string;
    email: string;
    message: string;
    call_date?: string;
  } | null>(null);

  // Media
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [hasRealMic, setHasRealMic] = useState(false);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isVideoDisabled, setIsVideoDisabled] = useState(false);
  const [clientLeftNotice, setClientLeftNotice] = useState<string | null>(null);

  // In-call chat & reactions
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [messages, setMessages] = useState<InCallMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [floatingEmojis, setFloatingEmojis] = useState<{ id: string; emoji: string; x: number; sender?: string }[]>([]);

  // Refs for fresh closures inside socket listeners
  const peerConnectionsRef = useRef<Map<string, WebRTCManager>>(new Map());
  const inFlightPeerSetupRef = useRef<Map<string, Promise<WebRTCManager>>>(new Map());
  const earlyIceCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const inFlightMediaRef = useRef<Promise<MediaStream> | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const hasRealMicRef = useRef(false);
  const clientLeftNoticeRef = useRef<string | null>(null);
  const userRef = useRef(user);
  const currentRoomIdRef = useRef<string | null>(null);
  const callStatusRef = useRef(callStatus);
  const callModeRef = useRef(callMode);
  const isChatOpenRef = useRef(isChatOpen);
  const targetPreviewRef = useRef(targetPreview);
  const timerRef = useRef<any>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const lastHandledSessionRef = useRef<number | null>(null);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    currentRoomIdRef.current = currentRoomId;
    socketService.setActiveRoomId(currentRoomId);
  }, [currentRoomId]);

  useEffect(() => {
    callStatusRef.current = callStatus;
  }, [callStatus]);

  useEffect(() => {
    callModeRef.current = callMode;
  }, [callMode]);

  useEffect(() => {
    isChatOpenRef.current = isChatOpen;
    if (isChatOpen) setUnreadCount(0);
  }, [isChatOpen]);

  useEffect(() => {
    targetPreviewRef.current = targetPreview;
  }, [targetPreview]);

  useEffect(() => {
    clientLeftNoticeRef.current = clientLeftNotice;
  }, [clientLeftNotice]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isChatOpen]);

  // Directory of contacts for quick dialing
  const quickDirectory = [
    { code: '#CR-849201', name: 'Lucas Silva', country: 'Brasil 🇧🇷', role: 'Dev & Games' },
    { code: '#CR-193852', name: 'Sofia Martinez', country: 'Portugal 🇵🇹', role: 'Design & Foto' },
    { code: '#CR-552910', name: 'Clara Costa', country: 'Espanha 🇪🇸', role: 'Idiomas' },
    { code: '#CR-648291', name: 'Alex Morgan', country: 'EUA 🇺🇸', role: 'Música' },
    { code: '#CR-000001', name: 'Admin Master', country: 'Brasil 🇧🇷', role: 'Administrador' },
  ];

  // Helper: create silent WebAudio stream fallback when microphone is unavailable
  const createAudioOnlyFallback = (): MediaStream => {
    const stream = new MediaStream();
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        gain.gain.value = 0.0001;
        osc.connect(gain);
        const dest = ctx.createMediaStreamDestination();
        gain.connect(dest);
        osc.start();
        const track = dest.stream.getAudioTracks()[0];
        if (track) stream.addTrack(track);
      }
    } catch {
      // ignore
    }
    return stream;
  };

  // Upgrade existing stream & active RTCPeerConnections with a newly captured real microphone track
  const applyRealMicTrack = useCallback((micTrack: MediaStreamTrack) => {
    hasRealMicRef.current = true;
    setHasRealMic(true);
    setIsMicMuted(false);

    const existing = localStreamRef.current;
    const nextTracks: MediaStreamTrack[] = [];
    if (existing) {
      existing.getVideoTracks().forEach((vt) => {
        if (vt.readyState === 'live') nextTracks.push(vt);
      });
      existing.getAudioTracks().forEach((oldAudio) => {
        if (oldAudio !== micTrack) {
          try {
            oldAudio.stop();
          } catch {
            // ignore
          }
        }
      });
    }
    nextTracks.push(micTrack);

    const updatedStream = new MediaStream(nextTracks);
    localStreamRef.current = updatedStream;
    setLocalStream(updatedStream);
    mediaBridge.setStream(updatedStream);

    peerConnectionsRef.current.forEach((rtc) => {
      rtc.replaceAudioTrack(micTrack);
    });
  }, []);

  const activateMicrophoneNow = useCallback(async () => {
    try {
      const micStream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const micTrack = micStream.getAudioTracks()[0];
      if (micTrack) {
        applyRealMicTrack(micTrack);
        return true;
      }
    } catch {
      // Permission denied or microphone unavailable
    }
    return false;
  }, [applyRealMicTrack]);

  // Initialize camera & mic safely (always prioritizes real mic even when camera is missing)
  const ensureLocalMedia = useCallback(async (audioOnly: boolean = false): Promise<MediaStream> => {
    const current = localStreamRef.current;
    const hasLiveTracks = Boolean(current && current.getTracks().some((t) => t.readyState === 'live'));

    // If current stream only had a silent fallback oscillator, upgrade to real mic before starting/accepting audio call
    if (hasLiveTracks && current && !hasRealMicRef.current) {
      try {
        const micOnly = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        const micTrack = micOnly.getAudioTracks()[0];
        if (micTrack) {
          applyRealMicTrack(micTrack);
          if (!audioOnly && localStreamRef.current && localStreamRef.current.getVideoTracks().length === 0) {
            try {
              const camStream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
              });
              const vTrack = camStream.getVideoTracks()[0];
              if (vTrack) {
                localStreamRef.current.addTrack(vTrack);
                setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
                mediaBridge.setStream(localStreamRef.current);
              }
            } catch {
              // ignore camera missing
            }
          }
          return localStreamRef.current!;
        }
      } catch {
        // Continue with existing stream
      }
    }

    if (hasLiveTracks && current) {
      if (!audioOnly && current.getVideoTracks().length === 0) {
        try {
          const camStream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
          });
          const vTrack = camStream.getVideoTracks()[0];
          if (vTrack) {
            current.addTrack(vTrack);
            setLocalStream(new MediaStream(current.getTracks()));
            mediaBridge.setStream(current);
          }
        } catch {
          // Camera unavailable; continue with audio
        }
      }
      return current;
    }

    if (inFlightMediaRef.current) {
      return inFlightMediaRef.current;
    }

    const mediaPromise = (async () => {
      if (audioOnly) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: false,
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          });
          hasRealMicRef.current = true;
          setHasRealMic(true);
          localStreamRef.current = stream;
          setLocalStream(stream);
          mediaBridge.setStream(stream);
          return stream;
        } catch {
          console.warn('Microphone unavailable, using virtual audio stream');
          hasRealMicRef.current = false;
          setHasRealMic(false);
          const fallback = createAudioOnlyFallback();
          localStreamRef.current = fallback;
          setLocalStream(fallback);
          mediaBridge.setStream(fallback);
          return fallback;
        } finally {
          inFlightMediaRef.current = null;
        }
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        hasRealMicRef.current = stream.getAudioTracks().length > 0;
        setHasRealMic(stream.getAudioTracks().length > 0);
        localStreamRef.current = stream;
        setLocalStream(stream);
        mediaBridge.setStream(stream);
        return stream;
      } catch {
        console.warn('Physical camera unavailable, using virtual test stream');
        const mockStream = createMockPeerStream(userRef.current?.username || 'Você');
        // Still try capturing the real microphone when only the physical camera is missing
        try {
          const micOnly = await navigator.mediaDevices.getUserMedia({
            video: false,
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          });
          const realMicTrack = micOnly.getAudioTracks()[0];
          if (realMicTrack) {
            mockStream.getAudioTracks().forEach((t) => {
              mockStream.removeTrack(t);
              t.stop();
            });
            mockStream.addTrack(realMicTrack);
            hasRealMicRef.current = true;
            setHasRealMic(true);
          } else {
            hasRealMicRef.current = false;
            setHasRealMic(false);
          }
        } catch {
          hasRealMicRef.current = false;
          setHasRealMic(false);
        }
        localStreamRef.current = mockStream;
        setLocalStream(mockStream);
        mediaBridge.setStream(mockStream);
        return mockStream;
      } finally {
        inFlightMediaRef.current = null;
      }
    })();

    inFlightMediaRef.current = mediaPromise;
    return mediaPromise;
  }, [applyRealMicTrack]);

  useEffect(() => {
    const activity =
      callStatus === 'connected'
        ? 'Em Chamada Direta'
        : callStatus === 'calling'
        ? 'Discando Chamada'
        : 'Chamada Direta';
    mediaBridge.setActivity(activity);
    socket.emit('user:activity', { activity });
  }, [callStatus, socket]);

  useEffect(() => {
    const startAudioOnly = activeIncomingCallSession?.callType === 'audio';
    ensureLocalMedia(startAudioOnly);
    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
      }
      peerConnectionsRef.current.forEach((rtc) => rtc.close());
      peerConnectionsRef.current.clear();
      socketService.setActiveRoomId(null);
      sounds.stopOutgoingRing();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [ensureLocalMedia]);

  // Trigger floating emoji
  const triggerFloatingEmoji = useCallback((emoji: string, sender?: string) => {
    const id = `emoji_${Date.now()}_${Math.random()}`;
    const x = Math.floor(15 + Math.random() * 70);
    setFloatingEmojis((prev) => [...prev, { id, emoji, x, sender }]);
    setTimeout(() => {
      setFloatingEmojis((prev) => prev.filter((item) => item.id !== id));
    }, 2200);
  }, []);

  // Create or reuse a WebRTC connection for a specific remote peerSocketId (concurrency-safe)
  const setupPeerRTC = useCallback(
    async (
      peerSocketId: string,
      roomId: string,
      isInitiator: boolean,
      audioOnly: boolean = false
    ): Promise<WebRTCManager> => {
      // HTTP fallback widget has no live Socket.IO peer yet; wait for widget:attach_call -> room:peer_reconnected
      if (peerSocketId === 'http_widget') {
        return new WebRTCManager({ isInitiator: false });
      }

      const pending = inFlightPeerSetupRef.current.get(peerSocketId);
      if (pending) {
        return pending;
      }

      const setupPromise = (async () => {
        const existing = peerConnectionsRef.current.get(peerSocketId);
        if (existing) {
          if (!isInitiator && existing.peerConnection) {
            return existing;
          }
          existing.close();
          peerConnectionsRef.current.delete(peerSocketId);
        }

        const activeStream = await ensureLocalMedia(audioOnly);
        let streamForPeer = audioOnly
          ? new MediaStream(activeStream.getAudioTracks())
          : activeStream;
        if (audioOnly && streamForPeer.getAudioTracks().length === 0) {
          streamForPeer = createAudioOnlyFallback();
        }

        const rtc = new WebRTCManager({
          isInitiator,
          onRemoteStream: (stream) => {
            console.log('[DirectCall] Got remote stream from', peerSocketId, 'tracks:', stream.getTracks().length);
            setRemotePeers((prev) =>
              prev.map((p) =>
                p.socketId === peerSocketId
                  ? { ...p, stream, isReconnecting: false }
                  : p
              )
            );
          },
          onIceCandidate: (candidate) => {
            socket.emit('webrtc:ice_candidate', {
              toSocketId: peerSocketId,
              candidate,
              roomId,
            });
          },
          onConnectionStateChange: (state) => {
            setRemotePeers((prev) =>
              prev.map((p) =>
                p.socketId === peerSocketId
                  ? {
                      ...p,
                      connectionState: state,
                      isReconnecting: state === 'disconnected' || state === 'failed',
                    }
                  : p
              )
            );
          },
          onIceRestartNeeded: (offer) => {
            console.log('[DirectCall] Sending ICE restart offer to:', peerSocketId);
            socket.emit('webrtc:offer', {
              toSocketId: peerSocketId,
              sdp: offer,
              roomId,
            });
          },
        });

        peerConnectionsRef.current.set(peerSocketId, rtc);
        rtc.initConnection(streamForPeer);

        // Flush any ICE candidates that arrived while media/peer setup was still initializing
        const earlyCandidates = earlyIceCandidatesRef.current.get(peerSocketId);
        if (earlyCandidates && earlyCandidates.length > 0) {
          earlyIceCandidatesRef.current.delete(peerSocketId);
          for (const cand of earlyCandidates) {
            await rtc.addIceCandidate(cand);
          }
        }

        if (isInitiator) {
          try {
            const offer = await rtc.createOffer();
            socket.emit('webrtc:offer', {
              toSocketId: peerSocketId,
              sdp: offer,
              roomId,
            });
          } catch (err) {
            console.error('[DirectCall] Error creating offer for', peerSocketId, err);
          }
        } else {
          // Handshake safety fallback: if widget's initial offer was missed during mount, send an offer after 2.5s
          setTimeout(async () => {
            const currentRtc = peerConnectionsRef.current.get(peerSocketId);
            const pc = currentRtc?.peerConnection;
            if (
              currentRtc &&
              pc &&
              !pc.remoteDescription &&
              pc.signalingState === 'stable' &&
              callStatusRef.current === 'connected'
            ) {
              try {
                console.log('[DirectCall] Fallback initiating WebRTC offer to:', peerSocketId);
                const fallbackOffer = await currentRtc.createOffer();
                socket.emit('webrtc:offer', {
                  toSocketId: peerSocketId,
                  sdp: fallbackOffer,
                  roomId,
                });
              } catch {
                // ignore
              }
            }
          }, 2500);
        }

        return rtc;
      })().finally(() => {
        inFlightPeerSetupRef.current.delete(peerSocketId);
      });

      inFlightPeerSetupRef.current.set(peerSocketId, setupPromise);
      return setupPromise;
    },
    [ensureLocalMedia, socket]
  );

  // Cleanup all active call state
  const cleanupCall = useCallback(() => {
    sounds.stopAll();
    peerConnectionsRef.current.forEach((rtc) => rtc.close());
    peerConnectionsRef.current.clear();
    inFlightPeerSetupRef.current.clear();
    earlyIceCandidatesRef.current.clear();
    socketService.setActiveRoomId(null);
    setRemotePeers([]);
    setPinnedPeerSocketId(null);
    setCallStatus('idle');
    setIsTargetOffline(false);
    setCurrentCallId(null);
    setCurrentRoomId(null);
    setIsCallHost(false);
    setActiveCallPartner(null);
    setMessages([]);
    setUnreadCount(0);
    setIsInviteOpen(false);
    setInviteFeedback(null);
    setPendingInvitesList([]);
    setCallMode('video');
    setActiveClientMeta(null);
    setClientLeftNotice(null);
    setIsVideoDisabled(false);
    if (onClearIncomingSession) onClearIncomingSession();
  }, [onClearIncomingSession]);

  // Handle active incoming call accepted from IncomingCallModal
  useEffect(() => {
    if (!activeIncomingCallSession) return;
    if (lastHandledSessionRef.current === activeIncomingCallSession.acceptedAt) return;
    lastHandledSessionRef.current = activeIncomingCallSession.acceptedAt || Date.now();

    console.log('[DirectCall] Accepted incoming session:', activeIncomingCallSession);
    sounds.stopAll();
    sounds.playConnectedChime();

    const isAudioInitial = activeIncomingCallSession.callType === 'audio';
    const clientMeta = activeIncomingCallSession.clientMeta || null;

    setClientLeftNotice(null);
    setCallStatus('connected');
    setCallMode(isAudioInitial ? 'audio' : 'video');
    setIsVideoDisabled(isAudioInitial);
    setActiveClientMeta(clientMeta);
    setCurrentCallId(activeIncomingCallSession.callId);
    setActiveCallPartner(activeIncomingCallSession.caller);
    setIsCallHost(false);

    if (clientMeta) {
      setIsChatOpen(true);
    }

    if (activeIncomingCallSession.isMock || activeIncomingCallSession.callerSocketId === 'mock_caller') {
      const mockStream = isAudioInitial
        ? createAudioOnlyFallback()
        : createMockPeerStream(activeIncomingCallSession.caller.username);
      setRemotePeers([
        {
          socketId: 'mock_caller',
          id: activeIncomingCallSession.caller.id,
          username: activeIncomingCallSession.caller.username,
          unique_code: activeIncomingCallSession.caller.unique_code,
          avatar: activeIncomingCallSession.caller.avatar,
          country: activeIncomingCallSession.caller.country,
          stream: mockStream,
          isHost: true,
          isVideoDisabled: isAudioInitial,
          connectionState: 'connected',
        },
      ]);

      const initialMsgs: InCallMessage[] = [];
      if (clientMeta) {
        initialMsgs.push({
          id: `client_sys_${Date.now()}`,
          sender_name: 'Sistema',
          text: `${clientMeta.clientLabel} conectou por chamada de áudio via widget web.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          isSelf: false,
          isSystem: true,
        });
        if (clientMeta.message) {
          initialMsgs.push({
            id: `client_msg_${Date.now() + 1}`,
            sender_name: `${clientMeta.clientLabel} (${clientMeta.name})`,
            text: clientMeta.message,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            isSelf: false,
          });
        }
      } else {
        initialMsgs.push({
          id: 'mock_welcome',
          sender_name: activeIncomingCallSession.caller.username,
          text: 'Olá! Que bom que atendeu a chamada. O áudio e vídeo estão funcionando perfeitamente!',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          isSelf: false,
        });
      }
      setMessages(initialMsgs);
      return;
    }

    // For real 1:1 or group calls, server emits `call:accepted` or `call:joined_group` to configure peers & WebRTC
    if (!activeIncomingCallSession.isGroupInvite) {
      const roomId = `direct_room_${activeIncomingCallSession.callId}`;
      setCurrentRoomId(roomId);
      setRemotePeers([
        {
          socketId: activeIncomingCallSession.callerSocketId,
          id: activeIncomingCallSession.caller.id,
          username: activeIncomingCallSession.caller.username,
          unique_code: activeIncomingCallSession.caller.unique_code,
          avatar: activeIncomingCallSession.caller.avatar,
          country: activeIncomingCallSession.caller.country,
          stream: null,
          isHost: true,
          isVideoDisabled: isAudioInitial,
          connectionState: 'connecting',
        },
      ]);
      if (clientMeta) {
        const seeded: InCallMessage[] = [
          {
            id: `client_sys_${Date.now()}`,
            sender_name: 'Sistema',
            text: `Atendimento iniciado com ${clientMeta.clientLabel} (${clientMeta.name}) via widget web.`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            isSelf: false,
            isSystem: true,
          },
        ];
        if (clientMeta.message) {
          seeded.push({
            id: `client_msg_${Date.now() + 1}`,
            sender_name: `${clientMeta.clientLabel} (${clientMeta.name})`,
            text: clientMeta.message,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            isSelf: false,
          });
        }
        setMessages(seeded);
      }
      setupPeerRTC(activeIncomingCallSession.callerSocketId, roomId, false, isAudioInitial);
    }
  }, [activeIncomingCallSession, setupPeerRTC]);

  // Duration timer when connected
  useEffect(() => {
    if (callStatus === 'connected') {
      setCallDuration(0);
      timerRef.current = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setCallDuration(0);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [callStatus]);

  // Main Socket Event Listeners (stable single registration using refs)
  useEffect(() => {
    const onCallRinging = (data: { callId: string; isOffline?: boolean; targetUser: any }) => {
      console.log('[DirectCall] Ringing (Outgoing):', data);
      sounds.unlockAudio();
      sounds.startOutgoingRing();
      setIsTargetOffline(Boolean(data.isOffline));
      setCallStatus('calling');
      setCurrentCallId(data.callId);
      setActiveCallPartner(data.targetUser);
      setIsCallHost(true);
    };

    const onCallAccepted = async (data: {
      callId: string;
      roomId: string;
      peerSocketId: string;
      isInitiator: boolean;
      isHost?: boolean;
      isAutoAttendant?: boolean;
      callType?: 'video' | 'audio';
      isClientWidget?: boolean;
      clientMeta?: any;
      peer?: any;
    }) => {
      console.log('[DirectCall] Call Accepted:', data);
      sounds.stopAll();
      sounds.playConnectedChime();
      const isAudioOnly = data.callType === 'audio';
      setClientLeftNotice(null);
      setCallStatus('connected');
      setCallMode(isAudioOnly ? 'audio' : 'video');
      setIsVideoDisabled(isAudioOnly);
      if (data.clientMeta) {
        setActiveClientMeta(data.clientMeta);
        setIsChatOpen(true);
      }
      setCurrentCallId(data.callId);
      setCurrentRoomId(data.roomId);
      if (typeof data.isHost === 'boolean') {
        setIsCallHost(data.isHost);
      }

      if (data.peer) {
        setActiveCallPartner(data.peer);
      }

      if (data.isAutoAttendant && data.peer) {
        const mockStream = createMockPeerStream(data.peer.username);
        setRemotePeers([
          {
            socketId: 'virtual_peer',
            id: data.peer.id,
            username: data.peer.username,
            unique_code: data.peer.unique_code,
            avatar: data.peer.avatar,
            country: data.peer.country,
            stream: mockStream,
            isHost: false,
            connectionState: 'connected',
          },
        ]);
        setMessages((prev) => [
          ...prev,
          {
            id: `auto_msg_${Date.now()}`,
            sender_name: data.peer.username,
            text: 'Olá! Conexão estabelecida. Você também pode clicar em "Convidar" para adicionar outro usuário real na chamada!',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            isSelf: false,
          },
        ]);
        return;
      }

      const peerProfile = data.peer || targetPreviewRef.current || {
        id: data.peerSocketId,
        username: 'Participante',
        unique_code: '#CR-000000',
      };

      setRemotePeers((prev) => {
        const cleaned =
          data.peerSocketId !== 'http_widget'
            ? prev.filter((p) => p.socketId !== 'http_widget')
            : prev;
        const exists = cleaned.find((p) => p.socketId === data.peerSocketId);
        if (exists) return cleaned;
        return [
          ...cleaned,
          {
            socketId: data.peerSocketId,
            id: peerProfile.id || data.peerSocketId,
            username: peerProfile.username || 'Participante',
            unique_code: peerProfile.unique_code || '',
            avatar: peerProfile.avatar,
            country: peerProfile.country,
            stream: null,
            isHost: !data.isHost,
            isVideoDisabled: isAudioOnly,
            connectionState: 'connecting',
          },
        ];
      });

      if (
        data.isInitiator ||
        (!peerConnectionsRef.current.has(data.peerSocketId) &&
          !inFlightPeerSetupRef.current.has(data.peerSocketId))
      ) {
        await setupPeerRTC(data.peerSocketId, data.roomId, data.isInitiator, isAudioOnly);
      }
    };

    // Guest joins an active group call
    const onJoinedGroup = async (data: {
      callId: string;
      roomId: string;
      hostSocketId: string;
      peers: any[];
    }) => {
      console.log('[DirectCall] Joined Group Call as Guest:', data);
      sounds.stopAll();
      sounds.playConnectedChime();
      setCallStatus('connected');
      setCurrentCallId(data.callId);
      setCurrentRoomId(data.roomId);
      setIsCallHost(false);

      const initialPeers: RemotePeer[] = (data.peers || []).map((p) => ({
        socketId: p.socketId,
        id: p.id,
        username: p.username,
        unique_code: p.unique_code,
        avatar: p.avatar,
        country: p.country,
        stream: null,
        isHost: p.isHost,
        isGuest: p.isGuest,
        connectionState: 'connecting',
      }));

      setRemotePeers(initialPeers);
      if (initialPeers[0]) {
        setActiveCallPartner(initialPeers[0]);
      }

      // Initialize WebRTC receiver connections for every existing member in the room
      for (const p of initialPeers) {
        await setupPeerRTC(p.socketId, data.roomId, false);
      }
    };

    // Existing members notified when an invited guest joins
    const onPeerJoined = async (data: {
      roomId: string;
      peerSocketId: string;
      shouldInitiateOffer: boolean;
      peer: any;
    }) => {
      console.log('[DirectCall] New guest joined room:', data);
      sounds.playConnectedChime();
      setInviteFeedback({
        type: 'success',
        text: `${data.peer.username} entrou na chamada!`,
      });
      setPendingInvitesList((prev) => prev.filter((c) => c !== data.peer.unique_code));
      setTimeout(() => setIsInviteOpen(false), 1200);

      setRemotePeers((prev) => {
        if (prev.some((p) => p.socketId === data.peerSocketId)) return prev;
        return [
          ...prev,
          {
            socketId: data.peerSocketId,
            id: data.peer.id,
            username: data.peer.username,
            unique_code: data.peer.unique_code,
            avatar: data.peer.avatar,
            country: data.peer.country,
            stream: null,
            isHost: false,
            isGuest: true,
            connectionState: 'connecting',
          },
        ];
      });

      await setupPeerRTC(data.peerSocketId, data.roomId, data.shouldInitiateOffer);
    };

    // Individual peer leaves a 3+ person call (remaining participants stay connected)
    const onPeerLeft = (data: { roomId: string; socketId: string; username: string; reason?: string }) => {
      console.log('[DirectCall] Peer left multi-party room:', data);
      const rtc = peerConnectionsRef.current.get(data.socketId);
      if (rtc) {
        rtc.close();
        peerConnectionsRef.current.delete(data.socketId);
      }
      setRemotePeers((prev) => prev.filter((p) => p.socketId !== data.socketId));
      setPinnedPeerSocketId((curr) => (curr === data.socketId ? null : curr));
    };

    // Peer momentarily lost signal — keep call alive during 12s grace window
    const onPeerReconnecting = (data: { socketId: string }) => {
      setRemotePeers((prev) =>
        prev.map((p) => (p.socketId === data.socketId ? { ...p, isReconnecting: true } : p))
      );
    };

    // Peer reconnected within grace window — remap socketId & trigger ICE restart
    const onPeerReconnected = async (data: {
      roomId: string;
      oldSocketId: string;
      newSocketId: string;
      peer: any;
    }) => {
      console.log('[DirectCall] Peer reconnected seamlessly:', data.oldSocketId, '->', data.newSocketId);
      const oldRtc = peerConnectionsRef.current.get(data.oldSocketId);
      if (oldRtc) {
        oldRtc.close();
        peerConnectionsRef.current.delete(data.oldSocketId);
      }

      setRemotePeers((prev) => {
        const matched = prev.some((p) => p.socketId === data.oldSocketId || p.socketId === 'http_widget');
        if (matched) {
          return prev.map((p) =>
            p.socketId === data.oldSocketId || p.socketId === 'http_widget'
              ? { ...p, socketId: data.newSocketId, isReconnecting: false, connectionState: 'connecting' }
              : p
          );
        }
        return [
          ...prev,
          {
            socketId: data.newSocketId,
            id: data.peer?.id || data.newSocketId,
            username: data.peer?.username || 'Cliente Web',
            unique_code: data.peer?.unique_code || 'ATENDIMENTO WEB',
            stream: null,
            isHost: false,
            isVideoDisabled: callModeRef.current === 'audio',
            connectionState: 'connecting',
          },
        ];
      });
      setPinnedPeerSocketId((curr) => (curr === data.oldSocketId ? data.newSocketId : curr));

      // Wait for widget's offer via room:peer_reconnected (or 2.5s safety fallback initiates)
      await setupPeerRTC(data.newSocketId, data.roomId, false, callModeRef.current === 'audio');
    };

    // WebRTC Signaling Handlers (Keyed by fromSocketId for multi-peer mesh!)
    const handleWebRTCOffer = async (payload: { fromSocketId: string; sdp: any; roomId?: string }) => {
      console.log('[DirectCall] Received WebRTC offer from:', payload.fromSocketId);
      const roomId = payload.roomId || currentRoomIdRef.current || `direct_room_${Date.now()}`;
      const pendingSetup = inFlightPeerSetupRef.current.get(payload.fromSocketId);
      if (pendingSetup) {
        await pendingSetup.catch(() => {});
      }
      let rtc = peerConnectionsRef.current.get(payload.fromSocketId);
      if (!rtc) {
        rtc = await setupPeerRTC(payload.fromSocketId, roomId, false, callModeRef.current === 'audio');
      }
      try {
        const answer = await rtc.handleOffer(payload.sdp);
        socket.emit('webrtc:answer', {
          toSocketId: payload.fromSocketId,
          sdp: answer,
          roomId,
        });
      } catch (err) {
        console.error('[DirectCall] Error handling offer:', err);
      }
    };

    const handleWebRTCAnswer = async (payload: { fromSocketId: string; sdp: any }) => {
      console.log('[DirectCall] Received WebRTC answer from:', payload.fromSocketId);
      const pendingSetup = inFlightPeerSetupRef.current.get(payload.fromSocketId);
      if (pendingSetup) {
        await pendingSetup.catch(() => {});
      }
      const rtc = peerConnectionsRef.current.get(payload.fromSocketId);
      if (rtc) {
        try {
          await rtc.handleAnswer(payload.sdp);
        } catch (err) {
          console.error('[DirectCall] Error handling answer:', err);
        }
      }
    };

    const handleWebRTCIceCandidate = async (payload: { fromSocketId: string; candidate: any }) => {
      if (!payload?.candidate) return;
      const rtc = peerConnectionsRef.current.get(payload.fromSocketId);
      if (rtc) {
        try {
          await rtc.addIceCandidate(payload.candidate);
        } catch (err) {
          console.warn('[DirectCall] Error adding candidate:', err);
        }
      } else {
        const queued = earlyIceCandidatesRef.current.get(payload.fromSocketId) || [];
        queued.push(payload.candidate);
        earlyIceCandidatesRef.current.set(payload.fromSocketId, queued);
      }
    };

    const onMediaState = (data: { socketId: string; isMicMuted: boolean; isVideoDisabled: boolean }) => {
      setRemotePeers((prev) =>
        prev.map((p) =>
          p.socketId === data.socketId
            ? { ...p, isMicMuted: data.isMicMuted, isVideoDisabled: data.isVideoDisabled }
            : p
        )
      );
    };

    const onChatMessage = (msg: {
      id: string;
      sender_id: string;
      sender_name: string;
      sender_code?: string;
      text: string;
      timestamp: string;
      is_system?: boolean;
    }) => {
      const isSelf = msg.sender_id === socket.id;
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [
          ...prev,
          {
            id: msg.id,
            sender_name: msg.sender_name,
            sender_code: msg.sender_code,
            text: msg.text,
            timestamp: msg.timestamp,
            isSelf,
            isSystem: msg.is_system,
          },
        ];
      });
      if (!isSelf && !isChatOpenRef.current) {
        setUnreadCount((c) => c + 1);
      }
    };

    const onReaction = (payload: { emoji: string; senderName?: string }) => {
      triggerFloatingEmoji(payload.emoji, payload.senderName);
    };

    const onInviteSent = (data: { inviteId: string; targetUser: any }) => {
      setPendingInvitesList((prev) => [...prev, data.targetUser.unique_code]);
      setInviteFeedback({
        type: 'info',
        text: `Convite enviado para ${data.targetUser.username} (${data.targetUser.unique_code}). Tocando no dispositivo dele...`,
      });
    };

    const onInviteRejected = (data: { targetName: string; targetCode: string; reason: string }) => {
      setPendingInvitesList((prev) => prev.filter((c) => c !== data.targetCode));
      setInviteFeedback({
        type: 'error',
        text: `${data.targetName}: ${data.reason}`,
      });
    };

    const onInviteError = (data: { message: string }) => {
      setInviteFeedback({
        type: 'error',
        text: data.message,
      });
    };

    const onOnlineList = (list: any[]) => {
      if (Array.isArray(list)) {
        setOnlineUsers(list.filter((u) => u.unique_code !== userRef.current?.unique_code));
      }
    };

    const onCallRejected = (data: { callId: string; reason: string }) => {
      console.log('[DirectCall] Rejected:', data);
      sounds.stopAll();
      sounds.playHangupTone();
      setDialError(`Chamada recusada: ${data.reason || 'O usuário não atendeu.'}`);
      cleanupCall();
    };

    const onCallEnded = (data: { reason?: string }) => {
      console.log('[DirectCall] Ended:', data);
      if (clientLeftNoticeRef.current) return;
      sounds.stopAll();
      sounds.playHangupTone();
      cleanupCall();
    };

    const onWidgetClientLeft = (data: {
      callId?: string;
      roomId?: string;
      clientLabel?: string;
      clientName?: string;
      message?: string;
    }) => {
      const notice = data?.message || 'Cliente Saiu do Chat';
      sounds.stopAll();
      sounds.playHangupTone();
      peerConnectionsRef.current.forEach((rtc) => rtc.close());
      peerConnectionsRef.current.clear();
      inFlightPeerSetupRef.current.clear();
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setClientLeftNotice(notice);
      setMessages((prev) => {
        if (prev.some((m) => m.isSystem && m.text === notice)) return prev;
        return [
          ...prev,
          {
            id: `sys_left_${Date.now()}`,
            sender_name: 'Sistema',
            text: notice,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            isSelf: false,
            isSystem: true,
          },
        ];
      });
    };

    const onCallError = (data: { message: string }) => {
      sounds.stopAll();
      setDialError(data.message);
      cleanupCall();
    };

    // Offline cross-tab broadcast responses (only if Socket.IO server unreachable)
    const onBroadcastAccepted = () => {
      if (socketService.isConnected) return;
      sounds.stopAll();
      sounds.playConnectedChime();
      setCallStatus('connected');
      setIsCallHost(true);
      const mockStream = createMockPeerStream(targetPreviewRef.current?.username || 'Usuário Remoto');
      setRemotePeers([
        {
          socketId: 'local_tab_peer',
          id: targetPreviewRef.current?.id || 'local_peer',
          username: targetPreviewRef.current?.username || 'Usuário Remoto',
          unique_code: targetPreviewRef.current?.unique_code || '#CR-000000',
          stream: mockStream,
          connectionState: 'connected',
        },
      ]);
    };

    const onBroadcastRejected = () => {
      if (socketService.isConnected) return;
      sounds.stopAll();
      sounds.playHangupTone();
      setDialError('Chamada recusada na outra aba.');
      cleanupCall();
    };

    socket.on('call:ringing', onCallRinging);
    socket.on('call:accepted', onCallAccepted);
    socket.on('call:joined_group', onJoinedGroup);
    socket.on('room:peer_joined', onPeerJoined);
    socket.on('room:peer_left', onPeerLeft);
    socket.on('room:peer_reconnecting', onPeerReconnecting);
    socket.on('room:peer_reconnected', onPeerReconnected);
    socket.on('room:media_state', onMediaState);
    socket.on('call:rejected', onCallRejected);
    socket.on('call:ended', onCallEnded);
    socket.on('widget:client_left', onWidgetClientLeft);
    socket.on('call:error', onCallError);
    socket.on('call:invite_sent', onInviteSent);
    socket.on('call:invite_rejected', onInviteRejected);
    socket.on('call:invite_error', onInviteError);
    socket.on('webrtc:offer', handleWebRTCOffer);
    socket.on('webrtc:answer', handleWebRTCAnswer);
    socket.on('webrtc:ice_candidate', handleWebRTCIceCandidate);
    socket.on('chat:message', onChatMessage);
    socket.on('call:reaction', onReaction);
    socket.on('presence:online_list', onOnlineList);

    socketService.onLocal('call:accepted_broadcast', onBroadcastAccepted);
    socketService.onLocal('call:rejected_broadcast', onBroadcastRejected);

    socketService.setDirectCallMounted(true);
    const buffered = socketService.drainEarlyEvents();
    for (const item of buffered) {
      if (item.event === 'call:accepted') onCallAccepted(item.payload);
      else if (item.event === 'webrtc:offer') handleWebRTCOffer(item.payload);
      else if (item.event === 'webrtc:answer') handleWebRTCAnswer(item.payload);
      else if (item.event === 'webrtc:ice_candidate') handleWebRTCIceCandidate(item.payload);
      else if (item.event === 'chat:message') onChatMessage(item.payload);
    }

    socket.emit('presence:request_online_list');

    return () => {
      socketService.setDirectCallMounted(false);
      socket.off('call:ringing', onCallRinging);
      socket.off('call:accepted', onCallAccepted);
      socket.off('call:joined_group', onJoinedGroup);
      socket.off('room:peer_joined', onPeerJoined);
      socket.off('room:peer_left', onPeerLeft);
      socket.off('room:peer_reconnecting', onPeerReconnecting);
      socket.off('room:peer_reconnected', onPeerReconnected);
      socket.off('room:media_state', onMediaState);
      socket.off('call:rejected', onCallRejected);
      socket.off('call:ended', onCallEnded);
      socket.off('widget:client_left', onWidgetClientLeft);
      socket.off('call:error', onCallError);
      socket.off('call:invite_sent', onInviteSent);
      socket.off('call:invite_rejected', onInviteRejected);
      socket.off('call:invite_error', onInviteError);
      socket.off('webrtc:offer', handleWebRTCOffer);
      socket.off('webrtc:answer', handleWebRTCAnswer);
      socket.off('webrtc:ice_candidate', handleWebRTCIceCandidate);
      socket.off('chat:message', onChatMessage);
      socket.off('call:reaction', onReaction);
      socket.off('presence:online_list', onOnlineList);

      socketService.offLocal('call:accepted_broadcast', onBroadcastAccepted);
      socketService.offLocal('call:rejected_broadcast', onBroadcastRejected);
    };
  }, [socket, cleanupCall, setupPeerRTC, triggerFloatingEmoji]);

  const normalizeDialCode = (raw: string): string => {
    const clean = raw.trim().toUpperCase();
    if (!clean) return '';
    if (/^\d{4,}$/.test(clean)) return `#CR-${clean}`;
    if (clean.startsWith('CR-')) return `#${clean}`;
    return clean.startsWith('#') ? clean : `#${clean}`;
  };

  // Lookup target user by unique code
  useEffect(() => {
    const normalized = normalizeDialCode(dialCode);
    if (normalized.length >= 7) {
      fetch(`/api/users/by-code/${encodeURIComponent(normalized)}`)
        .then((res) => {
          const contentType = res.headers.get('content-type');
          if (res.ok && contentType && contentType.includes('application/json')) {
            return res.json();
          }
          return null;
        })
        .then((data) => {
          if (data?.user) {
            setTargetPreview(data.user);
            setDialError(null);
          } else {
            const localUser = localDb.getUserByCode(normalized);
            if (localUser) {
              setTargetPreview({ ...localUser, status: 'online' });
              setDialError(null);
            } else {
              setTargetPreview(null);
            }
          }
        })
        .catch(() => {
          const localUser = localDb.getUserByCode(normalized);
          if (localUser) {
            setTargetPreview({ ...localUser, status: 'online' });
            setDialError(null);
          } else {
            setTargetPreview(null);
          }
        });
    } else {
      setTargetPreview(null);
    }
  }, [dialCode]);

  // Initiate direct call
  const handleDial = (type: 'video' | 'audio' = 'video', overrideCode?: string) => {
    setDialError(null);
    if (!user) {
      setDialError('Faça login ou selecione uma conta de acesso rápido no topo para fazer chamadas diretas.');
      return;
    }

    const codeToDial = overrideCode || dialCode;
    const cleanCode = normalizeDialCode(codeToDial);
    if (!cleanCode) {
      setDialError('Digite um código de usuário válido (ex: #CR-849201).');
      return;
    }

    if (user.unique_code.toUpperCase() === cleanCode) {
      setDialError('Você não pode ligar para o seu próprio código.');
      return;
    }

    socketService.identify(user);
    setDialCode(cleanCode);
    setIsTargetOffline(false);
    setCallStatus('calling');
    setCallMode(type);
    setIsVideoDisabled(type === 'audio');
    setActiveClientMeta(null);
    setIsCallHost(true);
    sounds.unlockAudio();
    sounds.startOutgoingRing();

    socket.emit('call:dial', {
      targetCode: cleanCode,
      callType: type,
      callerInfo: {
        id: user.id,
        username: user.username,
        unique_code: user.unique_code,
        avatar: user.avatar,
        country: user.country,
      },
    });

    if (!socketService.isConnected) {
      socketService.broadcastLocal('call:incoming_broadcast', {
        targetCode: cleanCode,
        callId: `call_${Date.now()}_local`,
        callerSocketId: socket.id || 'local_tab',
        caller: {
          id: user.id,
          username: user.username,
          unique_code: user.unique_code,
          avatar: user.avatar,
          country: user.country,
        },
        callType: type,
      });
    }
  };

  // Send invite to add another user to the active call (Host only)
  const handleSendInvite = (targetCode: string) => {
    const clean = targetCode.trim().toUpperCase();
    if (!clean) return;
    const formatted = clean.startsWith('#') ? clean : `#${clean}`;

    setInviteFeedback(null);
    socket.emit('call:invite', {
      roomId: currentRoomId || `direct_room_${currentCallId || Date.now()}`,
      callId: currentCallId || `call_${Date.now()}`,
      targetCode: formatted,
      callerInfo: user
        ? {
            id: user.id,
            username: user.username,
            unique_code: user.unique_code,
            avatar: user.avatar,
            country: user.country,
          }
        : undefined,
    });
  };

  // Hangup call (explicit user action)
  const handleHangup = () => {
    sounds.playHangupTone();
    const firstPeerSocketId = remotePeers[0]?.socketId;
    socket.emit('call:hangup', {
      callId: currentCallId || undefined,
      roomId: currentRoomId || undefined,
      targetSocketId: firstPeerSocketId || undefined,
    });
    cleanupCall();
  };

  // Dial pad button press
  const handlePadPress = (val: string) => {
    setDialError(null);
    if (val === 'DEL') {
      setDialCode((prev) => prev.slice(0, -1));
    } else if (val === 'CLR') {
      setDialCode('');
    } else {
      setDialCode((prev) => {
        let next = prev + val;
        if (!next.startsWith('#')) {
          if (next.startsWith('CR')) {
            next = '#' + next;
          } else if (/^\d/.test(next)) {
            next = '#CR-' + next;
          }
        }
        return next;
      });
    }
  };

  // Toggle Mute & sync to room
  const toggleMic = () => {
    const stream = localStreamRef.current;
    if (stream) {
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        const muted = !audioTrack.enabled;
        setIsMicMuted(muted);
        if (currentRoomId) {
          socket.emit('room:media_state', {
            roomId: currentRoomId,
            isMicMuted: muted,
            isVideoDisabled,
          });
        }
      }
    }
  };

  // Toggle Video & sync to room (also upgrades audio-only attendance calls to video on demand)
  const toggleVideo = async () => {
    const stream = localStreamRef.current;
    if (stream) {
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        const disabled = !videoTrack.enabled;
        setIsVideoDisabled(disabled);
        if (!disabled && callMode === 'audio') {
          setCallMode('video');
        }
        if (currentRoomId) {
          socket.emit('room:media_state', {
            roomId: currentRoomId,
            isMicMuted,
            isVideoDisabled: disabled,
          });
        }
        return;
      }
    }

    // No video track yet (started as audio-only call) -> upgrade camera on demand
    try {
      const camStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
      });
      const newVideoTrack = camStream.getVideoTracks()[0];
      if (newVideoTrack) {
        const targetStream = localStreamRef.current || new MediaStream();
        targetStream.addTrack(newVideoTrack);
        localStreamRef.current = targetStream;
        setLocalStream(new MediaStream(targetStream.getTracks()));
        mediaBridge.setStream(targetStream);

        peerConnectionsRef.current.forEach((rtc) => {
          const pc = rtc.peerConnection;
          if (!pc) return;
          const videoSender = pc.getSenders().find((s) => s.track?.kind === 'video');
          if (videoSender) {
            videoSender.replaceTrack(newVideoTrack).catch(() => {});
          } else {
            try {
              pc.addTrack(newVideoTrack, targetStream);
            } catch {
              // ignore
            }
          }
        });

        setCallMode('video');
        setIsVideoDisabled(false);
        if (currentRoomId) {
          socket.emit('room:media_state', {
            roomId: currentRoomId,
            isMicMuted,
            isVideoDisabled: false,
          });
        }
      }
    } catch {
      // Camera unavailable on device
    }
  };

  // Send room-wide message
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const text = inputText.trim();
    setInputText('');

    const targetSocket = remotePeers[0]?.socketId;
    if (currentRoomId && targetSocket !== 'virtual_peer' && targetSocket !== 'mock_caller') {
      socket.emit('chat:message', {
        roomId: currentRoomId,
        callId: currentCallId || undefined,
        toSocketId: targetSocket,
        text,
        senderName: user?.username || 'Usuário',
      });
    } else {
      // Virtual / Offline fallback local echo
      setMessages((prev) => [
        ...prev,
        {
          id: `msg_${Date.now()}`,
          sender_name: user?.username || 'Você',
          sender_code: user?.unique_code,
          text,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          isSelf: true,
        },
      ]);
    }
  };

  // Send room-wide reaction
  const sendReaction = (emoji: string) => {
    triggerFloatingEmoji(emoji, 'Você');
    const targetSocket = remotePeers[0]?.socketId;
    if (currentRoomId || (targetSocket && targetSocket !== 'virtual_peer' && targetSocket !== 'mock_caller')) {
      socket.emit('call:reaction', {
        roomId: currentRoomId || undefined,
        toSocketId: targetSocket || undefined,
        emoji,
        senderName: user?.username,
      });
    }
  };

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Primary right-hand peer + any overlaid guest peer(s)
  const primaryPeer =
    remotePeers.find((p) => p.socketId === pinnedPeerSocketId) || remotePeers[0] || null;
  const overlayPeers = primaryPeer
    ? remotePeers.filter((p) => p.socketId !== primaryPeer.socketId)
    : [];

  // Available online users not already in the call
  const invitableOnlineUsers = onlineUsers.filter(
    (u) => !remotePeers.some((rp) => rp.id === u.id || rp.unique_code === u.unique_code)
  );

  // CONNECTED STATE: Audio-First Attendance View OR Side-by-Side Dual Video Arena
  if (callStatus === 'connected') {
    const totalParticipants = 1 + remotePeers.length;

    // AUDIO ATTENDANCE & MODERN CHAT ARENA (for Client Web Widget calls & audio-only calls)
    if (callMode === 'audio') {
      const waDigits = activeClientMeta?.whatsapp
        ? activeClientMeta.whatsapp.replace(/\D/g, '')
        : '';
      const waNormalized =
        waDigits && waDigits.length <= 11 && !waDigits.startsWith('55') ? `55${waDigits}` : waDigits;

      return (
        <div className="relative flex flex-col flex-1 min-h-0 bg-zinc-950 overflow-hidden">
          {/* Dedicated audio player with autoplay fallback button */}
          <AudioStreamPlayer stream={primaryPeer?.stream || null} />

          {/* Audio Call Header */}
          <div className="flex items-center justify-between px-4 sm:px-6 py-2.5 bg-zinc-900/90 border-b border-zinc-800 text-xs z-20">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className={`h-2.5 w-2.5 rounded-full ${clientLeftNotice ? 'bg-amber-400' : 'bg-emerald-400'}`} />
              <span className="font-extrabold text-white text-sm">
                {activeClientMeta
                  ? `Atendimento por Áudio • ${activeClientMeta.clientLabel}`
                  : `Chamada de Áudio • ${primaryPeer?.username || activeCallPartner?.username || 'Participante'}`}
              </span>
              {clientLeftNotice ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-amber-500/15 text-amber-300 border border-amber-500/30 rounded-md text-[11px] font-bold">
                  {clientLeftNotice}
                </span>
              ) : (
                <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-md font-mono text-[11px] font-bold">
                  <Wifi className="w-3 h-3" /> {primaryPeer?.connectionState === 'connected' ? 'Voz Ativa P2P' : 'Sincronizando Voz P2P'}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              <span className="font-mono font-bold text-zinc-200 text-xs sm:text-sm bg-zinc-800 px-3 py-1 rounded-full border border-zinc-700 tabular-nums">
                {formatTimer(callDuration)}
              </span>
              {!clientLeftNotice && (
                <button
                  onClick={() => toggleVideo()}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-indigo-600 text-zinc-100 rounded-lg text-xs font-semibold border border-zinc-700 transition cursor-pointer"
                  title="Ativar vídeo na chamada"
                >
                  <Video className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Ligar Câmera</span>
                </button>
              )}
            </div>
          </div>

          {clientLeftNotice && (
            <div className="bg-amber-500/15 border-b border-amber-500/30 px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs z-20">
              <div className="flex items-center gap-2 text-amber-200 font-bold">
                <PhoneOff className="w-4 h-4 text-amber-400" />
                <span>{clientLeftNotice} — A conversa foi encerrada pelo visitante.</span>
              </div>
              <button
                type="button"
                onClick={cleanupCall}
                className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-extrabold rounded-lg transition cursor-pointer"
              >
                Fechar Atendimento
              </button>
            </div>
          )}

          {/* Main Audio + Client Info + Live Chat Workspace */}
          <div className="flex-1 min-h-0 p-4 sm:p-6 overflow-y-auto lg:overflow-hidden">
            <div className="max-w-6xl mx-auto h-full grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
              {/* Left Column: Audio Presence & Client Lead Card */}
              <div className="lg:col-span-5 bg-zinc-900/90 border border-zinc-800 rounded-3xl p-6 flex flex-col justify-between shadow-2xl">
                <div>
                  <div className="flex items-center gap-4 mb-5">
                    <div className="relative">
                      <img
                        src={resolveAvatarUrl(
                          primaryPeer?.avatar || activeCallPartner?.avatar,
                          activeClientMeta?.name || primaryPeer?.username || 'Cliente'
                        )}
                        alt={activeClientMeta?.name || primaryPeer?.username || 'Cliente'}
                        className="w-16 h-16 rounded-2xl object-cover border-2 border-emerald-500/60"
                      />
                      <div className={`absolute -bottom-1 -right-1 p-1.5 rounded-lg text-white ${clientLeftNotice ? 'bg-amber-600' : 'bg-emerald-600'}`}>
                        <Headphones className="w-3.5 h-3.5" />
                      </div>
                    </div>
                    <div className="min-w-0">
                      <span className="inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 mb-1">
                        {activeClientMeta?.clientLabel || 'Chamada de Áudio'}
                      </span>
                      <h3 className="text-lg font-extrabold text-white truncate">
                        {activeClientMeta?.name || primaryPeer?.username || 'Participante'}
                      </h3>
                      <p className={`text-xs ${clientLeftNotice ? 'text-amber-300 font-semibold' : 'text-zinc-400'}`}>
                        {clientLeftNotice
                          ? clientLeftNotice
                          : primaryPeer?.connectionState === 'connected'
                          ? 'Áudio P2P conectado em tempo real'
                          : 'Sincronizando áudio P2P...'}
                      </p>
                    </div>
                  </div>

                  {/* Subtle Audio Level Visualizer + Real Microphone Activation */}
                  <div className="mb-5 p-4 bg-zinc-950 border border-zinc-800 rounded-2xl space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5 text-xs">
                        {clientLeftNotice ? (
                          <>
                            <PhoneOff className="w-4 h-4 text-amber-400" />
                            <span className="font-semibold text-amber-300">{clientLeftNotice}</span>
                          </>
                        ) : !hasRealMic ? (
                          <>
                            <MicOff className="w-4 h-4 text-amber-400" />
                            <span className="font-semibold text-amber-300">Microfone não liberado no navegador</span>
                          </>
                        ) : isMicMuted ? (
                          <>
                            <MicOff className="w-4 h-4 text-rose-400" />
                            <span className="font-semibold text-rose-300">Seu microfone está mutado</span>
                          </>
                        ) : (
                          <>
                            <Mic className="w-4 h-4 text-emerald-400" />
                            <span className="font-semibold text-emerald-300">Seu áudio está ativo</span>
                          </>
                        )}
                      </div>
                      {!clientLeftNotice && (
                        <div className="flex items-end gap-1 h-4" aria-hidden="true">
                          <span className={`w-1 rounded-full ${isMicMuted || !hasRealMic ? 'h-1 bg-zinc-700' : 'h-3 bg-emerald-400 animate-pulse'}`} />
                          <span className={`w-1 rounded-full ${isMicMuted || !hasRealMic ? 'h-1 bg-zinc-700' : 'h-4 bg-emerald-500 animate-pulse'}`} />
                          <span className={`w-1 rounded-full ${isMicMuted || !hasRealMic ? 'h-1 bg-zinc-700' : 'h-2.5 bg-emerald-400 animate-pulse'}`} />
                          <span className={`w-1 rounded-full ${isMicMuted || !hasRealMic ? 'h-1 bg-zinc-700' : 'h-3.5 bg-emerald-500 animate-pulse'}`} />
                        </div>
                      )}
                    </div>
                    {!hasRealMic && !clientLeftNotice && (
                      <button
                        type="button"
                        onClick={() => activateMicrophoneNow()}
                        className="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition cursor-pointer"
                      >
                        Ativar Microfone Agora
                      </button>
                    )}
                  </div>

                  {/* Client Lead Details */}
                  {activeClientMeta && (
                    <div className="space-y-3 bg-zinc-950/90 border border-zinc-800 rounded-2xl p-4 text-xs">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
                        Ficha do Cliente
                      </div>
                      <div className="flex items-center justify-between gap-2 py-1 border-b border-zinc-800/80">
                        <span className="text-zinc-400 flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5 text-emerald-400" /> WhatsApp
                        </span>
                        {waNormalized ? (
                          <a
                            href={`https://wa.me/${waNormalized}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono font-semibold text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-1"
                          >
                            <span>{activeClientMeta.whatsapp}</span>
                            <ArrowUpRight className="w-3 h-3" />
                          </a>
                        ) : (
                          <span className="text-zinc-300">{activeClientMeta.whatsapp}</span>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-2 py-1 border-b border-zinc-800/80">
                        <span className="text-zinc-400 flex items-center gap-1.5">
                          <Mail className="w-3.5 h-3.5 text-indigo-400" /> E-mail
                        </span>
                        <span className="text-zinc-200 truncate">{activeClientMeta.email}</span>
                      </div>
                      {activeClientMeta.call_date && (
                        <div className="flex items-center justify-between gap-2 py-1 border-b border-zinc-800/80">
                          <span className="text-zinc-400 flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-zinc-400" /> Data
                          </span>
                          <span className="text-zinc-300 font-mono tabular-nums">
                            {new Date(activeClientMeta.call_date).toLocaleString('pt-BR')}
                          </span>
                        </div>
                      )}
                      {activeClientMeta.message && (
                        <div className="pt-1">
                          <span className="text-zinc-400 block mb-1">Mensagem inicial:</span>
                          <p className="text-zinc-200 bg-zinc-900 border border-zinc-800 rounded-xl p-2.5 leading-relaxed">
                            {activeClientMeta.message}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="mt-5 pt-4 border-t border-zinc-800 flex items-center justify-between gap-2">
                  {!clientLeftNotice && (
                    <button
                      onClick={toggleMic}
                      className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer ${
                        isMicMuted
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                          : 'bg-zinc-800 hover:bg-zinc-700 text-white'
                      }`}
                    >
                      {isMicMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                      <span>{isMicMuted ? 'Desmutar' : 'Mutar Áudio'}</span>
                    </button>
                  )}
                  <button
                    onClick={clientLeftNotice ? cleanupCall : handleHangup}
                    className="flex-1 py-2.5 px-3 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-500 text-white flex items-center justify-center gap-2 transition cursor-pointer"
                  >
                    <PhoneOff className="w-4 h-4" />
                    <span>{clientLeftNotice ? 'Fechar Atendimento' : 'Encerrar'}</span>
                  </button>
                </div>
              </div>

              {/* Right Column: Live Customer Chat Panel */}
              <div className="lg:col-span-7 bg-zinc-900/90 border border-zinc-800 rounded-3xl flex flex-col min-h-[360px] overflow-hidden shadow-2xl">
                <div className="px-5 py-3.5 border-b border-zinc-800 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-white font-bold text-xs">
                    <MessageSquare className="w-4 h-4 text-emerald-400" />
                    <span>Chat em Tempo Real • {activeClientMeta?.clientLabel || 'Atendimento'}</span>
                  </div>
                  <span className="text-[11px] text-zinc-400">
                    Mensagens sincronizadas com o visitante
                  </span>
                </div>

                <div className="flex-1 p-4 overflow-y-auto space-y-3 text-xs">
                  {messages.length === 0 ? (
                    <div className="text-center py-12 text-zinc-500 text-xs">
                      Nenhuma mensagem ainda. Converse por voz ou envie uma mensagem de texto abaixo.
                    </div>
                  ) : (
                    messages.map((m) =>
                      m.isSystem ? (
                        <div key={m.id} className="text-center py-1">
                          <span
                            className={`px-3 py-1 rounded-full text-[11px] font-bold border ${
                              m.text.toLowerCase().includes('saiu')
                                ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                                : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                            }`}
                          >
                            {m.text}
                          </span>
                        </div>
                      ) : (
                        <div
                          key={m.id}
                          className={`flex flex-col ${m.isSelf ? 'items-end' : 'items-start'}`}
                        >
                          <span className="text-[10px] text-zinc-400 mb-0.5">
                            {m.sender_name} • {m.timestamp}
                          </span>
                          <div
                            className={`px-3.5 py-2.5 rounded-2xl max-w-[85%] break-words ${
                              m.isSelf
                                ? 'bg-emerald-600 text-white rounded-tr-none'
                                : 'bg-zinc-800 text-zinc-100 rounded-tl-none border border-zinc-700/60'
                            }`}
                          >
                            {m.text}
                          </div>
                        </div>
                      )
                    )
                  )}
                  <div ref={chatBottomRef} />
                </div>

                <form onSubmit={handleSendMessage} className="p-3.5 border-t border-zinc-800 flex gap-2 bg-zinc-950/60">
                  <input
                    type="text"
                    value={inputText}
                    disabled={Boolean(clientLeftNotice)}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder={
                      clientLeftNotice
                        ? 'Cliente Saiu do Chat — clique em Fechar Atendimento quando terminar.'
                        : 'Escreva uma resposta para o cliente...'
                    }
                    className="flex-1 px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-white text-xs placeholder-zinc-500 focus:outline-none focus:border-emerald-500 disabled:opacity-60"
                  />
                  <button
                    type="submit"
                    disabled={Boolean(clientLeftNotice)}
                    className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                  >
                    <Send className="w-4 h-4" />
                    <span className="hidden sm:inline">Enviar</span>
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="relative flex flex-col flex-1 min-h-0 bg-zinc-950 overflow-hidden">
        {/* Call Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-2.5 bg-zinc-900/90 border-b border-zinc-800 text-xs z-20">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-extrabold text-white text-sm">
              {totalParticipants > 2
                ? `Chamada em Grupo (${totalParticipants} participantes)`
                : 'Chamada Direta • Vídeos Lado a Lado'}
            </span>
            {isCallHost && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-500/15 text-amber-300 border border-amber-500/30 rounded-md text-[10px] font-bold">
                <Crown className="w-3 h-3" /> Anfitrião
              </span>
            )}
            <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-md font-mono text-[11px] font-bold">
              <Wifi className="w-3 h-3" /> Ligação Estável
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {isCallHost && (
              <button
                onClick={() => {
                  socket.emit('presence:request_online_list');
                  setIsInviteOpen(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold shadow-md shadow-indigo-600/30 transition cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Convidar</span>
              </button>
            )}

            <span className="font-mono font-bold text-zinc-300 text-xs sm:text-sm bg-zinc-800 px-3 py-1 rounded-full flex items-center gap-1.5 border border-zinc-700">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              {formatTimer(callDuration)}
            </span>

            {primaryPeer && (
              <button
                onClick={() => onReportUser(primaryPeer.unique_code, primaryPeer.username)}
                className="flex items-center gap-1 px-2.5 py-1 bg-red-950/40 hover:bg-red-900/50 text-red-300 rounded-lg text-xs font-semibold border border-red-500/30 cursor-pointer"
              >
                <Flag className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Denunciar</span>
              </button>
            )}
          </div>
        </div>

        {/* Video Canvas Arena (SIDE-BY-SIDE DUAL PANELS + OVERLAID GUEST VIDEO) */}
        <div className="relative flex-1 bg-zinc-950 p-2 sm:p-4 flex items-center justify-center overflow-hidden">
          <div className="w-full h-full max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 items-stretch">
            {/* LEFT PANEL: Você (Local User) */}
            <div className="relative bg-zinc-900 border-2 border-zinc-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col min-h-[200px]">
              <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden">
                {!isVideoDisabled ? (
                  <VideoStreamPlayer
                    stream={localStream}
                    muted={true}
                    mirrored={true}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-900 text-zinc-500 p-4">
                    <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mb-2">
                      <VideoOff className="w-8 h-8 text-zinc-400" />
                    </div>
                    <span className="text-xs font-semibold text-zinc-400">Sua câmera está desativada</span>
                  </div>
                )}

                {/* Local Header Badge */}
                <div className="absolute top-3 left-3 flex items-center gap-2 px-3 py-1.5 bg-black/75 backdrop-blur-md rounded-xl text-xs font-bold text-white border border-white/10 shadow-lg">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Você ({user?.username || 'Usuário'})</span>
                  <span className="font-mono text-emerald-400 text-[11px] font-semibold">
                    {user?.unique_code}
                  </span>
                  {isCallHost && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-amber-500/20 text-amber-300 rounded font-bold">
                      Anfitrião
                    </span>
                  )}
                </div>

                {/* Local Mic Badge */}
                <div className="absolute top-3 right-3 flex items-center gap-1 px-2.5 py-1 bg-black/75 backdrop-blur-md rounded-xl text-xs border border-white/10">
                  {isMicMuted ? (
                    <span className="flex items-center gap-1 text-red-400 font-semibold text-[11px]">
                      <MicOff className="w-3.5 h-3.5" /> Mutado
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-emerald-400 font-semibold text-[11px]">
                      <Mic className="w-3.5 h-3.5 animate-pulse" /> Áudio Ativo
                    </span>
                  )}
                </div>

                <div className="absolute bottom-3 left-3 px-2.5 py-1 bg-black/60 backdrop-blur-sm rounded-lg text-[10px] text-zinc-300 font-medium">
                  Feed Local • Transmissão Direta
                </div>
              </div>
            </div>

            {/* RIGHT PANEL: Principal Destinatário / Membro */}
            <div className="relative bg-zinc-900 border-2 border-zinc-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col min-h-[200px]">
              <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden">
                {primaryPeer?.stream && (
                  <VideoStreamPlayer
                    stream={primaryPeer.stream}
                    muted={false}
                    className={`w-full h-full object-cover ${primaryPeer.isVideoDisabled ? 'hidden' : ''}`}
                  />
                )}
                {(!primaryPeer?.stream || primaryPeer.isVideoDisabled) && (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-900 text-zinc-400 p-6 text-center">
                    <div className="w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center mb-3 animate-pulse">
                      {primaryPeer?.isVideoDisabled ? (
                        <VideoOff className="w-8 h-8 text-zinc-400" />
                      ) : (
                        <Video className="w-8 h-8 text-emerald-400" />
                      )}
                    </div>
                    <p className="font-bold text-white text-sm">
                      {primaryPeer?.isReconnecting
                        ? 'Reconectando sinal do participante...'
                        : primaryPeer?.isVideoDisabled
                        ? 'Câmera pausada pelo participante'
                        : 'Conexão Direta Ativa'}
                    </p>
                    <p className="text-xs text-zinc-500 mt-1">
                      {primaryPeer?.isReconnecting
                        ? 'A chamada permanecerá estável enquanto o sinal retorna'
                        : primaryPeer?.isVideoDisabled
                        ? 'Áudio ativo em tempo real'
                        : 'Sincronizando áudio e vídeo...'}
                    </p>
                  </div>
                )}

                {/* Remote Header Badge */}
                <div className="absolute top-3 left-3 flex items-center gap-2 px-3 py-1.5 bg-black/75 backdrop-blur-md rounded-xl text-xs font-bold text-white border border-white/10 shadow-lg">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>
                    {primaryPeer?.username || activeCallPartner?.username || targetPreview?.username || 'Participante'}
                  </span>
                  {primaryPeer?.country && <span>{primaryPeer.country}</span>}
                  <span className="font-mono text-emerald-400 text-[11px] font-bold">
                    {primaryPeer?.unique_code || activeCallPartner?.unique_code || dialCode}
                  </span>
                  {primaryPeer?.isGuest && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-indigo-500/30 text-indigo-200 rounded font-bold border border-indigo-400/30">
                      Convidado
                    </span>
                  )}
                </div>

                {/* Remote Mic / Connection State */}
                <div className="absolute top-3 right-3 flex items-center gap-2">
                  {primaryPeer?.isMicMuted && (
                    <span className="flex items-center gap-1 px-2.5 py-1 bg-red-950/80 text-red-300 rounded-xl text-[11px] font-bold border border-red-500/40">
                      <MicOff className="w-3 h-3" /> Mutado
                    </span>
                  )}
                  <div
                    className={`flex items-center gap-1.5 px-3 py-1 backdrop-blur-md rounded-xl text-xs font-bold border ${
                      primaryPeer?.isReconnecting || primaryPeer?.connectionState !== 'connected'
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                        : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full animate-ping ${
                        primaryPeer?.isReconnecting || primaryPeer?.connectionState !== 'connected'
                          ? 'bg-amber-400'
                          : 'bg-emerald-400'
                      }`}
                    />
                    <span>
                      {primaryPeer?.isReconnecting
                        ? 'Reconectando...'
                        : primaryPeer?.connectionState === 'connected'
                        ? 'P2P Conectado'
                        : 'Conectando P2P...'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* OVERLAID INVITED GUEST VIDEO PANEL(S) — Sobreposto ao painel de conversa */}
          {overlayPeers.length > 0 && (
            <div className="absolute bottom-4 right-4 sm:bottom-6 sm:right-6 z-20 flex flex-col gap-3 items-end pointer-events-auto">
              {overlayPeers.map((guest) => (
                <div
                  key={guest.socketId}
                  className={`relative bg-zinc-900/95 border-2 border-indigo-500/80 rounded-2xl overflow-hidden shadow-2xl shadow-black/80 transition-all duration-200 ${
                    isOverlayExpanded
                      ? 'w-64 sm:w-80 md:w-96 aspect-video'
                      : 'w-44 sm:w-60 md:w-72 aspect-video'
                  }`}
                >
                  {guest.stream && (
                    <VideoStreamPlayer
                      stream={guest.stream}
                      muted={false}
                      className={`w-full h-full object-cover ${guest.isVideoDisabled ? 'hidden' : ''}`}
                    />
                  )}
                  {(!guest.stream || guest.isVideoDisabled) && (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-900 text-zinc-400 p-3 text-center">
                      <Video className="w-6 h-6 text-indigo-400 animate-pulse mb-1" />
                      <span className="text-[11px] font-semibold text-white">{guest.username}</span>
                      <span className="text-[10px] text-zinc-400">
                        {guest.isReconnecting
                          ? 'Reconectando...'
                          : guest.isVideoDisabled
                          ? 'Câmera desligada'
                          : 'Conectando vídeo...'}
                      </span>
                    </div>
                  )}

                  {/* Guest Overlay Header Badge */}
                  <div className="absolute top-2 left-2 right-2 flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1.5 px-2 py-1 bg-black/80 backdrop-blur-md rounded-lg text-[11px] font-bold text-white border border-indigo-400/30 truncate">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse shrink-0" />
                      <span className="truncate">{guest.username}</span>
                      <span className="text-[9px] px-1 py-0.2 bg-indigo-500/30 text-indigo-200 rounded font-bold shrink-0">
                        {guest.isHost ? 'Anfitrião' : 'Convidado'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => setPinnedPeerSocketId(guest.socketId)}
                        className="p-1.5 bg-black/75 hover:bg-indigo-600 text-white rounded-lg border border-white/10 transition cursor-pointer"
                        title="Trocar com painel principal"
                      >
                        <ArrowLeftRight className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => setIsOverlayExpanded((v) => !v)}
                        className="p-1.5 bg-black/75 hover:bg-zinc-700 text-white rounded-lg border border-white/10 transition cursor-pointer"
                        title={isOverlayExpanded ? 'Compactar' : 'Expandir'}
                      >
                        {isOverlayExpanded ? (
                          <Minimize2 className="w-3 h-3" />
                        ) : (
                          <Maximize2 className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Guest Bottom Status */}
                  <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
                    <span className="font-mono text-[10px] font-bold text-emerald-400 bg-black/70 px-2 py-0.5 rounded-md">
                      {guest.unique_code}
                    </span>
                    {guest.isMicMuted ? (
                      <span className="flex items-center gap-1 px-1.5 py-0.5 bg-red-950/90 text-red-300 rounded text-[10px] font-bold">
                        <MicOff className="w-2.5 h-2.5" /> Mutado
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 px-1.5 py-0.5 bg-emerald-950/80 text-emerald-300 rounded text-[10px] font-bold">
                        <Mic className="w-2.5 h-2.5" /> Ao Vivo
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Floating Emoji Reactions */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden z-30">
            {floatingEmojis.map((item) => (
              <div
                key={item.id}
                style={{ left: `${item.x}%` }}
                className="absolute bottom-8 text-3xl sm:text-4xl animate-bounce flex flex-col items-center drop-shadow-2xl"
              >
                <span>{item.emoji}</span>
                {item.sender && (
                  <span className="text-[10px] font-bold bg-black/70 text-white px-2 py-0.5 rounded-full mt-0.5">
                    {item.sender}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Invite User Modal (Host only) */}
          {isInviteOpen && isCallHost && (
            <div className="absolute inset-0 z-40 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
              <div className="w-full max-w-md bg-zinc-900 border border-indigo-500/40 rounded-3xl p-6 shadow-2xl animate-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-xl">
                      <UserPlus className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-extrabold text-white">Convidar Usuário para Chamada</h3>
                      <p className="text-[11px] text-zinc-400">
                        O convidado entra com vídeo sobreposto ao painel e interage com todos
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsInviteOpen(false)}
                    className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {inviteFeedback && (
                  <div
                    className={`mb-4 p-3 rounded-2xl text-xs flex items-center gap-2 border ${
                      inviteFeedback.type === 'success'
                        ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                        : inviteFeedback.type === 'error'
                        ? 'bg-red-950/40 border-red-500/40 text-red-300'
                        : 'bg-indigo-950/40 border-indigo-500/40 text-indigo-200'
                    }`}
                  >
                    {inviteFeedback.type === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 shrink-0" />
                    )}
                    <span>{inviteFeedback.text}</span>
                  </div>
                )}

                {/* Invite by Code */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendInvite(inviteCodeInput);
                  }}
                  className="flex gap-2 mb-5"
                >
                  <input
                    type="text"
                    value={inviteCodeInput}
                    onChange={(e) => setInviteCodeInput(e.target.value.toUpperCase())}
                    placeholder="Digite o código ex: #CR-193852"
                    className="flex-1 px-3.5 py-2.5 bg-zinc-950 border border-zinc-700 rounded-xl text-white font-mono text-xs focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs transition cursor-pointer shrink-0"
                  >
                    Convidar
                  </button>
                </form>

                {/* Online Users Quick Invite */}
                <div>
                  <div className="flex items-center justify-between text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-2">
                    <span>Usuários Online Disponíveis</span>
                    <span className="text-emerald-400">{invitableOnlineUsers.length} online</span>
                  </div>

                  {invitableOnlineUsers.length === 0 ? (
                    <div className="p-4 bg-zinc-950/70 border border-zinc-800 rounded-2xl text-center text-xs text-zinc-400">
                      Nenhum outro usuário conectado no momento. Você pode digitar um código acima ou abrir outra aba para testar.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                      {invitableOnlineUsers.map((u) => {
                        const isPending = pendingInvitesList.includes(u.unique_code);
                        return (
                          <div
                            key={u.id}
                            className="p-2.5 bg-zinc-950 border border-zinc-800 rounded-2xl flex items-center justify-between gap-2"
                          >
                            <div className="flex items-center gap-2.5">
                              <img
                                src={resolveAvatarUrl(u.avatar, u.username)}
                                alt={u.username}
                                className="w-8 h-8 rounded-xl object-cover border border-emerald-500/40"
                              />
                              <div>
                                <div className="text-xs font-bold text-white">{u.username}</div>
                                <div className="font-mono text-[11px] text-emerald-400">{u.unique_code}</div>
                              </div>
                            </div>
                            <button
                              type="button"
                              disabled={isPending}
                              onClick={() => handleSendInvite(u.unique_code)}
                              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                                isPending
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 cursor-wait'
                                  : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                              }`}
                            >
                              {isPending ? 'Chamando...' : 'Convidar'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* In-Call Group Text Chat Drawer */}
          {isChatOpen && (
            <div className="absolute right-3 top-3 bottom-3 w-80 max-w-[calc(100%-24px)] bg-zinc-900/95 backdrop-blur-md border border-zinc-800 rounded-2xl z-30 flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
              <div className="p-3 border-b border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-2 text-white font-bold text-xs">
                  <MessageSquare className="w-4 h-4 text-indigo-400" />
                  <span>Chat da Chamada ({totalParticipants} membros)</span>
                </div>
                <button
                  onClick={() => setIsChatOpen(false)}
                  className="text-zinc-400 hover:text-white text-xs px-2 py-1 rounded hover:bg-zinc-800 cursor-pointer"
                >
                  Fechar
                </button>
              </div>

              {/* Messages List */}
              <div className="flex-1 p-3 overflow-y-auto space-y-2.5 text-xs">
                {messages.length === 0 ? (
                  <div className="text-center py-8 text-zinc-500 italic text-[11px]">
                    Nenhuma mensagem ainda. Converse com os membros da chamada!
                  </div>
                ) : (
                  messages.map((m) =>
                    m.isSystem ? (
                      <div key={m.id} className="text-center py-1">
                        <span className="px-2.5 py-1 bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 rounded-full text-[10px] font-semibold">
                          {m.text}
                        </span>
                      </div>
                    ) : (
                      <div
                        key={m.id}
                        className={`flex flex-col ${m.isSelf ? 'items-end' : 'items-start'}`}
                      >
                        <span className="text-[10px] text-zinc-400 mb-0.5">
                          {m.sender_name} {m.sender_code ? `(${m.sender_code})` : ''} • {m.timestamp}
                        </span>
                        <div
                          className={`px-3 py-2 rounded-2xl max-w-[85%] break-words ${
                            m.isSelf
                              ? 'bg-indigo-600 text-white rounded-tr-none'
                              : 'bg-zinc-800 text-zinc-100 rounded-tl-none border border-zinc-700/60'
                          }`}
                        >
                          {m.text}
                        </div>
                      </div>
                    )
                  )
                )}
                <div ref={chatBottomRef} />
              </div>

              {/* Chat Input */}
              <form onSubmit={handleSendMessage} className="p-3 border-t border-zinc-800 flex gap-2">
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Mensagem para todos..."
                  className="flex-1 px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-white text-xs placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="submit"
                  className="p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          )}
        </div>

        {/* In-Call Controls Bottom Bar */}
        <div className="bg-zinc-950/95 backdrop-blur-md border-t border-zinc-800 py-3 px-4 sm:px-6 z-20">
          <div className="max-w-3xl mx-auto flex flex-wrap items-center justify-center gap-2.5 sm:gap-3.5">
            <button
              onClick={toggleMic}
              className={`p-3 rounded-full transition cursor-pointer ${
                isMicMuted
                  ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                  : 'bg-zinc-800 text-white hover:bg-zinc-700'
              }`}
              title={isMicMuted ? 'Desmutar Microfone' : 'Mutar Microfone'}
            >
              {isMicMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>

            <button
              onClick={toggleVideo}
              className={`p-3 rounded-full transition cursor-pointer ${
                isVideoDisabled
                  ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                  : 'bg-zinc-800 text-white hover:bg-zinc-700'
              }`}
              title={isVideoDisabled ? 'Ligar Câmera' : 'Desligar Câmera'}
            >
              {isVideoDisabled ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
            </button>

            {isCallHost && (
              <button
                onClick={() => {
                  socket.emit('presence:request_online_list');
                  setIsInviteOpen(true);
                }}
                className="px-4 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-full shadow-lg shadow-indigo-600/30 transition flex items-center gap-2 cursor-pointer text-xs"
                title="Convidar outro usuário para participar da chamada"
              >
                <UserPlus className="w-4 h-4" />
                <span className="hidden sm:inline">Convidar Usuário</span>
              </button>
            )}

            <button
              onClick={handleHangup}
              className="px-6 sm:px-8 py-3 bg-red-600 hover:bg-red-500 active:bg-red-700 text-white font-bold rounded-full shadow-lg shadow-red-600/30 transition flex items-center gap-2 transform hover:scale-105 active:scale-95 cursor-pointer text-xs sm:text-sm"
            >
              <PhoneOff className="w-4 h-4 sm:w-5 sm:h-5" />
              <span>{totalParticipants > 2 ? 'Sair da Chamada' : 'Desligar Chamada'}</span>
            </button>

            <button
              onClick={() => setIsChatOpen(!isChatOpen)}
              className={`relative p-3 rounded-full transition cursor-pointer ${
                isChatOpen
                  ? 'bg-indigo-600 text-white'
                  : 'bg-zinc-800 text-white hover:bg-zinc-700'
              }`}
              title="Abrir Chat da Chamada"
            >
              <MessageSquare className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-emerald-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </button>

            {/* Quick Reaction Bar */}
            <div className="hidden md:flex items-center gap-1 pl-2 border-l border-zinc-800">
              {['👍', '❤️', '😂', '🔥', '👏'].map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => sendReaction(emoji)}
                  className="p-1.5 hover:bg-zinc-800 rounded-full text-base transition transform hover:scale-125 cursor-pointer"
                  title={`Reagir com ${emoji}`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // OUTGOING CALL RINGING STATE: Show Dual Calling Screen (SIDE-BY-SIDE)
  if (callStatus === 'calling') {
    return (
      <div className="relative flex flex-col flex-1 min-h-0 bg-zinc-950 overflow-hidden">
        <div className="flex items-center justify-between px-4 sm:px-6 py-2.5 bg-zinc-900/90 border-b border-zinc-800 text-xs">
          <div className="flex items-center gap-3">
            <span className="flex h-2.5 w-2.5 rounded-full bg-amber-400 animate-ping" />
            <span className="font-bold text-white text-sm">
              Discando Chamada • {targetPreview?.username || activeCallPartner?.username || dialCode}
            </span>
          </div>
          <span className="text-zinc-400 text-xs flex items-center gap-1.5">
            <Volume2 className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            Tocando tom telefônico...
          </span>
        </div>

        <div className="relative flex-1 bg-zinc-950 p-2 sm:p-4 flex items-center justify-center overflow-hidden">
          <div className="w-full h-full max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 items-stretch">
            {/* Left: Your Camera */}
            <div className="relative bg-zinc-900 border-2 border-zinc-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col min-h-[220px]">
              <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden">
                <VideoStreamPlayer
                  stream={localStream}
                  muted={true}
                  mirrored={true}
                  className={`w-full h-full object-cover ${isVideoDisabled ? 'hidden' : ''}`}
                />
                <div className="absolute top-3 left-3 px-3 py-1.5 bg-black/70 backdrop-blur-md rounded-xl text-xs font-bold text-white border border-white/10">
                  Você ({user?.username}) • Câmera Pronta
                </div>
              </div>
            </div>

            {/* Right: Target Ringing */}
            <div className="relative bg-zinc-900 border-2 border-indigo-500/40 rounded-3xl overflow-hidden shadow-2xl flex flex-col items-center justify-center p-6 text-center min-h-[220px]">
              <div className="relative w-24 h-24 mx-auto mb-4">
                <div className="absolute inset-0 rounded-full border-4 border-emerald-500/30 animate-ping" />
                <div className="absolute inset-2 rounded-full border-2 border-indigo-500 animate-pulse" />
                <img
                  src={resolveAvatarUrl(
                    targetPreview?.avatar || activeCallPartner?.avatar,
                    targetPreview?.username || activeCallPartner?.username || dialCode
                  )}
                  alt="Calling avatar"
                  className="w-full h-full rounded-full object-cover border-4 border-indigo-500 shadow-2xl relative z-10"
                />
              </div>

              <h3 className="text-xl font-extrabold text-white mb-1">
                {targetPreview?.username || activeCallPartner?.username || 'Destinatário'}
              </h3>
              <p className="font-mono text-base font-black text-emerald-400 mb-2">
                {targetPreview?.unique_code || activeCallPartner?.unique_code || dialCode}
              </p>
              <p className={`text-xs mb-6 flex items-center justify-center gap-1.5 ${isTargetOffline ? 'text-amber-300 font-semibold' : 'text-zinc-400'}`}>
                <Volume2 className={`w-3.5 h-3.5 animate-pulse ${isTargetOffline ? 'text-amber-400' : 'text-emerald-400'}`} />
                <span>
                  {isTargetOffline
                    ? 'Destinatário sem aba conectada no momento. Aguardando conexão para tocar...'
                    : 'Tocando no dispositivo do usuário. Aguardando atendimento...'}
                </span>
              </p>

              <button
                onClick={handleHangup}
                className="px-8 py-3.5 bg-red-600 hover:bg-red-500 text-white font-bold rounded-full shadow-xl shadow-red-600/30 transition flex items-center gap-2 transform hover:scale-105 active:scale-95 cursor-pointer text-xs sm:text-sm"
              >
                <PhoneOff className="w-4 h-4" />
                <span>Cancelar Chamada</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // IDLE STATE: Show Phone Keypad & Online Users & Directory
  return (
    <div className="flex-1 overflow-y-auto bg-zinc-950 p-4 md:p-8">
      <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Phone Dial Pad & Simulator */}
        <div className="lg:col-span-7 bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-2xl">
          {/* Direct Incoming Call Test Banner */}
          <div className="mb-6 p-4 bg-gradient-to-r from-emerald-950/60 via-zinc-900 to-indigo-950/60 border border-emerald-500/40 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 shadow-lg">
            <div className="flex items-center gap-3 text-left">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                <BellRing className="w-5 h-5 animate-bounce" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                  <span>Testar Toque de Chamada</span>
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-mono px-1.5 py-0.2 rounded border border-emerald-500/30">
                    Atender / Recusar
                  </span>
                </h4>
                <p className="text-[11px] text-zinc-400">
                  Dispara o toque sonoro no seu navegador para testar a tela de chamada recebida.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onTriggerTestIncomingCall}
              className="w-full sm:w-auto px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/30 transition transform hover:scale-105 active:scale-95 shrink-0 cursor-pointer"
            >
              <Phone className="w-3.5 h-3.5" />
              <span>Receber Chamada Teste</span>
            </button>
          </div>

          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-full text-xs font-semibold uppercase tracking-wider mb-2">
              <Phone className="w-3.5 h-3.5" /> Discador Estilo Telefone
            </div>
            <h2 className="text-xl font-bold text-white">Discar Código Único</h2>
            <p className="text-xs text-zinc-400 mt-1">
              Digite o código (#CR-XXXXXX) para ligar e depois convidar outros membros para a chamada
            </p>
          </div>

          {dialError && (
            <div className="mb-4 p-3 bg-red-950/40 border border-red-500/40 rounded-2xl text-xs text-red-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{dialError}</span>
            </div>
          )}

          {/* Code Input Display */}
          <div className="relative mb-6">
            <input
              type="text"
              value={dialCode}
              onChange={(e) => setDialCode(e.target.value.toUpperCase())}
              placeholder="#CR-849201"
              className="w-full text-center font-mono text-2xl sm:text-3xl font-extrabold tracking-wider px-4 py-4 bg-zinc-950 border-2 border-zinc-700 rounded-2xl text-white placeholder-zinc-600 focus:outline-none focus:border-indigo-500 transition shadow-inner"
            />
            {dialCode && (
              <button
                onClick={() => setDialCode('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition cursor-pointer"
              >
                <Delete className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* User Preview Card if Code matches */}
          {targetPreview && (
            <div className="mb-6 p-4 bg-zinc-950 border border-emerald-500/30 rounded-2xl flex items-center justify-between gap-3 animate-in fade-in duration-200">
              <div className="flex items-center gap-3">
                <img
                  src={resolveAvatarUrl(targetPreview.avatar, targetPreview.username)}
                  alt={targetPreview.username}
                  className="w-12 h-12 rounded-xl object-cover border border-zinc-700"
                />
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-white text-sm">{targetPreview.username}</h4>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${
                        targetPreview.status === 'online'
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : targetPreview.status === 'busy'
                          ? 'bg-amber-500/20 text-amber-400'
                          : 'bg-zinc-800 text-zinc-400'
                      }`}
                    >
                      {targetPreview.status === 'online'
                        ? '● Online'
                        : targetPreview.status === 'busy'
                        ? '● Ocupado'
                        : '● Offline'}
                    </span>
                  </div>
                  <p className="font-mono text-xs text-emerald-400">{targetPreview.unique_code}</p>
                  {targetPreview.country && (
                    <p className="text-[11px] text-zinc-400">{targetPreview.country}</p>
                  )}
                </div>
              </div>

              <button
                onClick={() => handleDial('video')}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-lg shadow-emerald-600/30 transition transform hover:scale-105 active:scale-95 cursor-pointer"
              >
                <Phone className="w-3.5 h-3.5" />
                <span>Chamar</span>
              </button>
            </div>
          )}

          {/* Keypad Grid */}
          <div className="grid grid-cols-3 gap-3 max-w-sm mx-auto mb-6">
            {[
              { label: '1', sub: '' },
              { label: '2', sub: 'ABC' },
              { label: '3', sub: 'DEF' },
              { label: '4', sub: 'GHI' },
              { label: '5', sub: 'JKL' },
              { label: '6', sub: 'MNO' },
              { label: '7', sub: 'PQRS' },
              { label: '8', sub: 'TUV' },
              { label: '9', sub: 'WXYZ' },
              { label: '#', sub: 'CÓD' },
              { label: '0', sub: '+' },
              { label: 'DEL', sub: 'APAGAR' },
            ].map((btn) => (
              <button
                key={btn.label}
                onClick={() => handlePadPress(btn.label)}
                className="py-3.5 sm:py-4 bg-zinc-950/80 hover:bg-zinc-800 border border-zinc-800 hover:border-indigo-500/40 rounded-2xl text-white font-bold transition flex flex-col items-center justify-center shadow-sm active:scale-95 cursor-pointer"
              >
                <span className="text-xl font-mono">{btn.label}</span>
                {btn.sub && <span className="text-[9px] text-zinc-500 tracking-wider font-sans">{btn.sub}</span>}
              </button>
            ))}
          </div>

          {/* Call Action Buttons */}
          <div className="flex gap-3 max-w-sm mx-auto">
            <button
              onClick={() => handleDial('video')}
              className="flex-1 py-4 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold rounded-2xl shadow-xl shadow-emerald-600/30 transition flex items-center justify-center gap-2 text-sm transform hover:scale-[1.02] active:scale-95 cursor-pointer"
            >
              <Video className="w-4 h-4" />
              <span>Ligar com Vídeo</span>
            </button>

            <button
              onClick={() => handleDial('audio')}
              className="px-5 py-4 bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 text-white font-bold rounded-2xl border border-zinc-700 transition flex items-center justify-center gap-2 text-sm cursor-pointer"
              title="Chamada apenas de áudio"
            >
              <Phone className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Right Column: Online Users & Quick Directory */}
        <div className="lg:col-span-5 space-y-6">
          {/* Active Online Users (Live in Real-Time) */}
          <div className="bg-zinc-900 border border-emerald-500/30 rounded-3xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-white font-bold text-sm">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>Usuários Conectados Agora</span>
              </div>
              <span className="text-[11px] font-mono px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded-md font-bold border border-emerald-500/20">
                {onlineUsers.length} online
              </span>
            </div>

            {onlineUsers.length === 0 ? (
              <div className="p-4 bg-zinc-950/60 rounded-2xl border border-zinc-800 text-center">
                <p className="text-xs text-zinc-400 mb-2">
                  Nenhum outro usuário online no mesmo servidor neste segundo.
                </p>
                <a
                  href={typeof window !== 'undefined' ? window.location.href : '/'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block px-3 py-1.5 bg-indigo-600/30 hover:bg-indigo-600/40 text-indigo-300 text-xs font-semibold rounded-xl border border-indigo-500/30 transition cursor-pointer"
                >
                  Abrir Segunda Aba para Chamar
                </a>
              </div>
            ) : (
              <div className="space-y-2 mb-3">
                {onlineUsers.map((u) => (
                  <div
                    key={u.id}
                    className="p-3 bg-zinc-950/80 hover:bg-zinc-950 border border-emerald-500/30 rounded-2xl transition flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2.5">
                      <img
                        src={resolveAvatarUrl(u.avatar, u.username)}
                        alt={u.username}
                        className="w-9 h-9 rounded-xl object-cover border border-emerald-500/40"
                      />
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-white text-xs">{u.username}</span>
                          {u.country && <span className="text-[10px] text-zinc-400">{u.country}</span>}
                        </div>
                        <div className="font-mono text-xs font-bold text-emerald-400">{u.unique_code}</div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDial('video', u.unique_code)}
                      className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1 shadow-md shadow-emerald-600/30 cursor-pointer"
                    >
                      <Phone className="w-3 h-3" />
                      <span>Ligar</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick Contact Directory */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-2xl">
            <div className="flex items-center gap-2 text-white font-bold text-sm mb-4">
              <Users className="w-4 h-4 text-indigo-400" />
              <span>Contatos da Plataforma para Chamar</span>
            </div>
            <p className="text-xs text-zinc-400 mb-4 leading-relaxed">
              Clique em qualquer contato abaixo para discar e testar o toque de chamada:
            </p>

            <div className="space-y-2.5">
              {quickDirectory.map((contact) => (
                <div
                  key={contact.code}
                  className="p-3 bg-zinc-950/70 hover:bg-zinc-950 border border-zinc-800/80 hover:border-indigo-500/50 rounded-2xl transition flex items-center justify-between gap-3 group"
                >
                  <div className="flex items-center gap-2.5">
                    <img
                      src={resolveAvatarUrl(undefined, contact.name)}
                      alt={contact.name}
                      className="w-9 h-9 rounded-xl object-cover border border-zinc-700"
                    />
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-white text-xs group-hover:text-indigo-300 transition">
                          {contact.name}
                        </span>
                        <span className="text-[10px] text-zinc-400">{contact.country}</span>
                      </div>
                      <div className="font-mono text-xs font-bold text-emerald-400">
                        {contact.code}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setDialCode(contact.code);
                      setDialError(null);
                      handleDial('video', contact.code);
                    }}
                    className="px-3 py-1.5 bg-zinc-800 hover:bg-emerald-600 text-zinc-300 hover:text-white rounded-xl text-xs font-semibold transition flex items-center gap-1 cursor-pointer"
                  >
                    <Phone className="w-3 h-3" />
                    <span>Ligar</span>
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* User's own phone card */}
          {user && (
            <div className="bg-gradient-to-br from-indigo-950/40 to-zinc-900 border border-indigo-500/30 rounded-3xl p-6 shadow-xl">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">
                  Seu Código Pessoal para Receber Chamadas
                </span>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              </div>
              <div className="font-mono text-2xl font-black text-white mt-1 tracking-wider flex items-center justify-between">
                <span>{user.unique_code}</span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(user.unique_code);
                  }}
                  className="text-xs px-2.5 py-1 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 rounded-lg border border-indigo-500/30 transition cursor-pointer"
                >
                  Copiar
                </button>
              </div>
              <p className="text-xs text-zinc-400 mt-2">
                Qualquer outro usuário ou janela pode discar este código no discador para fazer tocar o seu telefone com opções de Atender e Recusar!
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
