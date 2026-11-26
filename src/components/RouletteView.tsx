import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { socketService } from '../services/socket.ts';
import { WebRTCManager, createMockPeerStream } from '../services/webrtc.ts';
import { mediaBridge } from '../services/mediaBridge.ts';
import { sounds } from '../services/audio.ts';
import { resolveAvatarUrl } from '../services/avatar.ts';
import {
  WORLD_REGIONS,
  WorldRegionId,
  getPackageConfig,
  getRegionLabel,
  formatCountdownMMSS,
} from '../constants/packages.ts';
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  Play,
  SkipForward,
  Square,
  MessageSquare,
  Send,
  Flag,
  Sparkles,
  Compass,
  Radio,
  Volume2,
  VolumeX,
  CheckCircle2,
  RefreshCw,
  Loader2,
  Clock,
  Globe,
  Lock,
  QrCode,
  Landmark,
  Upload,
  Eye,
  EyeOff,
  Copy,
  Check,
  X,
  SlidersHorizontal,
  Users,
  Trash2,
  AlertTriangle,
} from 'lucide-react';

interface RouletteViewProps {
  onReportUser: (code: string, name: string) => void;
  onOpenAuth?: () => void;
}

interface PeerInfo {
  id: string;
  username: string;
  unique_code: string;
  country?: string;
  region?: WorldRegionId;
  gender?: string;
  access_package?: string;
  avatar?: string;
}

interface ChatMessage {
  id: string;
  sender_name: string;
  text: string;
  timestamp: string;
  isSelf: boolean;
}

interface OnlineDirectoryUser {
  id: string;
  username: string;
  unique_code: string;
  country?: string;
  region?: WorldRegionId;
  gender?: string;
  access_package?: string;
}

interface MockPersona {
  name: string;
  code: string;
  country: string;
  region: WorldRegionId;
  gender: 'female' | 'male';
  voiceName: string;
}

const SIM_PERSONAS: MockPersona[] = [
  { name: 'Camila Oliveira', code: '#CR-810412', country: 'Brasil 🇧🇷', region: 'america_sul', gender: 'female', voiceName: 'Zephyr' },
  { name: 'Mateo Rojas', code: '#CR-663209', country: 'Argentina 🇦🇷', region: 'america_sul', gender: 'male', voiceName: 'Puck' },
  { name: 'Emily Carter', code: '#CR-491820', country: 'Estados Unidos 🇺🇸', region: 'america_norte', gender: 'female', voiceName: 'Kore' },
  { name: 'Liam Brooks', code: '#CR-552918', country: 'Canadá 🇨🇦', region: 'america_norte', gender: 'male', voiceName: 'Puck' },
  { name: 'Elena Rostova', code: '#CR-771923', country: 'Alemanha 🇩🇪', region: 'europa', gender: 'female', voiceName: 'Kore' },
  { name: 'Lucas Moreau', code: '#CR-904311', country: 'França 🇫🇷', region: 'europa', gender: 'male', voiceName: 'Puck' },
  { name: 'Amara Diallo', code: '#CR-318940', country: 'Angola 🇦🇴', region: 'africa', gender: 'female', voiceName: 'Zephyr' },
  { name: 'Kwame Mensah', code: '#CR-284110', country: 'Gana 🇬🇭', region: 'africa', gender: 'male', voiceName: 'Puck' },
  { name: 'Yuki Tanaka', code: '#CR-394821', country: 'Japão 🇯🇵', region: 'asia', gender: 'female', voiceName: 'Kore' },
  { name: 'Kenji Sato', code: '#CR-394822', country: 'Japão 🇯🇵', region: 'asia', gender: 'male', voiceName: 'Puck' },
  { name: 'Chloe Bennett', code: '#CR-114780', country: 'Austrália 🇦🇺', region: 'oceania', gender: 'female', voiceName: 'Zephyr' },
  { name: 'Noah Bennett', code: '#CR-114789', country: 'Nova Zelândia 🇳🇿', region: 'oceania', gender: 'male', voiceName: 'Puck' },
];

export const RouletteView: React.FC<RouletteViewProps> = ({ onReportUser, onOpenAuth }) => {
  const { user, saveTeacherPaymentInfo } = useAuth();
  const socket = socketService.getSocket();

  // Active Access Package & Permissions
  const activePkg = useMemo(() => getPackageConfig(user?.access_package), [user?.access_package]);
  const canChooseFilters =
    user?.role === 'admin' || (activePkg.canChooseRegion && activePkg.canChooseGender);
  const canReceivePixOnVideo =
    user?.role === 'admin' || activePkg.canReceivePixOnVideo;

  // Media state
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isVideoDisabled, setIsVideoDisabled] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [connectionQuality, setConnectionQuality] = useState<'connecting' | 'connected' | 'reconnecting' | 'idle'>('idle');

  // Roulette status: 'idle' | 'searching' | 'connected'
  const [rouletteState, setRouletteState] = useState<'idle' | 'searching' | 'connected'>('idle');
  const [currentPeer, setCurrentPeer] = useState<PeerInfo | null>(null);
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(null);
  const [peerSocketId, setPeerSocketId] = useState<string | null>(null);

  // Planisfério World Map & Region/Gender Filters (Requirements 02 & 04)
  const [regionFilter, setRegionFilter] = useState<'all' | WorldRegionId>('all');
  const [genderFilter, setGenderFilter] = useState<'all' | 'female' | 'male'>('all');
  const [isMapOpen, setIsMapOpen] = useState<boolean>(true);
  const [filterLockNotice, setFilterLockNotice] = useState<string | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<OnlineDirectoryUser[]>([]);

  // Per-Package Countdown Timer (Requirement 02)
  const [remainingSeconds, setRemainingSeconds] = useState<number>(activePkg.durationSeconds);
  const [timeoutNotice, setTimeoutNotice] = useState<string | null>(null);

  // Package 04 Teacher Pix QR Code Overlay & Bank Details (Requirement 03)
  const [isTeacherPanelOpen, setIsTeacherPanelOpen] = useState(false);
  const [teacherQrImage, setTeacherQrImage] = useState<string>(user?.pix_qr_image || '');
  const [showTeacherQrOverlay, setShowTeacherQrOverlay] = useState<boolean>(false);
  const [bankDetailsInput, setBankDetailsInput] = useState<string>(user?.bank_details || '');
  const [teacherSaveFeedback, setTeacherSaveFeedback] = useState<string | null>(null);

  // Incoming teacher overlay/bank details seen by student on remote video
  const [remotePixOverlay, setRemotePixOverlay] = useState<{
    visible: boolean;
    qrImage: string;
    teacherName: string;
  } | null>(null);
  const [remoteBankDetails, setRemoteBankDetails] = useState<{
    bankDetails: string;
    teacherName: string;
  } | null>(null);
  const [copiedBank, setCopiedBank] = useState(false);

  // Chat & Reactions
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [floatingEmojis, setFloatingEmojis] = useState<{ id: string; emoji: string; x: number }[]>([]);

  // Simulation mode (Realistic AI Text + Voice Partner)
  const [simulatedPeerActive, setSimulatedPeerActive] = useState(false);
  const [isSimThinking, setIsSimThinking] = useState(false);
  const [isSimSpeaking, setIsSimSpeaking] = useState(false);
  const [isSimRecording, setIsSimRecording] = useState(false);
  const [isSimVoiceMuted, setIsSimVoiceMuted] = useState(false);
  const [simSubtitle, setSimSubtitle] = useState<string>('');
  const [simError, setSimError] = useState<string | null>(null);

  // Refs
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const webrtcRef = useRef<WebRTCManager | null>(null);
  const earlyIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const inFlightMediaRef = useRef<Promise<MediaStream> | null>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  const simSessionIdRef = useRef<number>(0);
  const simPersonaRef = useRef<{ name: string; country: string; voiceName: string } | null>(null);
  const simHistoryRef = useRef<{ role: 'user' | 'model'; text: string }[]>([]);
  const simAudioRef = useRef<HTMLAudioElement | null>(null);
  const simRecorderRef = useRef<MediaRecorder | null>(null);
  const simRecordStreamRef = useRef<MediaStream | null>(null);
  const simChunksRef = useRef<BlobPart[]>([]);
  const isSimVoiceMutedRef = useRef<boolean>(false);

  const currentRoomIdRef = useRef<string | null>(null);
  const peerSocketIdRef = useRef<string | null>(null);
  const showTeacherQrOverlayRef = useRef<boolean>(false);
  const teacherQrImageRef = useRef<string>('');

  useEffect(() => {
    currentRoomIdRef.current = currentRoomId;
  }, [currentRoomId]);

  useEffect(() => {
    peerSocketIdRef.current = peerSocketId;
  }, [peerSocketId]);

  useEffect(() => {
    showTeacherQrOverlayRef.current = showTeacherQrOverlay;
  }, [showTeacherQrOverlay]);

  useEffect(() => {
    teacherQrImageRef.current = teacherQrImage;
  }, [teacherQrImage]);

  // Keep teacher state synchronized when user changes/logs in
  useEffect(() => {
    setTeacherQrImage(user?.pix_qr_image || '');
    setBankDetailsInput(user?.bank_details || '');
    if (!canChooseFilters) {
      setRegionFilter('all');
      setGenderFilter('all');
    }
    if (!canReceivePixOnVideo) {
      setShowTeacherQrOverlay(false);
      setIsTeacherPanelOpen(false);
    }
    if (rouletteState !== 'connected') {
      setRemainingSeconds(activePkg.durationSeconds);
    }
  }, [user?.id, user?.access_package, user?.pix_qr_image, user?.bank_details, canChooseFilters, canReceivePixOnVideo, activePkg.durationSeconds]);

  // Compute online counts per continent from live logged-in socket directory
  const onlineCountsByRegion = useMemo(() => {
    const counts: Record<WorldRegionId, number> = {
      america_norte: 0,
      america_sul: 0,
      europa: 0,
      africa: 0,
      asia: 0,
      oceania: 0,
    };
    onlineUsers.forEach((u) => {
      if (u.region && u.region in counts) {
        counts[u.region] += 1;
      }
    });
    return counts;
  }, [onlineUsers]);

  // Initialize camera and mic (concurrency-safe)
  const initLocalMedia = useCallback(async () => {
    if (localStreamRef.current && localStreamRef.current.getTracks().some((t) => t.readyState === 'live')) {
      return localStreamRef.current;
    }
    if (inFlightMediaRef.current) {
      return inFlightMediaRef.current;
    }
    const mediaPromise = (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        localStreamRef.current = stream;
        setLocalStream(stream);
        mediaBridge.setStream(stream);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
        setCameraError(null);
        return stream;
      } catch (err: any) {
        console.warn('Physical camera unavailable, using virtual test stream:', err);
        setCameraError('Câmera física não encontrada. Usando stream virtual.');
        const fallbackStream = createMockPeerStream(user?.username || 'Você');
        localStreamRef.current = fallbackStream;
        setLocalStream(fallbackStream);
        mediaBridge.setStream(fallbackStream);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = fallbackStream;
        }
        return fallbackStream;
      } finally {
        inFlightMediaRef.current = null;
      }
    })();

    inFlightMediaRef.current = mediaPromise;
    return mediaPromise;
  }, [user]);

  useEffect(() => {
    const activity =
      rouletteState === 'connected'
        ? 'Roleta Ao Vivo'
        : rouletteState === 'searching'
        ? 'Buscando na Roleta'
        : 'Na Roleta';
    mediaBridge.setActivity(activity);
    socket.emit('user:activity', { activity });
  }, [rouletteState, socket]);

  useEffect(() => {
    initLocalMedia();

    return () => {
      simSessionIdRef.current += 1;
      if (simAudioRef.current) {
        try {
          simAudioRef.current.pause();
          simAudioRef.current.src = '';
        } catch {
          // ignore
        }
        simAudioRef.current = null;
      }
      if (simRecorderRef.current && simRecorderRef.current.state !== 'inactive') {
        try {
          simRecorderRef.current.onstop = null;
          simRecorderRef.current.stop();
        } catch {
          // ignore
        }
      }
      simRecorderRef.current = null;
      if (simRecordStreamRef.current) {
        simRecordStreamRef.current.getTracks().forEach((t) => t.stop());
        simRecordStreamRef.current = null;
      }
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (webrtcRef.current) {
        webrtcRef.current.close();
      }
    };
  }, []);

  // Listen for live logged-in users directory per region
  useEffect(() => {
    const handleOnlineList = (list: OnlineDirectoryUser[]) => {
      if (Array.isArray(list)) {
        setOnlineUsers(list);
      }
    };
    socket.on('presence:online_list', handleOnlineList);
    socket.emit('presence:request_online_list');
    return () => {
      socket.off('presence:online_list', handleOnlineList);
    };
  }, [socket]);

  // Update video element when remote stream changes or tracks arrive dynamically
  useEffect(() => {
    const el = remoteVideoRef.current;
    if (!el || !remoteStream) return;
    el.srcObject = remoteStream;
    const tryPlay = () => {
      el.play().catch((e) => console.log('Autoplay handled:', e));
    };
    tryPlay();

    const onAddTrack = () => {
      if (el.srcObject !== remoteStream) el.srcObject = remoteStream;
      tryPlay();
    };
    const tracks = remoteStream.getTracks();
    tracks.forEach((t) => t.addEventListener('unmute', tryPlay));
    remoteStream.addEventListener('addtrack', onAddTrack);
    return () => {
      tracks.forEach((t) => t.removeEventListener('unmute', tryPlay));
      remoteStream.removeEventListener('addtrack', onAddTrack);
    };
  }, [remoteStream, rouletteState]);

  // Ensure local video stays attached cleanly
  useEffect(() => {
    const el = localVideoRef.current;
    if (!el || !localStream) return;
    el.srcObject = localStream;
    el.play().catch(() => {});
  }, [localStream, isVideoDisabled]);

  // Stop simulator audio & recording helpers
  const stopSimAudio = useCallback(() => {
    if (simAudioRef.current) {
      try {
        simAudioRef.current.pause();
        simAudioRef.current.src = '';
      } catch {
        // ignore
      }
      simAudioRef.current = null;
    }
    setIsSimSpeaking(false);
  }, []);

  const stopSimRecorderCleanup = useCallback(() => {
    if (simRecorderRef.current && simRecorderRef.current.state !== 'inactive') {
      try {
        simRecorderRef.current.onstop = null;
        simRecorderRef.current.stop();
      } catch {
        // ignore
      }
    }
    simRecorderRef.current = null;
    if (simRecordStreamRef.current) {
      simRecordStreamRef.current.getTracks().forEach((t) => t.stop());
      simRecordStreamRef.current = null;
    }
    simChunksRef.current = [];
    setIsSimRecording(false);
  }, []);

  // Clean disconnect
  const cleanupCall = useCallback(() => {
    simSessionIdRef.current += 1;
    stopSimAudio();
    stopSimRecorderCleanup();
    simPersonaRef.current = null;
    simHistoryRef.current = [];
    setIsSimThinking(false);
    setSimSubtitle('');
    setSimError(null);
    setRemotePixOverlay(null);
    setRemoteBankDetails(null);

    if (webrtcRef.current) {
      webrtcRef.current.close();
      webrtcRef.current = null;
    }
    earlyIceCandidatesRef.current = [];
    setRemoteStream(null);
    setCurrentPeer(null);
    setCurrentRoomId(null);
    setPeerSocketId(null);
    setMessages([]);
    setSimulatedPeerActive(false);
    setConnectionQuality('idle');
    setRemainingSeconds(activePkg.durationSeconds);
  }, [stopSimAudio, stopSimRecorderCleanup, activePkg.durationSeconds]);

  // Countdown timer tick while connected in Roulette or Simulator
  useEffect(() => {
    if (rouletteState !== 'connected') {
      return;
    }

    const interval = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          // Time limit reached -> drop connection automatically
          sounds.playHangupTone();
          if (currentRoomIdRef.current) {
            socket.emit('roulette:next', { roomId: currentRoomIdRef.current, rejoin: false });
          }
          cleanupCall();
          setRouletteState('idle');
          setTimeoutNotice(
            `Tempo limite de ${activePkg.durationLabel} (${activePkg.shortName}) atingido. A conexão foi encerrada automaticamente.`
          );
          return activePkg.durationSeconds;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [rouletteState, activePkg.durationLabel, activePkg.shortName, activePkg.durationSeconds, cleanupCall, socket]);

  // Socket Roulette Event Listeners & Cross-Tab Relays
  useEffect(() => {
    const handleMatched = async (data: {
      roomId: string;
      isInitiator: boolean;
      peerSocketId: string;
      sessionDurationSeconds?: number;
      peer: PeerInfo;
    }) => {
      console.log('[Roulette] Matched with peer:', data);
      sounds.stopAll();
      sounds.playConnectedChime();
      cleanupCall();
      setTimeoutNotice(null);

      setCurrentRoomId(data.roomId);
      setPeerSocketId(data.peerSocketId);
      setCurrentPeer(data.peer);
      setRemainingSeconds(
        typeof data.sessionDurationSeconds === 'number' && data.sessionDurationSeconds > 0
          ? data.sessionDurationSeconds
          : activePkg.durationSeconds
      );
      setRouletteState('connected');
      setConnectionQuality('connecting');
      setIsMapOpen(false);

      // If Package 04 teacher has QR overlay enabled, share immediately with newly matched student
      if (canReceivePixOnVideo && showTeacherQrOverlayRef.current && teacherQrImageRef.current) {
        socket.emit('call:teacher_payment_overlay', {
          roomId: data.roomId,
          toSocketId: data.peerSocketId,
          visible: true,
          qrImage: teacherQrImageRef.current,
          teacherName: user?.username || 'Professor',
        });
      }

      // Ensure local media is ready
      let activeStream = localStreamRef.current;
      if (!activeStream) {
        activeStream = await initLocalMedia();
      }

      // Initialize WebRTC
      const rtc = new WebRTCManager({
        isInitiator: data.isInitiator,
        onRemoteStream: (stream) => {
          console.log('[Roulette] Got remote stream tracks:', stream.getTracks().length);
          setRemoteStream(stream);
        },
        onIceCandidate: (candidate) => {
          socket.emit('webrtc:ice_candidate', {
            toSocketId: data.peerSocketId,
            candidate,
            roomId: data.roomId,
          });
          socketService.broadcastLocal('webrtc:ice_candidate_broadcast', {
            toSocketId: data.peerSocketId,
            candidate,
            roomId: data.roomId,
          });
        },
        onConnectionStateChange: (state) => {
          console.log('[Roulette] Peer connection state:', state);
          if (state === 'connected') {
            setConnectionQuality('connected');
          } else if (state === 'disconnected' || state === 'failed') {
            setConnectionQuality('reconnecting');
          }
        },
        onIceRestartNeeded: (offer) => {
          console.log('[Roulette] Sending ICE restart offer to maintain call stability');
          socket.emit('webrtc:offer', {
            toSocketId: data.peerSocketId,
            sdp: offer,
            roomId: data.roomId,
          });
        },
      });

      webrtcRef.current = rtc;
      rtc.initConnection(activeStream);

      if (earlyIceCandidatesRef.current.length > 0) {
        const queued = earlyIceCandidatesRef.current.splice(0);
        for (const cand of queued) {
          await rtc.addIceCandidate(cand);
        }
      }

      if (data.isInitiator) {
        try {
          const offer = await rtc.createOffer();
          socket.emit('webrtc:offer', {
            toSocketId: data.peerSocketId,
            sdp: offer,
            roomId: data.roomId,
          });
          socketService.broadcastLocal('webrtc:offer_broadcast', {
            toSocketId: data.peerSocketId,
            sdp: offer,
            roomId: data.roomId,
          });
        } catch (e) {
          console.error('[Roulette] Error creating offer:', e);
        }
      }
    };

    const handlePeerLeft = (data: { reason?: string }) => {
      console.log('[Roulette] Peer left:', data);
      sounds.playHangupTone();
      cleanupCall();
      startSearching(true);
    };

    const handleTimeoutEnded = (data: { reason?: string }) => {
      console.log('[Roulette] Session ended by package time limit:', data);
      sounds.playHangupTone();
      cleanupCall();
      setRouletteState('idle');
      setTimeoutNotice(
        data?.reason ||
          `Tempo limite de ${activePkg.durationLabel} atingido. Conexão encerrada automaticamente.`
      );
    };

    // WebRTC signaling handlers
    const handleOffer = async (payload: { fromSocketId: string; sdp: any; roomId?: string }) => {
      if (webrtcRef.current) {
        try {
          const answer = await webrtcRef.current.handleOffer(payload.sdp);
          socket.emit('webrtc:answer', {
            toSocketId: payload.fromSocketId,
            sdp: answer,
            roomId: payload.roomId,
          });
          socketService.broadcastLocal('webrtc:answer_broadcast', {
            toSocketId: payload.fromSocketId,
            sdp: answer,
            roomId: payload.roomId,
          });
        } catch (e) {
          console.error('Error handling offer:', e);
        }
      }
    };

    const handleAnswer = async (payload: { fromSocketId: string; sdp: any }) => {
      if (webrtcRef.current) {
        try {
          await webrtcRef.current.handleAnswer(payload.sdp);
        } catch (e) {
          console.error('Error handling answer:', e);
        }
      }
    };

    const handleCandidate = async (payload: { candidate: any }) => {
      if (!payload?.candidate) return;
      if (webrtcRef.current) {
        try {
          await webrtcRef.current.addIceCandidate(payload.candidate);
        } catch (e) {
          console.error('Error adding ICE candidate:', e);
        }
      } else {
        earlyIceCandidatesRef.current.push(payload.candidate);
      }
    };

    // Chat
    const handleChatMessage = (msg: { id: string; sender_name: string; text: string; timestamp: string; sender_id: string }) => {
      setMessages((prev) => [
        ...prev,
        {
          id: msg.id,
          sender_name: msg.sender_name,
          text: msg.text,
          timestamp: msg.timestamp,
          isSelf: msg.sender_id === socket.id,
        },
      ]);
    };

    const handleReaction = (payload: { emoji: string }) => {
      triggerFloatingEmoji(payload.emoji);
    };

    const handleTeacherPixOverlay = (payload: { visible: boolean; qrImage: string; teacherName: string }) => {
      if (payload?.visible && payload?.qrImage) {
        setRemotePixOverlay({
          visible: true,
          qrImage: payload.qrImage,
          teacherName: payload.teacherName || 'Professor',
        });
      } else {
        setRemotePixOverlay(null);
      }
    };

    const handleTeacherBankDetails = (payload: { bankDetails: string; teacherName: string }) => {
      if (payload?.bankDetails) {
        setRemoteBankDetails({
          bankDetails: payload.bankDetails,
          teacherName: payload.teacherName || 'Professor',
        });
      }
    };

    socket.on('roulette:matched', handleMatched);
    socket.on('roulette:peer_left', handlePeerLeft);
    socket.on('roulette:timeout_ended', handleTimeoutEnded);
    socket.on('webrtc:offer', handleOffer);
    socket.on('webrtc:answer', handleAnswer);
    socket.on('webrtc:ice_candidate', handleCandidate);
    socket.on('chat:message', handleChatMessage);
    socket.on('call:reaction', handleReaction);
    socket.on('call:teacher_payment_overlay', handleTeacherPixOverlay);
    socket.on('call:teacher_bank_details', handleTeacherBankDetails);

    socketService.onLocal('webrtc:offer_broadcast', handleOffer);
    socketService.onLocal('webrtc:answer_broadcast', handleAnswer);
    socketService.onLocal('webrtc:ice_candidate_broadcast', handleCandidate);

    return () => {
      socket.off('roulette:matched', handleMatched);
      socket.off('roulette:peer_left', handlePeerLeft);
      socket.off('roulette:timeout_ended', handleTimeoutEnded);
      socket.off('webrtc:offer', handleOffer);
      socket.off('webrtc:answer', handleAnswer);
      socket.off('webrtc:ice_candidate', handleCandidate);
      socket.off('chat:message', handleChatMessage);
      socket.off('call:reaction', handleReaction);
      socket.off('call:teacher_payment_overlay', handleTeacherPixOverlay);
      socket.off('call:teacher_bank_details', handleTeacherBankDetails);

      socketService.offLocal('webrtc:offer_broadcast', handleOffer);
      socketService.offLocal('webrtc:answer_broadcast', handleAnswer);
      socketService.offLocal('webrtc:ice_candidate_broadcast', handleCandidate);
    };
  }, [socket, cleanupCall, initLocalMedia, activePkg.durationSeconds, activePkg.durationLabel, canReceivePixOnVideo, user?.username]);

  // Scroll chat
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Handle World Map / Region selection
  const handleSelectRegion = (nextRegion: 'all' | WorldRegionId) => {
    if (!canChooseFilters) {
      setRegionFilter('all');
      setFilterLockNotice(
        `Seu plano atual (${activePkg.shortName}) não permite escolher região ou gênero. Escolha o Pacote 03 ou Pacote 04 no cadastro.`
      );
      return;
    }
    setFilterLockNotice(null);
    setRegionFilter((prev) => (prev === nextRegion && nextRegion !== 'all' ? 'all' : nextRegion));
  };

  const handleSelectGender = (nextGender: 'all' | 'female' | 'male') => {
    if (!canChooseFilters) {
      setGenderFilter('all');
      setFilterLockNotice(
        `Filtro de gênero disponível apenas nos Pacotes 03 (Premium) e 04 (Profissional).`
      );
      return;
    }
    setFilterLockNotice(null);
    setGenderFilter(nextGender);
  };

  // Start Searching
  const startSearching = (_immediate = false) => {
    cleanupCall();
    setTimeoutNotice(null);
    setRouletteState('searching');
    sounds.playNextSkip();
    const effectiveRegion = canChooseFilters ? regionFilter : 'all';
    const effectiveGender = canChooseFilters ? genderFilter : 'all';
    socket.emit('roulette:join_queue', {
      filter: effectiveRegion,
      regionFilter: effectiveRegion,
      genderFilter: effectiveGender,
    });
  };

  // Stop / Cancel Searching
  const stopSearching = () => {
    socket.emit('roulette:leave_queue');
    cleanupCall();
    setRouletteState('idle');
  };

  // Skip to Next User
  const handleNextUser = () => {
    sounds.playNextSkip();
    const effectiveRegion = canChooseFilters ? regionFilter : 'all';
    const effectiveGender = canChooseFilters ? genderFilter : 'all';
    if (currentRoomId) {
      socket.emit('roulette:next', {
        roomId: currentRoomId,
        rejoin: true,
        regionFilter: effectiveRegion,
        genderFilter: effectiveGender,
      });
    }
    cleanupCall();
    setRouletteState('searching');
    socket.emit('roulette:join_queue', {
      filter: effectiveRegion,
      regionFilter: effectiveRegion,
      genderFilter: effectiveGender,
    });
  };

  // Disconnect call completely
  const handleDisconnect = () => {
    sounds.playHangupTone();
    if (currentRoomId) {
      socket.emit('roulette:next', { roomId: currentRoomId, rejoin: false });
    }
    cleanupCall();
    setRouletteState('idle');
  };

  // Package 04 Teacher QR Code image upload & resize
  const handleQrImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = async () => {
        const maxSide = 360;
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(120, Math.round(img.width * scale));
        canvas.height = Math.max(120, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
        setTeacherQrImage(dataUrl);
        const res = await saveTeacherPaymentInfo({
          pix_qr_image: dataUrl,
          bank_details: bankDetailsInput,
        });
        if (res.success) {
          setTeacherSaveFeedback('QR Code do Pix salvo com sucesso!');
          if (showTeacherQrOverlayRef.current && currentRoomIdRef.current) {
            socket.emit('call:teacher_payment_overlay', {
              roomId: currentRoomIdRef.current,
              toSocketId: peerSocketIdRef.current || undefined,
              visible: true,
              qrImage: dataUrl,
              teacherName: user?.username || 'Professor',
            });
          }
        } else {
          setTeacherSaveFeedback(res.error || 'Erro ao salvar QR Code.');
        }
        setTimeout(() => setTeacherSaveFeedback(null), 3500);
      };
      if (typeof reader.result === 'string') {
        img.src = reader.result;
      }
    };
    reader.readAsDataURL(file);
  };

  const handleToggleTeacherQrOverlay = () => {
    if (!teacherQrImage) {
      setTeacherSaveFeedback('Envie primeiro a imagem do QR Code do Pix abaixo.');
      setTimeout(() => setTeacherSaveFeedback(null), 3000);
      return;
    }
    const next = !showTeacherQrOverlay;
    setShowTeacherQrOverlay(next);
    if (!simulatedPeerActive && (currentRoomId || peerSocketId)) {
      socket.emit('call:teacher_payment_overlay', {
        roomId: currentRoomId || undefined,
        toSocketId: peerSocketId || undefined,
        visible: next,
        qrImage: next ? teacherQrImage : '',
        teacherName: user?.username || 'Professor',
      });
    }
  };

  const handleSaveBankDetails = async () => {
    const res = await saveTeacherPaymentInfo({
      pix_qr_image: teacherQrImage,
      bank_details: bankDetailsInput.trim(),
    });
    setTeacherSaveFeedback(res.success ? 'Dados bancários salvos!' : res.error || 'Erro ao salvar.');
    setTimeout(() => setTeacherSaveFeedback(null), 3000);
  };

  const handleSendBankDetailsToStudent = async () => {
    const clean = bankDetailsInput.trim();
    if (!clean) {
      setTeacherSaveFeedback('Informe seus dados bancários ou chave Pix antes de enviar.');
      setTimeout(() => setTeacherSaveFeedback(null), 3000);
      return;
    }

    await saveTeacherPaymentInfo({
      pix_qr_image: teacherQrImage,
      bank_details: clean,
    });

    const formatted = `💳 Dados Bancários / Pix do Professor (${user?.username || 'Professor'}): ${clean}`;

    if (simulatedPeerActive) {
      const sessionId = simSessionIdRef.current;
      setMessages((prev) => [
        ...prev,
        {
          id: `bank_${Date.now()}`,
          sender_name: `${user?.username || 'Professor'} (Pagamento)`,
          text: formatted,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          isSelf: true,
        },
      ]);
      setTeacherSaveFeedback('Dados enviados ao aluno no chat!');
      setTimeout(() => setTeacherSaveFeedback(null), 3000);
      requestSimulatorTurn({
        userMessage: `Aqui estão meus dados bancários/Pix para o pagamento da aula: ${clean}`,
        sessionId,
      });
      return;
    }

    if (currentRoomId || peerSocketId) {
      socket.emit('chat:message', {
        roomId: currentRoomId || undefined,
        toSocketId: peerSocketId || undefined,
        text: formatted,
        senderName: user?.username || 'Professor',
      });
      socket.emit('call:teacher_bank_details', {
        roomId: currentRoomId || undefined,
        toSocketId: peerSocketId || undefined,
        bankDetails: clean,
        teacherName: user?.username || 'Professor',
      });
      setTeacherSaveFeedback('Dados bancários enviados ao aluno!');
    } else {
      setTeacherSaveFeedback('Dados salvos! Conecte-se a um aluno para enviar.');
    }
    setTimeout(() => setTeacherSaveFeedback(null), 3000);
  };

  const handleRemoveQrImage = async () => {
    setTeacherQrImage('');
    setShowTeacherQrOverlay(false);
    await saveTeacherPaymentInfo({ pix_qr_image: '', bank_details: bankDetailsInput });
    if (!simulatedPeerActive && (currentRoomId || peerSocketId)) {
      socket.emit('call:teacher_payment_overlay', {
        roomId: currentRoomId || undefined,
        toSocketId: peerSocketId || undefined,
        visible: false,
        qrImage: '',
        teacherName: user?.username || 'Professor',
      });
    }
    setTeacherSaveFeedback('QR Code removido.');
    setTimeout(() => setTeacherSaveFeedback(null), 2500);
  };

  // Play WAV audio returned by Gemini TTS
  const playSimAudio = useCallback(
    (base64Audio: string | null | undefined, sessionId: number) => {
      if (!base64Audio || isSimVoiceMutedRef.current || simSessionIdRef.current !== sessionId) {
        return;
      }
      stopSimAudio();
      try {
        const audio = new Audio(`data:audio/wav;base64,${base64Audio}`);
        simAudioRef.current = audio;
        setIsSimSpeaking(true);
        audio.onended = () => {
          if (simAudioRef.current === audio) {
            setIsSimSpeaking(false);
            simAudioRef.current = null;
          }
        };
        audio.onerror = () => {
          if (simAudioRef.current === audio) {
            setIsSimSpeaking(false);
            simAudioRef.current = null;
          }
        };
        audio.play().catch((err) => {
          console.warn('[Simulator] Autoplay blocked:', err);
          setIsSimSpeaking(false);
        });
      } catch (err) {
        console.warn('[Simulator] Audio playback error:', err);
        setIsSimSpeaking(false);
      }
    },
    [stopSimAudio]
  );

  const toggleSimVoiceMute = () => {
    const next = !isSimVoiceMuted;
    isSimVoiceMutedRef.current = next;
    setIsSimVoiceMuted(next);
    if (next) {
      stopSimAudio();
    }
  };

  // Call backend Gemini Realistic Partner Simulator (text & voice)
  const requestSimulatorTurn = useCallback(
    async (opts: {
      userMessage?: string;
      userAudioBase64?: string;
      userAudioMimeType?: string;
      isInitialGreeting?: boolean;
      sessionId: number;
    }) => {
      const persona = simPersonaRef.current;
      if (!persona || simSessionIdRef.current !== opts.sessionId) return;

      setIsSimThinking(true);
      setSimError(null);

      try {
        const res = await fetch('/api/simulator/reply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            persona,
            history: simHistoryRef.current,
            userMessage: opts.userMessage,
            userAudioBase64: opts.userAudioBase64,
            userAudioMimeType: opts.userAudioMimeType,
            userName: user?.username || 'Visitante',
            isInitialGreeting: opts.isInitialGreeting,
            withVoice: !isSimVoiceMutedRef.current,
          }),
        });

        const data = await res.json().catch(() => ({}));
        if (simSessionIdRef.current !== opts.sessionId) return;

        if (!res.ok) {
          setSimError(data?.error || 'Não foi possível obter resposta do simulador.');
          setIsSimThinking(false);
          return;
        }

        const timeLabel = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        if (opts.userAudioBase64 && data.userTranscript) {
          simHistoryRef.current.push({ role: 'user', text: data.userTranscript });
          setMessages((prev) => [
            ...prev,
            {
              id: `self_voice_${Date.now()}`,
              sender_name: `${user?.username || 'Você'} (Voz)`,
              text: data.userTranscript,
              timestamp: timeLabel,
              isSelf: true,
            },
          ]);
        } else if (opts.userMessage) {
          simHistoryRef.current.push({ role: 'user', text: opts.userMessage });
        }

        if (data.replyText) {
          simHistoryRef.current.push({ role: 'model', text: data.replyText });
          setSimSubtitle(data.replyText);
          setMessages((prev) => [
            ...prev,
            {
              id: `sim_reply_${Date.now()}`,
              sender_name: persona.name,
              text: data.replyText,
              timestamp: timeLabel,
              isSelf: false,
            },
          ]);
        }

        if (data.ttsWarning) {
          setSimError(data.ttsWarning);
        }

        if (data.audioBase64) {
          playSimAudio(data.audioBase64, opts.sessionId);
        }
      } catch (err) {
        if (simSessionIdRef.current !== opts.sessionId) return;
        console.error('[Simulator] Network error:', err);
        setSimError('Falha de conexão com o servidor do Simulador.');
      } finally {
        if (simSessionIdRef.current === opts.sessionId) {
          setIsSimThinking(false);
        }
      }
    },
    [playSimAudio, user?.username]
  );

  // Record user's voice and send to Gemini Realistic Simulator
  const toggleSimVoiceRecording = async () => {
    if (!simulatedPeerActive) return;

    if (isSimRecording && simRecorderRef.current) {
      try {
        simRecorderRef.current.stop();
      } catch {
        stopSimRecorderCleanup();
      }
      return;
    }

    const sessionId = simSessionIdRef.current;
    setSimError(null);
    stopSimAudio();

    try {
      let recordStream: MediaStream | null = null;
      const existingAudio = localStreamRef.current?.getAudioTracks().find((t) => t.readyState === 'live');
      if (existingAudio) {
        const cloned = existingAudio.clone();
        cloned.enabled = true;
        recordStream = new MediaStream([cloned]);
      } else {
        recordStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
      }

      if (simSessionIdRef.current !== sessionId) {
        recordStream.getTracks().forEach((t) => t.stop());
        return;
      }

      simRecordStreamRef.current = recordStream;
      simChunksRef.current = [];

      const preferredMimes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
      const supportedMime =
        typeof MediaRecorder !== 'undefined'
          ? preferredMimes.find((m) => MediaRecorder.isTypeSupported?.(m)) || ''
          : '';

      const recorder = supportedMime
        ? new MediaRecorder(recordStream, { mimeType: supportedMime })
        : new MediaRecorder(recordStream);

      simRecorderRef.current = recorder;

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          simChunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = async () => {
        const chunks = simChunksRef.current.slice();
        const mimeType = recorder.mimeType || supportedMime || 'audio/webm';
        stopSimRecorderCleanup();

        if (simSessionIdRef.current !== sessionId || chunks.length === 0) return;

        const blob = new Blob(chunks, { type: mimeType });
        if (blob.size < 400) {
          setSimError('Áudio muito curto. Segure ou fale por pelo menos 1 segundo.');
          return;
        }

        const reader = new FileReader();
        reader.onloadend = () => {
          const result = typeof reader.result === 'string' ? reader.result : '';
          if (!result || simSessionIdRef.current !== sessionId) return;
          requestSimulatorTurn({
            userAudioBase64: result,
            userAudioMimeType: mimeType,
            sessionId,
          });
        };
        reader.readAsDataURL(blob);
      };

      recorder.start();
      setIsSimRecording(true);
    } catch (err) {
      console.warn('[Simulator] Mic capture error:', err);
      stopSimRecorderCleanup();
      setSimError('Não foi possível acessar o microfone. Você também pode enviar mensagens por texto no chat.');
    }
  };

  // Simulate Instant Realistic AI Partner (Text & Voice) — respects Planisfério region & gender filters when allowed
  const triggerSoloSimulator = () => {
    cleanupCall();
    setTimeoutNotice(null);
    const sessionId = simSessionIdRef.current;
    setSimulatedPeerActive(true);
    setRemainingSeconds(activePkg.durationSeconds);
    setRouletteState('connected');
    setConnectionQuality('connected');
    setIsMapOpen(false);
    sounds.stopAll();
    sounds.playConnectedChime();

    let pool = SIM_PERSONAS;
    if (canChooseFilters) {
      const filtered = SIM_PERSONAS.filter(
        (p) =>
          (regionFilter === 'all' || p.region === regionFilter) &&
          (genderFilter === 'all' || p.gender === genderFilter)
      );
      if (filtered.length > 0) pool = filtered;
    }
    const chosen = pool[Math.floor(Math.random() * pool.length)];

    simPersonaRef.current = {
      name: chosen.name,
      country: chosen.country,
      voiceName: chosen.voiceName,
    };
    simHistoryRef.current = [];

    setCurrentPeer({
      id: 'sim_bot',
      username: chosen.name,
      unique_code: chosen.code,
      country: chosen.country,
      region: chosen.region,
      gender: chosen.gender,
      avatar: resolveAvatarUrl(undefined, chosen.name),
    });

    const simStream = createMockPeerStream(chosen.name);
    setRemoteStream(simStream);

    if (typeof window !== 'undefined' && window.innerWidth >= 768) {
      setIsChatOpen(true);
    }

    requestSimulatorTurn({
      isInitialGreeting: true,
      sessionId,
    });
  };

  // Toggle Mute
  const toggleMic = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMicMuted(!audioTrack.enabled);
      }
    }
  };

  // Toggle Camera
  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoDisabled(!videoTrack.enabled);
      }
    }
  };

  // Send Chat message
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const text = inputText.trim();
    setInputText('');

    if (simulatedPeerActive) {
      const sessionId = simSessionIdRef.current;
      setMessages((prev) => [
        ...prev,
        {
          id: `self_${Date.now()}`,
          sender_name: user?.username || 'Você',
          text,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          isSelf: true,
        },
      ]);
      requestSimulatorTurn({
        userMessage: text,
        sessionId,
      });
      return;
    }

    if (peerSocketId && currentRoomId) {
      socket.emit('chat:message', {
        roomId: currentRoomId,
        toSocketId: peerSocketId,
        text,
        senderName: user?.username || 'Usuário',
      });
    }
  };

  // Trigger floating emoji reaction
  const triggerFloatingEmoji = (emoji: string) => {
    const id = `emoji_${Date.now()}_${Math.random()}`;
    const x = Math.floor(20 + Math.random() * 60);
    setFloatingEmojis((prev) => [...prev, { id, emoji, x }]);

    setTimeout(() => {
      setFloatingEmojis((prev) => prev.filter((item) => item.id !== id));
    }, 2000);
  };

  const sendReaction = (emoji: string) => {
    triggerFloatingEmoji(emoji);
    if (!simulatedPeerActive && (currentRoomId || peerSocketId)) {
      socket.emit('call:reaction', {
        roomId: currentRoomId || undefined,
        toSocketId: peerSocketId || undefined,
        emoji,
      });
    }
  };

  const isLowTime = rouletteState === 'connected' && remainingSeconds <= 15;

  return (
    <div className="relative flex flex-col flex-1 min-h-0 bg-zinc-950 overflow-hidden">
      {/* Top Banner / Status Info + Package Countdown + Planisfério & Teacher Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 sm:px-4 py-2 bg-zinc-900/80 border-b border-zinc-800 text-xs shrink-0">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <span
            className={`flex h-2.5 w-2.5 rounded-full shrink-0 ${
              rouletteState === 'connected'
                ? 'bg-emerald-400 animate-pulse'
                : rouletteState === 'searching'
                ? 'bg-amber-400 animate-ping'
                : 'bg-zinc-500'
            }`}
          />
          <span className="font-bold text-zinc-200 truncate">
            {rouletteState === 'idle' && 'Roleta Pronta'}
            {rouletteState === 'searching' &&
              `Buscando (${canChooseFilters ? getRegionLabel(regionFilter) : 'Global'})...`}
            {rouletteState === 'connected' && `Conectado: ${currentPeer?.username || 'Parceiro'}`}
          </span>
          {currentPeer && (
            <span className="font-mono text-[11px] text-emerald-400 font-bold px-2 py-0.5 bg-emerald-500/10 rounded-md border border-emerald-500/20">
              {currentPeer.unique_code}
            </span>
          )}
          {currentPeer?.country && <span className="text-zinc-400 hidden sm:inline">{currentPeer.country}</span>}

          {/* Package Badge + Live Countdown Timer */}
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-bold ${activePkg.badgeClass}`}>
            <span>{activePkg.shortName}</span>
          </span>

          <span
            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md border font-mono text-[11px] font-extrabold transition ${
              isLowTime
                ? 'bg-red-600/25 text-red-300 border-red-500/60 animate-pulse'
                : rouletteState === 'connected'
                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                : 'bg-zinc-800 text-zinc-300 border-zinc-700'
            }`}
            title={`Contagem regressiva do pacote (${activePkg.durationLabel})`}
          >
            <Clock className="w-3 h-3 shrink-0" />
            <span>{formatCountdownMMSS(remainingSeconds)}</span>
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {connectionQuality === 'connected' && (
            <span className="hidden lg:inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              <CheckCircle2 className="w-3 h-3" /> P2P Ativo
            </span>
          )}

          {/* Planisfério Toggle */}
          <button
            type="button"
            onClick={() => setIsMapOpen((prev) => !prev)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition border cursor-pointer ${
              isMapOpen
                ? 'bg-sky-600/25 text-sky-300 border-sky-500/50'
                : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700'
            }`}
            title="Abrir/fechar Planisfério e Filtros de Região e Gênero"
          >
            <Globe className="w-3.5 h-3.5 text-sky-400" />
            <span>Planisfério</span>
            {canChooseFilters && regionFilter !== 'all' && (
              <span className="px-1.5 py-0.2 bg-sky-500/30 rounded text-[10px]">
                {WORLD_REGIONS.find((r) => r.id === regionFilter)?.shortLabel}
              </span>
            )}
          </button>

          {/* Package 04 Teacher Pix QR & Bank Details Button */}
          {canReceivePixOnVideo && (
            <button
              type="button"
              onClick={() => setIsTeacherPanelOpen((prev) => !prev)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition border cursor-pointer ${
                isTeacherPanelOpen || showTeacherQrOverlay
                  ? 'bg-emerald-600/25 text-emerald-300 border-emerald-500/50'
                  : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700'
              }`}
              title="Pacote 04: Configurar QR Code Pix no vídeo e dados bancários"
            >
              <QrCode className="w-3.5 h-3.5 text-emerald-400" />
              <span>Pix / Aula</span>
            </button>
          )}

          <button
            type="button"
            onClick={triggerSoloSimulator}
            className="flex items-center gap-1.5 px-3 py-1 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 hover:text-white rounded-lg text-xs font-bold transition border border-indigo-500/40 cursor-pointer"
            title="Conecta instantaneamente um parceiro virtual realista com texto e voz"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden sm:inline">Simulador de Parceiro</span>
            <span className="sm:hidden">Simulador</span>
          </button>
        </div>
      </div>

      {/* Package Time Limit Ended Banner */}
      {timeoutNotice && (
        <div className="px-4 py-2 bg-red-950/70 border-b border-red-500/40 text-red-200 text-xs flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span className="font-semibold">{timeoutNotice}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onOpenAuth && (
              <button
                type="button"
                onClick={onOpenAuth}
                className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold text-[11px] cursor-pointer"
              >
                Mudar Pacote
              </button>
            )}
            <button
              type="button"
              onClick={() => setTimeoutNotice(null)}
              className="p-1 text-red-300 hover:text-white cursor-pointer"
              aria-label="Fechar aviso"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Package 04 Teacher Payment Drawer (QR Code Pix Overlay + Bank Details) */}
      {canReceivePixOnVideo && isTeacherPanelOpen && (
        <div className="bg-zinc-900/95 border-b border-emerald-500/30 px-4 py-3 text-xs shrink-0">
          <div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 text-emerald-300 font-bold">
                <QrCode className="w-4 h-4" />
                <span>Pacote 04 • Receber pela Aula (Pix / Banco):</span>
              </div>

              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-xl border border-zinc-700 cursor-pointer font-semibold">
                <Upload className="w-3.5 h-3.5 text-emerald-400" />
                <span>{teacherQrImage ? 'Trocar QR Code Pix' : 'Anexar QR Code Pix'}</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleQrImageUpload}
                  className="hidden"
                />
              </label>

              <button
                type="button"
                onClick={handleToggleTeacherQrOverlay}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold border transition cursor-pointer ${
                  showTeacherQrOverlay
                    ? 'bg-emerald-600 text-white border-emerald-400'
                    : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700'
                }`}
              >
                {showTeacherQrOverlay ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                <span>{showTeacherQrOverlay ? 'QR Code Visível no Vídeo' : 'Exibir QR Code no Vídeo'}</span>
              </button>

              {teacherQrImage && (
                <button
                  type="button"
                  onClick={handleRemoveQrImage}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-red-950/50 hover:bg-red-900/60 text-red-300 rounded-xl border border-red-500/30 cursor-pointer"
                  title="Remover imagem do QR Code"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 w-full lg:w-auto">
              <div className="relative flex-1 lg:w-80">
                <Landmark className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  value={bankDetailsInput}
                  onChange={(e) => setBankDetailsInput(e.target.value)}
                  placeholder="Chave Pix, Banco, Agência, Conta e Titular..."
                  className="w-full pl-8 pr-3 py-1.5 bg-zinc-950 border border-zinc-700 rounded-xl text-white text-xs placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <button
                type="button"
                onClick={handleSaveBankDetails}
                className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold rounded-xl border border-zinc-700 cursor-pointer shrink-0"
              >
                Salvar
              </button>
              <button
                type="button"
                onClick={handleSendBankDetailsToStudent}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow cursor-pointer shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Enviar ao Aluno</span>
              </button>
            </div>
          </div>
          {teacherSaveFeedback && (
            <div className="max-w-7xl mx-auto mt-2 text-[11px] font-semibold text-emerald-300">
              {teacherSaveFeedback}
            </div>
          )}
        </div>
      )}

      {/* Main Scrollable / Side-by-Side Arena */}
      <div className="relative flex-1 min-h-0 bg-zinc-950 p-2 sm:p-4 pb-24 md:pb-4 flex flex-col gap-3 overflow-y-auto">
        {/* Interactive Planisfério World Map + Region & Gender Selector (Requirement 04) */}
        {isMapOpen && (
          <div className="w-full max-w-7xl mx-auto bg-zinc-900/90 border border-zinc-800 rounded-2xl p-3 sm:p-4 shadow-xl shrink-0">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
              {/* Cropped Planisfério Image with Clickable Continent Hotspots */}
              <div className="lg:col-span-7">
                <div className="relative w-full aspect-[631/445] max-h-[250px] sm:max-h-[270px] mx-auto rounded-xl overflow-hidden border border-zinc-700/80 shadow-inner bg-sky-950/30">
                  <img
                    src="/assets/aistudio/planisferio4_8344a82a.jpg"
                    alt="Planisfério Mundial de Regiões"
                    className="w-full h-[109.2%] object-cover object-top select-none pointer-events-none"
                  />

                  {/* Clickable Regions Overlaid on Planisfério */}
                  {WORLD_REGIONS.map((reg) => {
                    const count = onlineCountsByRegion[reg.id] || 0;
                    const isSelected = canChooseFilters && regionFilter === reg.id;
                    return (
                      <button
                        key={reg.id}
                        type="button"
                        onClick={() => handleSelectRegion(reg.id)}
                        style={{
                          left: reg.box.left,
                          top: reg.box.top,
                          width: reg.box.width,
                          height: reg.box.height,
                        }}
                        className={`absolute group transition rounded-xl cursor-pointer ${
                          isSelected
                            ? 'bg-indigo-600/30 ring-2 ring-white shadow-lg'
                            : 'hover:bg-white/15'
                        }`}
                        title={`${reg.label} (${count} conectado${count === 1 ? '' : 's'})`}
                      >
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold shadow-md border backdrop-blur-sm transition ${
                            isSelected
                              ? 'bg-indigo-600 text-white border-white scale-105'
                              : 'bg-zinc-950/85 text-zinc-100 border-zinc-600/80 group-hover:bg-indigo-600/90 group-hover:border-white'
                          }`}
                        >
                          <span>{reg.shortLabel}</span>
                          <span className="px-1 rounded-full bg-emerald-500/25 text-emerald-300">
                            {count}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Region Summary, Online Count & Gender Filter */}
              <div className="lg:col-span-5 space-y-3 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-extrabold text-white flex items-center gap-1.5">
                      <Globe className="w-4 h-4 text-sky-400" />
                      <span>Planisfério da Roleta Geral</span>
                    </h3>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      {canChooseFilters
                        ? 'Clique em uma região no mapa para conectar somente com usuários logados nela.'
                        : 'No modo gratuito ou Boas Vindas a conexão é global automática.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsMapOpen(false)}
                    className="p-1 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 cursor-pointer"
                    title="Recolher mapa"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {filterLockNotice && (
                  <div className="p-2.5 bg-amber-950/50 border border-amber-500/40 rounded-xl text-[11px] text-amber-200 flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>{filterLockNotice}</span>
                    </span>
                    {onOpenAuth && (
                      <button
                        type="button"
                        onClick={onOpenAuth}
                        className="px-2 py-1 bg-amber-500 text-zinc-950 font-bold rounded-lg shrink-0 cursor-pointer"
                      >
                        Alterar Plano
                      </button>
                    )}
                  </div>
                )}

                {/* Quick Region Buttons */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-zinc-400">
                    <span className="font-semibold">Região Ativa:</span>
                    <span className="inline-flex items-center gap-1 text-emerald-400 font-bold">
                      <Users className="w-3 h-3" /> {onlineUsers.length} logado(s) agora
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleSelectRegion('all')}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition cursor-pointer ${
                        regionFilter === 'all'
                          ? 'bg-emerald-600 text-white border-emerald-400'
                          : 'bg-zinc-950 text-zinc-300 border-zinc-800 hover:border-zinc-600'
                      }`}
                    >
                      Todas (Global)
                    </button>
                    {WORLD_REGIONS.map((r) => {
                      const active = canChooseFilters && regionFilter === r.id;
                      const cnt = onlineCountsByRegion[r.id] || 0;
                      return (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => handleSelectRegion(r.id)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition flex items-center gap-1 cursor-pointer ${
                            active
                              ? 'bg-indigo-600 text-white border-indigo-400'
                              : canChooseFilters
                              ? 'bg-zinc-950 text-zinc-300 border-zinc-800 hover:border-zinc-600'
                              : 'bg-zinc-950/60 text-zinc-500 border-zinc-800/80'
                          }`}
                        >
                          {!canChooseFilters && <Lock className="w-2.5 h-2.5" />}
                          <span>{r.shortLabel}</span>
                          <span className="opacity-75">({cnt})</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Gender Filter (only unlocked on Packages 03 & 04) */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-zinc-400">
                    <span className="font-semibold flex items-center gap-1">
                      <SlidersHorizontal className="w-3 h-3" /> Filtro de Gênero:
                    </span>
                    {!canChooseFilters && (
                      <span className="text-[10px] text-amber-400 font-semibold flex items-center gap-1">
                        <Lock className="w-2.5 h-2.5" /> Pacotes 03 e 04
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { id: 'all' as const, label: 'Todos' },
                      { id: 'female' as const, label: 'Feminino' },
                      { id: 'male' as const, label: 'Masculino' },
                    ].map((g) => {
                      const isSel = (canChooseFilters ? genderFilter : 'all') === g.id;
                      return (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => handleSelectGender(g.id)}
                          className={`py-1.5 px-2 rounded-lg text-[11px] font-bold border transition flex items-center justify-center gap-1 cursor-pointer ${
                            isSel
                              ? 'bg-indigo-600 text-white border-indigo-400'
                              : canChooseFilters
                              ? 'bg-zinc-950 text-zinc-300 border-zinc-800 hover:border-zinc-600'
                              : 'bg-zinc-950/60 text-zinc-500 border-zinc-800/80'
                          }`}
                        >
                          {!canChooseFilters && g.id !== 'all' && <Lock className="w-2.5 h-2.5" />}
                          <span>{g.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Side-by-Side Video Panels */}
        <div className="w-full flex-1 min-h-[420px] max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 items-stretch shrink-0 md:shrink">
          {/* LEFT PANEL: Você (Local User Video) */}
          <div className="relative bg-zinc-900 border-2 border-zinc-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col group min-h-[250px] md:min-h-[240px]">
            <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover transform scale-x-[-1] ${isVideoDisabled ? 'hidden' : ''}`}
              />
              {isVideoDisabled && (
                <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-900 text-zinc-500 p-4">
                  <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mb-2">
                    <VideoOff className="w-8 h-8 text-zinc-400" />
                  </div>
                  <span className="text-xs font-semibold text-zinc-400">Sua câmera está desativada</span>
                </div>
              )}

              {/* Local Header Badge */}
              <div className="absolute top-3 left-3 flex items-center gap-2 px-3 py-1.5 bg-black/70 backdrop-blur-md rounded-xl text-xs font-bold text-white border border-white/10 shadow-lg">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>Você ({user?.username || 'Usuário'})</span>
                <span className="font-mono text-emerald-400 text-[11px] font-semibold">{user?.unique_code}</span>
              </div>

              {/* Local Mic Status Badge */}
              <div className="absolute top-3 right-3 flex items-center gap-1 px-2.5 py-1 bg-black/70 backdrop-blur-md rounded-xl text-xs border border-white/10">
                {isMicMuted ? (
                  <span className="flex items-center gap-1 text-red-400 font-semibold text-[11px]">
                    <MicOff className="w-3.5 h-3.5" /> Mutado
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-emerald-400 font-semibold text-[11px]">
                    <Mic className="w-3.5 h-3.5 animate-pulse" /> Áudio Ligado
                  </span>
                )}
              </div>

              {/* Package 04 Teacher Own Pix QR Code Overlay Preview on Local Video */}
              {canReceivePixOnVideo && showTeacherQrOverlay && teacherQrImage && (
                <div className="qr-pix-card absolute bottom-3 right-3 bg-white text-zinc-900 p-2 rounded-2xl shadow-2xl border-2 border-emerald-500 flex flex-col items-center gap-1 z-20 max-w-[125px]">
                  <span className="text-[9px] font-extrabold uppercase tracking-wider text-emerald-700">
                    Pix da Aula
                  </span>
                  <img
                    src={teacherQrImage}
                    alt="QR Code Pix"
                    className="w-24 h-24 object-contain rounded-lg border border-zinc-200"
                  />
                  <span className="text-[9px] font-semibold text-zinc-600 truncate w-full text-center">
                    {user?.username || 'Professor'}
                  </span>
                </div>
              )}

              {/* Local Bottom Info */}
              <div className="absolute bottom-3 left-3 px-2.5 py-1 bg-black/60 backdrop-blur-sm rounded-lg text-[10px] text-zinc-300 font-medium">
                {cameraError ? cameraError : `Feed Local • ${getRegionLabel(user?.region)}`}
              </div>
            </div>
          </div>

          {/* RIGHT PANEL: Parceiro (Remote User Video) */}
          <div className="relative bg-zinc-900 border-2 border-zinc-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col min-h-[260px] md:min-h-[240px]">
            {rouletteState === 'connected' && remoteStream ? (
              <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden">
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover"
                />

                {/* Remote Header Badge */}
                <div className="absolute top-3 left-3 flex items-center gap-2 px-3 py-1.5 bg-black/70 backdrop-blur-md rounded-xl text-xs font-bold text-white border border-white/10 shadow-lg">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>{currentPeer?.username || 'Parceiro'}</span>
                  {currentPeer?.country && <span>{currentPeer.country}</span>}
                  <span className="font-mono text-emerald-400 text-[11px] font-bold">
                    {currentPeer?.unique_code}
                  </span>
                </div>

                {/* Remote Connection State & In-Call Countdown HUD */}
                <div className="absolute top-3 right-3 flex items-center gap-1.5">
                  <div
                    className={`flex items-center gap-1 px-2.5 py-1 backdrop-blur-md rounded-xl text-xs font-mono font-extrabold border ${
                      isLowTime
                        ? 'bg-red-600/85 text-white border-red-300 animate-pulse'
                        : 'bg-black/70 text-emerald-300 border-white/15'
                    }`}
                    title={`Tempo restante (${activePkg.shortName})`}
                  >
                    <Clock className="w-3 h-3" />
                    <span>{formatCountdownMMSS(remainingSeconds)}</span>
                  </div>

                  <div
                    className={`flex items-center gap-1.5 px-3 py-1 backdrop-blur-md rounded-xl text-xs font-bold border ${
                      connectionQuality === 'reconnecting'
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                        : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full animate-ping ${
                        connectionQuality === 'reconnecting' ? 'bg-amber-400' : 'bg-emerald-400'
                      }`}
                    />
                    <span>
                      {simulatedPeerActive
                        ? isSimSpeaking
                          ? 'Falando por Voz'
                          : isSimThinking
                          ? 'Pensando...'
                          : 'IA Voz & Texto'
                        : connectionQuality === 'reconnecting'
                        ? 'Reconectando P2P...'
                        : 'P2P Conectado'}
                    </span>
                  </div>
                </div>

                {/* Incoming Teacher Pix QR Code Overlay received by Student */}
                {remotePixOverlay?.visible && remotePixOverlay.qrImage && (
                  <div className="qr-pix-card absolute top-14 right-3 bg-white text-zinc-900 p-2.5 rounded-2xl shadow-2xl border-2 border-emerald-500 flex flex-col items-center gap-1 z-20 max-w-[140px]">
                    <span className="text-[9px] font-extrabold uppercase tracking-wider text-emerald-700">
                      Pix da Aula
                    </span>
                    <img
                      src={remotePixOverlay.qrImage}
                      alt="QR Code Pix do Professor"
                      className="w-28 h-28 object-contain rounded-lg border border-zinc-200"
                    />
                    <span className="text-[10px] font-bold text-zinc-900 truncate w-full text-center">
                      {remotePixOverlay.teacherName}
                    </span>
                  </div>
                )}

                {/* Incoming Teacher Bank Details Banner for Student */}
                {remoteBankDetails && (
                  <div className="qr-pix-card absolute top-14 left-3 bg-white text-zinc-900 p-3 rounded-2xl shadow-2xl border-2 border-indigo-500 z-20 max-w-xs text-xs">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-extrabold text-[11px] text-indigo-700 flex items-center gap-1">
                        <Landmark className="w-3.5 h-3.5" /> Dados Bancários • {remoteBankDetails.teacherName}
                      </span>
                      <button
                        type="button"
                        onClick={() => setRemoteBankDetails(null)}
                        className="text-zinc-500 hover:text-zinc-900 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <p className="text-[11px] text-zinc-800 break-words font-mono bg-zinc-100 p-2 rounded-lg border border-zinc-200 mb-2">
                      {remoteBankDetails.bankDetails}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(remoteBankDetails.bankDetails);
                        setCopiedBank(true);
                        setTimeout(() => setCopiedBank(false), 2000);
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-600 text-white rounded-lg text-[10px] font-bold cursor-pointer"
                    >
                      {copiedBank ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedBank ? 'Copiado!' : 'Copiar Dados'}</span>
                    </button>
                  </div>
                )}

                {/* Live Subtitle & Error Overlay for Realistic AI Partner Simulator */}
                {simulatedPeerActive && (simSubtitle || simError || isSimThinking) && (
                  <div className="absolute bottom-14 left-3 right-3 flex flex-col gap-1.5 pointer-events-none">
                    {simError && (
                      <div className="px-3 py-1.5 bg-red-950/85 border border-red-500/50 text-red-200 rounded-xl text-[11px] font-medium backdrop-blur-md shadow-lg">
                        {simError}
                      </div>
                    )}
                    {(simSubtitle || isSimThinking) && (
                      <div className="px-3 py-2 bg-black/75 border border-white/15 text-white rounded-xl text-xs leading-snug backdrop-blur-md shadow-lg max-w-lg">
                        {isSimThinking && !isSimSpeaking ? (
                          <span className="inline-flex items-center gap-1.5 text-indigo-300 font-semibold">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            {currentPeer?.username || 'Parceiro'} está respondendo...
                          </span>
                        ) : (
                          <span>{simSubtitle}</span>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Remote Bottom-Left Realistic Voice Controls (only in Simulator Mode) */}
                {simulatedPeerActive && (
                  <div className="absolute bottom-3 left-3 flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={isSimThinking}
                      onClick={toggleSimVoiceRecording}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border backdrop-blur-md transition shadow-md cursor-pointer disabled:opacity-50 ${
                        isSimRecording
                          ? 'bg-red-600/90 hover:bg-red-500 text-white border-red-300 animate-pulse'
                          : 'bg-indigo-600/85 hover:bg-indigo-500 text-white border-indigo-400/50'
                      }`}
                      title={
                        isSimRecording
                          ? 'Toque para enviar sua fala ao parceiro'
                          : 'Gravar e falar por voz com o parceiro'
                      }
                    >
                      {isSimRecording ? (
                        <>
                          <Square className="w-3 h-3 fill-current" />
                          <span>Enviar Voz</span>
                        </>
                      ) : (
                        <>
                          <Mic className="w-3.5 h-3.5" />
                          <span>Falar por Voz</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={toggleSimVoiceMute}
                      className={`p-1.5 rounded-xl border backdrop-blur-md transition cursor-pointer ${
                        isSimVoiceMuted
                          ? 'bg-red-950/80 text-red-300 border-red-500/40'
                          : 'bg-black/70 text-emerald-300 border-white/15 hover:bg-black/85'
                      }`}
                      title={isSimVoiceMuted ? 'Ativar voz do parceiro' : 'Silenciar voz do parceiro'}
                      aria-label={isSimVoiceMuted ? 'Ativar voz do parceiro' : 'Silenciar voz do parceiro'}
                    >
                      {isSimVoiceMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsChatOpen(!isChatOpen)}
                      className={`relative md:hidden p-1.5 rounded-xl border backdrop-blur-md transition cursor-pointer ${
                        isChatOpen
                          ? 'bg-indigo-600 text-white border-indigo-400'
                          : 'bg-black/70 text-zinc-200 border-white/15 hover:bg-black/85'
                      }`}
                      title="Abrir chat de texto"
                      aria-label="Abrir chat de texto"
                    >
                      <MessageSquare className="w-4 h-4" />
                      {messages.length > 0 && !isChatOpen && (
                        <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
                      )}
                    </button>
                  </div>
                )}

                {/* Remote Bottom Controls: Denunciar */}
                <div className="absolute bottom-3 right-3">
                  <button
                    onClick={() => onReportUser(currentPeer?.unique_code || '', currentPeer?.username || 'Usuário')}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-950/70 hover:bg-red-900 text-red-300 rounded-xl text-xs font-bold border border-red-500/40 backdrop-blur-md transition shadow-md cursor-pointer"
                    title="Denunciar este usuário"
                  >
                    <Flag className="w-3.5 h-3.5" />
                    <span>Denunciar</span>
                  </button>
                </div>
              </div>
            ) : (
              /* Waiting / Searching State in Right Panel */
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center bg-zinc-950/80">
                {rouletteState === 'searching' ? (
                  <div className="space-y-4 max-w-sm">
                    <div className="relative w-24 h-24 mx-auto flex items-center justify-center">
                      <div className="absolute inset-0 rounded-full border-2 border-indigo-500/50 animate-ping" />
                      <div className="absolute inset-2 rounded-full border-2 border-emerald-500/60 animate-pulse" />
                      <Compass className="w-10 h-10 text-indigo-400 animate-spin" />
                    </div>
                    <h3 className="text-lg font-bold text-white">
                      {canChooseFilters && regionFilter !== 'all'
                        ? `Buscando em ${getRegionLabel(regionFilter)}...`
                        : 'Buscando Parceiro Global...'}
                    </h3>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      {canChooseFilters && regionFilter !== 'all'
                        ? `Encontrando somente usuários logados na região ${getRegionLabel(regionFilter)}${
                            genderFilter !== 'all' ? ` (${genderFilter === 'female' ? 'Feminino' : 'Masculino'})` : ''
                          }.`
                        : 'Conectando à fila WebRTC. Assim que outro usuário for emparelhado, o vídeo aparecerá aqui lado a lado!'}
                    </p>
                    <button
                      onClick={stopSearching}
                      className="px-5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-bold transition cursor-pointer"
                    >
                      Cancelar Busca
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4 max-w-sm">
                    <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center mx-auto shadow-xl shadow-indigo-600/30">
                      <Radio className="w-10 h-10 text-white" />
                    </div>
                    <h3 className="text-xl font-extrabold text-white">Roleta de Vídeo Lado a Lado</h3>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      Pacote ativo: <strong className="text-zinc-200">{activePkg.shortName}</strong> ({activePkg.durationLabel}).
                      {canChooseFilters
                        ? ' Selecione uma região no planisfério ou conecte-se globalmente.'
                        : ' Pressione o botão verde para iniciar!'}
                    </p>
                    <button
                      onClick={() => startSearching()}
                      className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold rounded-2xl shadow-xl shadow-emerald-600/30 transition transform hover:scale-105 active:scale-95 text-xs flex items-center gap-2 mx-auto cursor-pointer"
                    >
                      <Play className="w-4 h-4 fill-current" />
                      <span>
                        {canChooseFilters && regionFilter !== 'all'
                          ? `Iniciar em ${getRegionLabel(regionFilter)}`
                          : 'Iniciar Roleta Global'}
                      </span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Floating Emoji Reactions Overlay */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-20">
          {floatingEmojis.map((item) => (
            <div
              key={item.id}
              style={{ left: `${item.x}%` }}
              className="absolute bottom-20 text-5xl animate-bounce transition-all duration-1000 ease-out"
            >
              {item.emoji}
            </div>
          ))}
        </div>

        {/* In-Call Text Chat Drawer */}
        {isChatOpen && (
          <div className="absolute right-3 top-3 bottom-24 md:bottom-3 w-80 max-w-[calc(100%-24px)] bg-zinc-900/95 backdrop-blur-md border border-zinc-800 rounded-2xl z-30 flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
            <div className="p-3 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2 text-white font-bold text-xs">
                <MessageSquare className="w-4 h-4 text-indigo-400" />
                <span>Chat com Parceiro</span>
              </div>
              <button
                onClick={() => setIsChatOpen(false)}
                className="text-zinc-400 hover:text-white text-xs px-2 py-1 rounded hover:bg-zinc-800 cursor-pointer"
              >
                Fechar
              </button>
            </div>

            {/* Messages List */}
            <div className="flex-1 p-3 overflow-y-auto space-y-2 text-xs">
              {messages.length === 0 ? (
                <div className="text-center py-8 text-zinc-500 italic text-[11px]">
                  Nenhuma mensagem ainda. Envie uma mensagem no chat!
                </div>
              ) : (
                messages.map((m) => (
                  <div
                    key={m.id}
                    className={`flex flex-col ${m.isSelf ? 'items-end' : 'items-start'}`}
                  >
                    <span className="text-[10px] text-zinc-400 mb-0.5">
                      {m.sender_name} • {m.timestamp}
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
                ))
              )}
              {isSimThinking && simulatedPeerActive && (
                <div className="flex items-center gap-1.5 text-[11px] text-indigo-300 italic px-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>{currentPeer?.username || 'Parceiro'} está respondendo...</span>
                </div>
              )}
              <div ref={chatBottomRef} />
            </div>

            {/* Quick Reactions Bar in Chat */}
            <div className="px-3 py-1.5 border-t border-zinc-800 bg-zinc-950/60 flex justify-between">
              {['❤️', '😂', '🔥', '👏', '👋', '🤩'].map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => sendReaction(emoji)}
                  className="hover:scale-125 transition text-base cursor-pointer"
                >
                  {emoji}
                </button>
              ))}
            </div>

            {/* Input form */}
            <form onSubmit={handleSendMessage} className="p-3 border-t border-zinc-800 flex gap-2">
              {simulatedPeerActive && (
                <button
                  type="button"
                  disabled={isSimThinking}
                  onClick={toggleSimVoiceRecording}
                  className={`p-2 rounded-xl transition cursor-pointer shrink-0 disabled:opacity-50 ${
                    isSimRecording
                      ? 'bg-red-600 text-white animate-pulse'
                      : 'bg-zinc-800 hover:bg-zinc-700 text-emerald-400'
                  }`}
                  title={isSimRecording ? 'Parar e enviar voz' : 'Falar por voz'}
                  aria-label={isSimRecording ? 'Parar e enviar voz' : 'Falar por voz'}
                >
                  {isSimRecording ? <Square className="w-4 h-4 fill-current" /> : <Mic className="w-4 h-4" />}
                </button>
              )}
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={isSimRecording ? 'Gravando sua voz...' : 'Digite uma mensagem...'}
                className="flex-1 min-w-0 px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-white text-xs placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
              />
              <button
                type="submit"
                disabled={!inputText.trim() || (simulatedPeerActive && isSimThinking)}
                className="p-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl transition cursor-pointer shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Mobile-Only Fixed Footer Control Bar (30% transparent red background, icon-only camera & audio) */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-red-600/30 backdrop-blur-md border-t border-red-400/40 px-2.5 py-2.5 shadow-2xl">
        <div className="max-w-md mx-auto flex items-center justify-between gap-2">
          {/* Start / Searching / Next Roulette Action */}
          {rouletteState === 'idle' ? (
            <button
              type="button"
              onClick={() => startSearching()}
              className="flex-1 py-2.5 px-3 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold rounded-xl shadow-md transition flex items-center justify-center gap-1.5 text-xs cursor-pointer"
            >
              <Play className="w-4 h-4 fill-current shrink-0" />
              <span className="truncate">Iniciar Roleta</span>
            </button>
          ) : rouletteState === 'searching' ? (
            <button
              type="button"
              onClick={stopSearching}
              className="flex-1 py-2.5 px-3 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl shadow-md transition flex items-center justify-center gap-1.5 text-xs cursor-pointer"
            >
              <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
              <span className="truncate">Buscando...</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleNextUser}
              className="flex-1 py-2.5 px-3 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-bold rounded-xl shadow-md transition flex items-center justify-center gap-1.5 text-xs cursor-pointer"
            >
              <SkipForward className="w-4 h-4 shrink-0" />
              <span className="truncate">Próximo</span>
            </button>
          )}

          {/* Camera Toggle Command (icon only) */}
          <button
            type="button"
            onClick={toggleVideo}
            className={`p-2.5 rounded-xl transition flex items-center justify-center border cursor-pointer shrink-0 ${
              isVideoDisabled
                ? 'bg-zinc-950/80 text-red-300 border-red-400/50'
                : 'bg-black/40 text-white border-white/25 hover:bg-black/60'
            }`}
            title={isVideoDisabled ? 'Ligar câmera' : 'Desligar câmera'}
            aria-label={isVideoDisabled ? 'Ligar câmera' : 'Desligar câmera'}
          >
            {isVideoDisabled ? <VideoOff className="w-4 h-4" /> : <Video className="w-4 h-4" />}
          </button>

          {/* Audio Toggle Command (icon only) */}
          <button
            type="button"
            onClick={toggleMic}
            className={`p-2.5 rounded-xl transition flex items-center justify-center border cursor-pointer shrink-0 ${
              isMicMuted
                ? 'bg-zinc-950/80 text-red-300 border-red-400/50'
                : 'bg-black/40 text-white border-white/25 hover:bg-black/60'
            }`}
            title={isMicMuted ? 'Ativar microfone' : 'Silenciar microfone'}
            aria-label={isMicMuted ? 'Ativar microfone' : 'Silenciar microfone'}
          >
            {isMicMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>

          {/* Disconnect Button */}
          <button
            type="button"
            disabled={rouletteState === 'idle'}
            onClick={() => {
              if (rouletteState === 'searching') stopSearching();
              else handleDisconnect();
            }}
            className="px-3 py-2.5 bg-red-700 hover:bg-red-600 disabled:bg-black/30 disabled:text-white/45 text-white font-bold rounded-xl border border-white/20 disabled:border-white/10 transition flex items-center justify-center gap-1 text-xs cursor-pointer disabled:cursor-not-allowed shrink-0"
            title="Desconectar"
          >
            <Square className="w-3.5 h-3.5 fill-current shrink-0" />
            <span>Desconectar</span>
          </button>
        </div>
      </div>

      {/* Floating Bottom Control Dock (Desktop) */}
      <div className="hidden md:block bg-zinc-950/95 backdrop-blur-md border-t border-zinc-800 px-4 py-3 z-30 shrink-0">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          {/* Left Quick Reactions */}
          <div className="hidden sm:flex items-center gap-1 bg-zinc-900 border border-zinc-800 p-1 rounded-xl">
            {['👋', '❤️', '😂', '🔥', '👏'].map((emoji) => (
              <button
                key={emoji}
                onClick={() => sendReaction(emoji)}
                className="w-8 h-8 flex items-center justify-center hover:bg-zinc-800 rounded-lg text-base transition transform active:scale-125 cursor-pointer"
                title={`Reagir ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>

          {/* Center Main Actions */}
          <div className="flex items-center gap-2 sm:gap-3 mx-auto">
            {rouletteState === 'idle' ? (
              <button
                onClick={() => startSearching()}
                className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold rounded-2xl shadow-lg shadow-emerald-600/30 transition flex items-center gap-2 text-xs sm:text-sm cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Iniciar Roleta</span>
              </button>
            ) : rouletteState === 'searching' ? (
              <button
                onClick={stopSearching}
                className="px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-red-400 font-bold rounded-2xl transition flex items-center gap-2 text-xs sm:text-sm border border-zinc-700 cursor-pointer"
              >
                <Square className="w-4 h-4 fill-current" />
                <span>Cancelar Busca</span>
              </button>
            ) : (
              <>
                <button
                  onClick={handleNextUser}
                  className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-bold rounded-2xl shadow-lg shadow-indigo-600/30 transition flex items-center gap-2 text-xs sm:text-sm transform hover:scale-105 active:scale-95 cursor-pointer"
                  title="Pular para o próximo usuário imediatamente"
                >
                  <SkipForward className="w-4 h-4" />
                  <span>Próximo Parceiro</span>
                </button>

                <button
                  onClick={handleDisconnect}
                  className="px-4 py-3 bg-red-600 hover:bg-red-500 active:bg-red-700 text-white font-bold rounded-2xl shadow-lg shadow-red-600/30 transition flex items-center gap-2 text-xs sm:text-sm cursor-pointer"
                  title="Encerrar conexão"
                >
                  <Square className="w-4 h-4 fill-current" />
                  <span className="hidden sm:inline">Desconectar</span>
                </button>
              </>
            )}

            {/* Media Toggles */}
            <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 p-1 rounded-2xl">
              <button
                onClick={toggleMic}
                className={`p-2.5 rounded-xl transition cursor-pointer ${
                  isMicMuted
                    ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                    : 'text-zinc-300 hover:bg-zinc-800'
                }`}
                title={isMicMuted ? 'Ativar microfone' : 'Silenciar microfone'}
              >
                {isMicMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>

              <button
                onClick={toggleVideo}
                className={`p-2.5 rounded-xl transition cursor-pointer ${
                  isVideoDisabled
                    ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                    : 'text-zinc-300 hover:bg-zinc-800'
                }`}
                title={isVideoDisabled ? 'Ligar câmera' : 'Desligar câmera'}
              >
                {isVideoDisabled ? <VideoOff className="w-4 h-4" /> : <Video className="w-4 h-4" />}
              </button>

              <button
                onClick={() => setIsChatOpen(!isChatOpen)}
                className={`relative p-2.5 rounded-xl transition cursor-pointer ${
                  isChatOpen
                    ? 'bg-indigo-600 text-white'
                    : 'text-zinc-300 hover:bg-zinc-800'
                }`}
                title="Abrir Chat de Texto"
              >
                <MessageSquare className="w-4 h-4" />
                {messages.length > 0 && !isChatOpen && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
