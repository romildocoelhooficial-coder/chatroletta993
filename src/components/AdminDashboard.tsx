import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useAuth } from '../context/AuthContext.tsx';
import {
  User,
  Report,
  PaymentStatus,
  ClientLead,
  ClientLeadStatus,
  AccessPackageId,
  WorldRegionId,
  TeachSubject,
} from '../types/index.ts';
import {
  ACCESS_PACKAGE_LIST,
  TEACH_SUBJECT_LABELS,
  WORLD_REGIONS,
  getPackageConfig,
  getRegionLabel,
  inferRegionFromCountry,
} from '../constants/packages.ts';
import { localDb } from '../services/localDatabase.ts';
import { socketService } from '../services/socket.ts';
import { RTC_CONFIGURATION } from '../services/webrtc.ts';
import { resolveAvatarUrl } from '../services/avatar.ts';
import {
  Shield,
  Users,
  UserPlus,
  Search,
  Edit2,
  Trash2,
  Ban,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Lock,
  Eye,
  X,
  Radio,
  Flag,
  CreditCard,
  Send,
  Megaphone,
  Volume2,
  VolumeX,
  Maximize2,
  Video,
  CheckSquare,
  Square,
  FileText,
  Download,
  UserCheck,
} from 'lucide-react';

interface SpyTarget {
  socketId: string;
  userId: string;
  username: string;
  unique_code: string;
  avatar?: string;
  country?: string;
  activity: string;
}

interface SpyFeed extends SpyTarget {
  stream: MediaStream | null;
  connectionState: string;
}

// Resilient video element binder for Admin SPY thumbnails & expanded preview
const SpyVideoPlayer: React.FC<{
  stream: MediaStream | null;
  muted: boolean;
  className?: string;
}> = ({ stream, muted, className = '' }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (!stream) {
      el.srcObject = null;
      return;
    }
    el.srcObject = stream;
    const play = () => {
      el.play().catch(() => {});
    };
    play();

    const onTrack = () => {
      if (el.srcObject !== stream) el.srcObject = stream;
      play();
    };
    stream.addEventListener('addtrack', onTrack);
    return () => {
      stream.removeEventListener('addtrack', onTrack);
    };
  }, [stream]);

  return <video ref={videoRef} autoPlay playsInline muted={muted} className={className} />;
};

export const AdminDashboard: React.FC = () => {
  const { user, token } = useAuth();
  const socket = socketService.getSocket();

  // Metrics
  const [metrics, setMetrics] = useState({
    totalUsers: 0,
    onlineUsers: 0,
    activeCalls: 0,
    bannedUsers: 0,
    pendingReports: 0,
  });

  // Active Tab: 'users' | 'clients' | 'spy' | 'reports'
  const [adminTab, setAdminTab] = useState<'users' | 'clients' | 'spy' | 'reports'>('users');

  // Users list state
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [packageFilter, setPackageFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Admin Client Leads list state
  const [clientLeads, setClientLeads] = useState<ClientLead[]>([]);
  const [clientAttendants, setClientAttendants] = useState<
    { id: string; username: string; unique_code: string }[]
  >([]);
  const [loadingClients, setLoadingClients] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const [clientOwnerFilter, setClientOwnerFilter] = useState('all');
  const [clientStatusFilter, setClientStatusFilter] = useState('all');
  const [clientReadFilter, setClientReadFilter] = useState('all');

  // Selected user IDs for Admin Message Broadcast
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [adminMessageInput, setAdminMessageInput] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);

  // Reports state
  const [reports, setReports] = useState<Report[]>([]);

  // SPY Live Monitor state
  const [spyTargets, setSpyTargets] = useState<SpyTarget[]>([]);
  const [spyStreams, setSpyStreams] = useState<Record<string, { stream: MediaStream | null; state: string }>>({});
  const [unmutedSockets, setUnmutedSockets] = useState<Set<string>>(new Set());
  const [expandedSpySocketId, setExpandedSpySocketId] = useState<string | null>(null);
  const [focusedSpyUserId, setFocusedSpyUserId] = useState<string | null>(null);
  const spyPeersRef = useRef<
    Map<string, { pc: RTCPeerConnection; stream: MediaStream; pendingCandidates: RTCIceCandidateInit[] }>
  >(new Map());

  // Modals state
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isBanModalOpen, setIsBanModalOpen] = useState(false);
  const [banReasonInput, setBanReasonInput] = useState('');

  // Edit / Create Form states
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    role: 'user' as 'user' | 'admin',
    status: 'online' as 'online' | 'busy' | 'offline' | 'banned',
    payment_status: 'pendente' as PaymentStatus,
    access_package: 'pacote_01_gratuito' as AccessPackageId,
    country: 'Brasil 🇧🇷',
    region: 'america_sul' as WorldRegionId,
    gender: 'unspecified',
    intent_just_browse: false,
    intent_choose_gender_region: false,
    intent_teach_classes: false,
    teach_subjects: [] as TeachSubject[],
    teach_description: '',
    bio: '',
  });

  // Notification message
  const [actionAlert, setActionAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showAlert = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setActionAlert({ type, message });
    setTimeout(() => setActionAlert(null), 3500);
  }, []);

  // Fetch metrics
  const fetchMetrics = async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/admin/metrics', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const contentType = res.headers.get('content-type');
      if (res.ok && contentType && contentType.includes('application/json')) {
        const data = await res.json();
        setMetrics(data);
        return;
      }
    } catch {
      // ignore
    }
    const allUsers = localDb.getUsers();
    const allReports = localDb.getReports();
    setMetrics({
      totalUsers: allUsers.length,
      onlineUsers: allUsers.filter((u) => u.status === 'online').length,
      activeCalls: 0,
      bannedUsers: allUsers.filter((u) => u.status === 'banned').length,
      pendingReports: allReports.filter((r) => !r.resolved).length,
    });
  };

  // Fetch Users
  const fetchUsers = async () => {
    if (!token) return;
    setLoadingUsers(true);
    try {
      const query = new URLSearchParams({
        search,
        status: statusFilter,
        role: roleFilter,
        package: packageFilter,
        page: page.toString(),
        limit: '8',
      });
      const res = await fetch(`/api/admin/users?${query.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const contentType = res.headers.get('content-type');
      if (res.ok && contentType && contentType.includes('application/json')) {
        const data = await res.json();
        setUsers(data.users);
        setTotalPages(data.pagination.totalPages);
        setLoadingUsers(false);
        return;
      }
    } catch {
      // ignore
    }
    let filtered = localDb.getUsers().map((u) => {
      const { password_hash, ...safe } = u;
      return safe;
    });
    if (search) {
      const s = search.toLowerCase();
      filtered = filtered.filter(
        (u) =>
          u.username.toLowerCase().includes(s) ||
          u.email.toLowerCase().includes(s) ||
          u.unique_code.toLowerCase().includes(s)
      );
    }
    if (statusFilter !== 'all') {
      filtered = filtered.filter((u) => u.status === statusFilter);
    }
    if (roleFilter !== 'all') {
      filtered = filtered.filter((u) => u.role === roleFilter);
    }
    if (packageFilter !== 'all') {
      filtered = filtered.filter((u) => (u.access_package || 'pacote_01_gratuito') === packageFilter);
    }
    const limit = 8;
    setTotalPages(Math.ceil(filtered.length / limit) || 1);
    setUsers(filtered.slice((page - 1) * limit, page * limit));
    setLoadingUsers(false);
  };

  // Fetch Reports
  const fetchReports = async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/admin/reports', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const contentType = res.headers.get('content-type');
      if (res.ok && contentType && contentType.includes('application/json')) {
        const data = await res.json();
        setReports(data.reports);
        return;
      }
    } catch {
      // ignore
    }
    setReports(localDb.getReports());
  };

  // Fetch Client Leads for Admin Spreadsheet
  const fetchClientLeads = useCallback(async () => {
    if (!token) return;
    setLoadingClients(true);
    try {
      const res = await fetch('/api/admin/clients', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const contentType = res.headers.get('content-type');
      if (res.ok && contentType && contentType.includes('application/json')) {
        const data = await res.json();
        setClientLeads(data.leads || []);
        setClientAttendants(data.attendants || []);
        setLoadingClients(false);
        return;
      }
    } catch {
      // ignore and fall back to localDb
    }

    const allUsers = localDb.getUsers();
    const localLeads = localDb.getClientLeads().map((lead) => {
      const owner = allUsers.find(
        (u) => u.id === lead.owner_id || u.unique_code === lead.owner_code
      );
      return {
        ...lead,
        owner_name: owner?.username || lead.owner_code || 'Usuário não identificado',
        owner_code: owner?.unique_code || lead.owner_code,
      };
    });
    setClientLeads(localLeads);
    setClientAttendants(
      allUsers
        .filter((u) => u.role !== 'admin')
        .map((u) => ({ id: u.id, username: u.username, unique_code: u.unique_code }))
        .sort((a, b) => a.username.localeCompare(b.username, 'pt-BR'))
    );
    setLoadingClients(false);
  }, [token]);

  useEffect(() => {
    if (user?.role === 'admin') {
      fetchMetrics();
      fetchUsers();
      fetchReports();
    }
  }, [user, search, statusFilter, roleFilter, packageFilter, page]);

  useEffect(() => {
    if (user?.role === 'admin') {
      fetchClientLeads();
    }
  }, [user?.role, fetchClientLeads]);

  // --- ADMIN SPY REAL-TIME WEBRTC RECEIVER ---
  const cleanupAllSpyPeers = useCallback(() => {
    spyPeersRef.current.forEach((entry) => {
      try {
        entry.pc.close();
      } catch {
        // ignore
      }
    });
    spyPeersRef.current.clear();
    setSpyStreams({});
  }, []);

  useEffect(() => {
    if (user?.role !== 'admin' || adminTab !== 'spy') {
      socket.emit('admin:spy_stop');
      cleanupAllSpyPeers();
      return;
    }

    const onSpyTargets = (targets: SpyTarget[]) => {
      setSpyTargets(targets);
      const activeSet = new Set(targets.map((t) => t.socketId));
      // Close stale peer connections for users who went offline
      for (const [sId, entry] of spyPeersRef.current.entries()) {
        if (!activeSet.has(sId)) {
          try {
            entry.pc.close();
          } catch {
            // ignore
          }
          spyPeersRef.current.delete(sId);
        }
      }
      // Request offer from newly connected targets that don't have a live connection yet
      const missingIds = targets
        .filter((t) => !spyPeersRef.current.has(t.socketId))
        .map((t) => t.socketId);
      if (missingIds.length > 0) {
        missingIds.forEach((id) => {
          // Avoid tight loops; server handles individual requests cleanly
          socket.emit('admin:spy_start', { targetSocketIds: [id] });
        });
      }
    };

    const onSpyOffer = async (payload: {
      fromSocketId: string;
      userId: string;
      username: string;
      unique_code: string;
      avatar?: string;
      country?: string;
      activity: string;
      sdp: RTCSessionDescriptionInit;
    }) => {
      const existing = spyPeersRef.current.get(payload.fromSocketId);
      if (existing) {
        try {
          existing.pc.close();
        } catch {
          // ignore
        }
        spyPeersRef.current.delete(payload.fromSocketId);
      }

      const pc = new RTCPeerConnection(RTC_CONFIGURATION);
      const remoteStream = new MediaStream();
      const entry = {
        pc,
        stream: remoteStream,
        pendingCandidates: [] as RTCIceCandidateInit[],
      };
      spyPeersRef.current.set(payload.fromSocketId, entry);

      pc.ontrack = (ev) => {
        const incomingStream = ev.streams?.[0] || entry.stream;
        if (!ev.streams?.[0] && !entry.stream.getTracks().some((t) => t.id === ev.track.id)) {
          entry.stream.addTrack(ev.track);
        }
        entry.stream = incomingStream;
        setSpyStreams((prev) => ({
          ...prev,
          [payload.fromSocketId]: { stream: incomingStream, state: pc.connectionState },
        }));
      };

      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          socket.emit('spy:ice_candidate', {
            toSocketId: payload.fromSocketId,
            candidate: ev.candidate,
          });
        }
      };

      pc.onconnectionstatechange = () => {
        setSpyStreams((prev) => ({
          ...prev,
          [payload.fromSocketId]: {
            stream: prev[payload.fromSocketId]?.stream || entry.stream,
            state: pc.connectionState,
          },
        }));
      };

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        while (entry.pendingCandidates.length > 0) {
          const cand = entry.pendingCandidates.shift();
          if (cand) {
            await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
          }
        }
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('spy:webrtc_answer', {
          toSocketId: payload.fromSocketId,
          sdp: answer,
        });
      } catch (err) {
        console.warn('[Admin SPY] Error handling spy offer:', err);
      }
    };

    const onSpyCandidate = async (payload: { fromSocketId: string; candidate: RTCIceCandidateInit }) => {
      const entry = spyPeersRef.current.get(payload.fromSocketId);
      if (!entry || !payload.candidate?.candidate) return;
      if (!entry.pc.remoteDescription || !entry.pc.remoteDescription.type) {
        entry.pendingCandidates.push(payload.candidate);
      } else {
        await entry.pc.addIceCandidate(new RTCIceCandidate(payload.candidate)).catch(() => {});
      }
    };

    socket.on('admin:spy_targets', onSpyTargets);
    socket.on('spy:webrtc_offer', onSpyOffer);
    socket.on('spy:ice_candidate', onSpyCandidate);

    // Trigger initial capture request across all online users
    socket.emit('admin:spy_start');

    return () => {
      socket.off('admin:spy_targets', onSpyTargets);
      socket.off('spy:webrtc_offer', onSpyOffer);
      socket.off('spy:ice_candidate', onSpyCandidate);
      socket.emit('admin:spy_stop');
      cleanupAllSpyPeers();
    };
  }, [adminTab, user?.role, socket, cleanupAllSpyPeers]);

  // Toggle audio mute on a specific SPY thumbnail
  const toggleSpyAudio = (socketId: string) => {
    setUnmutedSockets((prev) => {
      const next = new Set(prev);
      if (next.has(socketId)) next.delete(socketId);
      else next.add(socketId);
      return next;
    });
  };

  // Toggle Payment Status directly in CRUD row action
  const handleTogglePaymentStatus = async (targetUser: User) => {
    if (!token) return;
    const nextStatus: PaymentStatus = targetUser.payment_status === 'pago' ? 'pendente' : 'pago';

    try {
      const res = await fetch(`/api/admin/users/${targetUser.id}/payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ payment_status: nextStatus }),
      });
      if (res.ok) {
        const data = await res.json();
        showAlert(data.message, 'success');
        fetchUsers();
        return;
      }
    } catch {
      // Local fallback
    }

    const allUsers = localDb.getUsers();
    const u = allUsers.find((x) => x.id === targetUser.id);
    if (u) {
      u.payment_status = nextStatus;
      localDb.saveUsers(allUsers);
      showAlert(`Pagamento atualizado para ${nextStatus.toUpperCase()}.`, 'success');
      fetchUsers();
    }
  };

  // Checkbox selection helpers for Admin Broadcast Messages
  const toggleSelectUser = (id: string) => {
    setSelectedUserIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleSelectAllInPage = () => {
    const nonAdminIds = users.filter((u) => u.role !== 'admin').map((u) => u.id);
    const allSelected = nonAdminIds.length > 0 && nonAdminIds.every((id) => selectedUserIds.includes(id));
    if (allSelected) {
      setSelectedUserIds((prev) => prev.filter((id) => !nonAdminIds.includes(id)));
    } else {
      setSelectedUserIds((prev) => Array.from(new Set([...prev, ...nonAdminIds])));
    }
  };

  // Send persistent Admin Message to selected users or all users
  const handleSendAdminMessage = async (sendToAll: boolean) => {
    if (!token) return;
    const text = adminMessageInput.trim();
    if (!text) {
      showAlert('Digite a mensagem antes de enviar.', 'error');
      return;
    }
    if (!sendToAll && selectedUserIds.length === 0) {
      showAlert('Selecione pelo menos 1 usuário na tabela ou clique em "Enviar para Todos".', 'error');
      return;
    }

    setSendingMessage(true);
    try {
      const res = await fetch('/api/admin/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          userIds: sendToAll ? undefined : selectedUserIds,
          sendToAll,
          text,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        showAlert(data.message, 'success');
        setAdminMessageInput('');
        fetchUsers();
        setSendingMessage(false);
        return;
      }
    } catch {
      // Local fallback
    }

    const msgPayload = {
      id: `adm_msg_${Date.now()}`,
      text,
      sent_at: new Date().toISOString(),
      sent_by: 'Administração',
    };
    const allUsers = localDb.getUsers();
    let count = 0;
    allUsers.forEach((u) => {
      if (sendToAll ? u.role !== 'admin' : selectedUserIds.includes(u.id)) {
        u.admin_message = msgPayload;
        count++;
      }
    });
    localDb.saveUsers(allUsers);
    showAlert(`Mensagem enviada para ${count} usuário(s).`, 'success');
    setAdminMessageInput('');
    fetchUsers();
    setSendingMessage(false);
  };

  // Handle Ban / Unban
  const handleToggleBan = async (userToBan: User, reason: string = 'Violação dos Termos') => {
    if (!token) return;
    const isBanning = userToBan.status !== 'banned';
    try {
      const res = await fetch(`/api/admin/users/${userToBan.id}/ban`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: isBanning ? 'ban' : 'unban',
          reason,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        showAlert(data.message, 'success');
        setIsBanModalOpen(false);
        fetchUsers();
        fetchMetrics();
        return;
      }
    } catch {
      // Local fallback
    }

    const allUsers = localDb.getUsers();
    const u = allUsers.find((x) => x.id === userToBan.id);
    if (u) {
      u.status = isBanning ? 'banned' : 'offline';
      u.ban_reason = isBanning ? reason : undefined;
      localDb.saveUsers(allUsers);
      showAlert(isBanning ? 'Usuário banido com sucesso.' : 'Usuário desbanido.', 'success');
      setIsBanModalOpen(false);
      fetchUsers();
      fetchMetrics();
    }
  };

  // Handle Delete User
  const handleDeleteUser = async (id: string, username: string) => {
    if (!window.confirm(`Tem certeza que deseja remover o usuário "${username}" permanentemente?`)) {
      return;
    }
    if (!token) return;
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        showAlert(data.message, 'success');
        fetchUsers();
        fetchMetrics();
        return;
      }
    } catch {
      // Local fallback
    }

    let allUsers = localDb.getUsers();
    allUsers = allUsers.filter((u) => u.id !== id);
    localDb.saveUsers(allUsers);
    showAlert(`Usuário ${username} removido com sucesso.`, 'success');
    fetchUsers();
    fetchMetrics();
  };

  // Handle Edit User
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser || !token) return;

    try {
      const res = await fetch(`/api/admin/users/${selectedUser.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        showAlert('Usuário atualizado com sucesso!', 'success');
        setIsEditModalOpen(false);
        fetchUsers();
        return;
      }
    } catch {
      // Local fallback
    }

    const allUsers = localDb.getUsers();
    const u = allUsers.find((x) => x.id === selectedUser.id);
    if (u) {
      if (formData.username) u.username = formData.username;
      if (formData.email) u.email = formData.email;
      if (formData.role) u.role = formData.role;
      if (formData.status) u.status = formData.status;
      if (formData.payment_status) u.payment_status = formData.payment_status;
      u.access_package = formData.access_package;
      u.intent_just_browse = formData.intent_just_browse;
      u.intent_choose_gender_region = formData.intent_choose_gender_region;
      u.intent_teach_classes = formData.intent_teach_classes;
      u.teach_subjects = formData.teach_subjects;
      u.teach_description = formData.teach_description;
      u.gender = formData.gender;
      if (formData.country) u.country = formData.country;
      u.region = inferRegionFromCountry(formData.country, formData.region);
      if (formData.bio !== undefined) u.bio = formData.bio;
      localDb.saveUsers(allUsers);
      showAlert('Usuário atualizado com sucesso!', 'success');
      setIsEditModalOpen(false);
      fetchUsers();
    }
  };

  // Handle Create User
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        showAlert('Novo usuário cadastrado!', 'success');
        setIsCreateModalOpen(false);
        fetchUsers();
        fetchMetrics();
        return;
      }
    } catch {
      // Local fallback
    }

    try {
      localDb.register({
        username: formData.username,
        email: formData.email,
        password: formData.password || 'user123',
        country: formData.country,
        region: formData.region,
        gender: formData.gender,
        access_package: formData.access_package,
        intent_just_browse: formData.intent_just_browse,
        intent_choose_gender_region: formData.intent_choose_gender_region,
        intent_teach_classes: formData.intent_teach_classes,
        teach_subjects: formData.teach_subjects,
        teach_description: formData.teach_description,
        bio: formData.bio,
      });
      showAlert('Novo usuário cadastrado com sucesso!', 'success');
      setIsCreateModalOpen(false);
      fetchUsers();
      fetchMetrics();
    } catch (err: any) {
      showAlert(err?.message || 'Erro ao criar usuário', 'error');
    }
  };

  // Resolve Report
  const handleResolveReport = async (reportId: string) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/admin/reports/${reportId}/resolve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        showAlert('Denúncia marcada como resolvida!', 'success');
        fetchReports();
        fetchMetrics();
        return;
      }
    } catch {
      // Local fallback
    }

    const allReports = localDb.getReports();
    const rep = allReports.find((r) => r.id === reportId);
    if (rep) {
      rep.resolved = true;
      localDb.saveReports(allReports);
      showAlert('Denúncia marcada como resolvida!', 'success');
      fetchReports();
      fetchMetrics();
    }
  };

  // Not Admin Gate — Strictly requires real admin authentication (no direct 1-click button)
  if (!user || user.role !== 'admin') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-zinc-950 text-center">
        <div className="w-16 h-16 bg-red-500/10 text-red-400 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-red-500/20">
          <Lock className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Acesso Restrito à Administração</h2>
        <p className="text-sm text-zinc-400 max-w-md leading-relaxed">
          Esta área é exclusiva para administradores autenticados. Utilize o botão <strong>Entrar</strong> com suas credenciais administrativas para acessar.
        </p>
      </div>
    );
  }

  const spyFeeds: SpyFeed[] = spyTargets.map((t) => ({
    ...t,
    stream: spyStreams[t.socketId]?.stream || null,
    connectionState: spyStreams[t.socketId]?.state || 'connecting',
  }));

  const expandedFeed = expandedSpySocketId
    ? spyFeeds.find((f) => f.socketId === expandedSpySocketId) || null
    : null;

  const nonAdminInPage = users.filter((u) => u.role !== 'admin');
  const allPageSelected =
    nonAdminInPage.length > 0 && nonAdminInPage.every((u) => selectedUserIds.includes(u.id));

  // Filtered Client Leads (General Search + Attendant User Filter + Status + Reading State)
  const filteredClientLeads = useMemo(() => {
    const q = clientSearch.toLowerCase().trim();
    return clientLeads.filter((lead) => {
      if (
        clientOwnerFilter !== 'all' &&
        lead.owner_id !== clientOwnerFilter &&
        lead.owner_code !== clientOwnerFilter
      ) {
        return false;
      }
      if (clientStatusFilter !== 'all' && lead.status !== clientStatusFilter) {
        return false;
      }
      if (clientReadFilter === 'lido' && !lead.is_read) {
        return false;
      }
      if (clientReadFilter === 'pendente' && lead.is_read) {
        return false;
      }
      if (q) {
        const haystack = [
          lead.name,
          lead.client_label,
          lead.whatsapp,
          lead.email,
          lead.message,
          lead.owner_name,
          lead.owner_code,
          lead.notes,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [clientLeads, clientSearch, clientOwnerFilter, clientStatusFilter, clientReadFilter]);

  const formatClientStatusLabel = (status: ClientLeadStatus) => {
    switch (status) {
      case 'novo':
        return 'Novo';
      case 'em_atendimento':
        return 'Em Atendimento';
      case 'atendido':
        return 'Atendido';
      case 'retornar':
        return 'Retornar';
      default:
        return status;
    }
  };

  const handleExportClientsPdf = () => {
    if (filteredClientLeads.length === 0) {
      showAlert('Não há clientes filtrados para exportar.', 'error');
      return;
    }

    try {
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const nowStr = new Date().toLocaleString('pt-BR');
      const selectedAttendant =
        clientOwnerFilter === 'all'
          ? 'Todos os Usuários'
          : clientAttendants.find(
              (a) => a.id === clientOwnerFilter || a.unique_code === clientOwnerFilter
            )?.username || clientOwnerFilter;

      doc.setFontSize(15);
      doc.setTextColor(15, 23, 42);
      doc.text('Relatório de Clientes Atendidos — ChatRouletteP2P', 14, 15);

      doc.setFontSize(9);
      doc.setTextColor(71, 85, 105);
      doc.text(
        `Gerado em: ${nowStr}   |   Total listado: ${filteredClientLeads.length} registro(s)   |   Filtro por Usuário: ${selectedAttendant}`,
        14,
        22
      );
      if (clientSearch.trim() || clientStatusFilter !== 'all' || clientReadFilter !== 'all') {
        const activeDetails = [
          clientSearch.trim() ? `Busca: "${clientSearch.trim()}"` : null,
          clientStatusFilter !== 'all'
            ? `Status: ${formatClientStatusLabel(clientStatusFilter as ClientLeadStatus)}`
            : null,
          clientReadFilter !== 'all'
            ? `Leitura: ${clientReadFilter === 'lido' ? 'Lidos' : 'Pendentes'}`
            : null,
        ]
          .filter(Boolean)
          .join('   |   ');
        doc.text(`Filtros aplicados: ${activeDetails}`, 14, 27);
      }

      const tableRows = filteredClientLeads.map((lead) => [
        lead.client_label || '-',
        `${lead.owner_name || 'Não identificado'}\n(${lead.owner_code || '-'})`,
        lead.name || '-',
        lead.whatsapp || '-',
        lead.email || '-',
        lead.message || '-',
        lead.call_date ? new Date(lead.call_date).toLocaleString('pt-BR') : '-',
        lead.is_read ? 'Lido' : 'Pendente',
        formatClientStatusLabel(lead.status),
      ]);

      autoTable(doc, {
        startY:
          clientSearch.trim() || clientStatusFilter !== 'all' || clientReadFilter !== 'all'
            ? 31
            : 27,
        head: [
          [
            'Identificação',
            'Usuário que Atendeu',
            'Nome do Cliente',
            'WhatsApp',
            'E-mail',
            'Mensagem Inicial',
            'Data de Entrada',
            'Leitura',
            'Status',
          ],
        ],
        body: tableRows,
        styles: {
          fontSize: 8,
          cellPadding: 2.5,
          overflow: 'linebreak',
          valign: 'middle',
          textColor: [30, 41, 59],
        },
        headStyles: {
          fillColor: [79, 70, 229],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 8,
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252],
        },
        columnStyles: {
          0: { cellWidth: 28 },
          1: { cellWidth: 36 },
          2: { cellWidth: 30 },
          3: { cellWidth: 28 },
          4: { cellWidth: 38 },
          5: { cellWidth: 50 },
          6: { cellWidth: 28 },
          7: { cellWidth: 18 },
          8: { cellWidth: 22 },
        },
        didDrawPage: (data) => {
          const pageCount = doc.getNumberOfPages();
          doc.setFontSize(8);
          doc.setTextColor(100, 116, 139);
          doc.text(
            `Página ${data.pageNumber} de ${pageCount}`,
            doc.internal.pageSize.getWidth() - 32,
            doc.internal.pageSize.getHeight() - 8
          );
        },
      });

      const fileDate = new Date().toISOString().slice(0, 10);
      doc.save(`clientes-atendidos-${fileDate}.pdf`);
      showAlert('Relatório PDF exportado com sucesso!', 'success');
    } catch (err) {
      console.error('Erro ao exportar PDF:', err);
      showAlert('Não foi possível gerar o PDF dos clientes.', 'error');
    }
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-zinc-950 p-4 md:p-8 space-y-6">
      {/* Action Notification */}
      {actionAlert && (
        <div
          className={`p-4 rounded-2xl text-sm font-semibold flex items-center gap-2 border ${
            actionAlert.type === 'success'
              ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-200'
              : 'bg-red-950/60 border-red-500/40 text-red-200'
          }`}
        >
          {actionAlert.type === 'success' ? (
            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
          )}
          <span>{actionAlert.message}</span>
        </div>
      )}

      {/* Header and Refresh */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-indigo-500/20 text-indigo-400 rounded-lg">
              <Shield className="w-5 h-5" />
            </span>
            <h1 className="text-2xl font-black text-white tracking-tight">Painel Administrativo</h1>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Gestão completa (CRUD), controle de pagamento, comunicados fixos e monitoramento ao vivo SPY.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              fetchMetrics();
              fetchUsers();
              fetchReports();
              fetchClientLeads();
              if (adminTab === 'spy') socket.emit('admin:spy_start');
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-xl text-xs font-semibold text-zinc-300 hover:text-white transition cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Atualizar Dados</span>
          </button>

          <button
            onClick={() => {
              setFormData({
                username: '',
                email: '',
                password: 'user123',
                role: 'user',
                status: 'online',
                payment_status: 'pendente',
                access_package: 'pacote_01_gratuito',
                country: 'Brasil 🇧🇷',
                region: 'america_sul',
                gender: 'unspecified',
                intent_just_browse: true,
                intent_choose_gender_region: false,
                intent_teach_classes: false,
                teach_subjects: [],
                teach_description: '',
                bio: '',
              });
              setIsCreateModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-indigo-600/25 cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>Novo Usuário</span>
          </button>
        </div>
      </div>

      {/* Real-time Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
        <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-2xl">
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Total Usuários</span>
          <div className="text-2xl font-black text-white mt-1">{metrics.totalUsers}</div>
          <span className="text-[11px] text-zinc-500">Cadastrados no banco</span>
        </div>

        <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-2xl">
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> Online Agora
          </span>
          <div className="text-2xl font-black text-emerald-400 mt-1">{metrics.onlineUsers}</div>
          <span className="text-[11px] text-zinc-500">Com socket ativo</span>
        </div>

        <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-2xl">
          <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">Chamadas Ativas</span>
          <div className="text-2xl font-black text-indigo-400 mt-1">{metrics.activeCalls}</div>
          <span className="text-[11px] text-zinc-500">Roleta + Diretas</span>
        </div>

        <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-2xl">
          <span className="text-[10px] font-bold uppercase tracking-wider text-red-400">Usuários Banidos</span>
          <div className="text-2xl font-black text-red-400 mt-1">{metrics.bannedUsers}</div>
          <span className="text-[11px] text-zinc-500">Bloqueados de acessar</span>
        </div>

        <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-2xl">
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">Denúncias</span>
          <div className="text-2xl font-black text-amber-400 mt-1">{metrics.pendingReports}</div>
          <span className="text-[11px] text-zinc-500">Aguardando revisão</span>
        </div>
      </div>

      {/* Admin Tab Switcher */}
      <div className="flex flex-wrap border-b border-zinc-800">
        <button
          onClick={() => setAdminTab('users')}
          className={`flex items-center gap-2 pb-3 px-4 font-bold text-sm transition border-b-2 cursor-pointer ${
            adminTab === 'users'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-zinc-400 hover:text-white'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Gestão de Usuários (CRUD)</span>
        </button>

        <button
          onClick={() => {
            setAdminTab('clients');
            fetchClientLeads();
          }}
          className={`flex items-center gap-2 pb-3 px-4 font-bold text-sm transition border-b-2 cursor-pointer ${
            adminTab === 'clients'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-zinc-400 hover:text-white'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Lista de Clientes</span>
          <span className="px-1.5 py-0.2 bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 rounded-full text-[10px]">
            {clientLeads.length}
          </span>
        </button>

        <button
          onClick={() => {
            setFocusedSpyUserId(null);
            setAdminTab('spy');
          }}
          className={`flex items-center gap-2 pb-3 px-4 font-bold text-sm transition border-b-2 cursor-pointer ${
            adminTab === 'spy'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-zinc-400 hover:text-white'
          }`}
        >
          <Radio className={`w-4 h-4 ${adminTab === 'spy' ? 'animate-pulse' : ''}`} />
          <span>SPY • Monitor Ao Vivo</span>
          <span className="px-1.5 py-0.2 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded-full text-[10px]">
            Ao Vivo
          </span>
        </button>

        <button
          onClick={() => setAdminTab('reports')}
          className={`flex items-center gap-2 pb-3 px-4 font-bold text-sm transition border-b-2 cursor-pointer ${
            adminTab === 'reports'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-zinc-400 hover:text-white'
          }`}
        >
          <Flag className="w-4 h-4" />
          <span>Denúncias & Moderação</span>
          {metrics.pendingReports > 0 && (
            <span className="px-1.5 py-0.2 bg-red-500/20 text-red-400 border border-red-500/40 rounded-full text-[10px]">
              {metrics.pendingReports}
            </span>
          )}
        </button>
      </div>

      {adminTab === 'users' && (
        <div className="space-y-4">
          {/* Admin Persistent Broadcast Message Composer */}
          <div className="bg-zinc-900 border border-indigo-500/30 rounded-2xl p-4 shadow-xl space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-indigo-500/20 text-indigo-400 rounded-lg">
                  <Megaphone className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="text-xs font-extrabold text-white">
                    Enviar Mensagem Fixa no Painel de Transmissão (Abaixo do Cabeçalho)
                  </h3>
                  <p className="text-[11px] text-zinc-400">
                    Aceita textos e links (ex: https://...). Fica visível para o(s) usuário(s) até o Admin enviar outra mensagem.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 text-[11px]">
                <span className="px-2.5 py-1 bg-zinc-950 border border-zinc-800 rounded-lg font-mono text-indigo-300 font-bold">
                  {selectedUserIds.length} selecionado(s)
                </span>
                {selectedUserIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedUserIds([])}
                    className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition cursor-pointer"
                  >
                    Limpar Seleção
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-col md:flex-row gap-2.5">
              <input
                type="text"
                value={adminMessageInput}
                onChange={(e) => setAdminMessageInput(e.target.value)}
                placeholder="Digite o aviso ou link (ex: Atenção às regras! Saiba mais em https://seusite.com)..."
                className="flex-1 px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-white text-xs placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={sendingMessage || selectedUserIds.length === 0}
                  onClick={() => handleSendAdminMessage(false)}
                  className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-bold rounded-xl text-xs transition flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed shrink-0"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Enviar p/ Selecionados ({selectedUserIds.length})</span>
                </button>
                <button
                  type="button"
                  disabled={sendingMessage}
                  onClick={() => handleSendAdminMessage(true)}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  <Megaphone className="w-3.5 h-3.5" />
                  <span>Enviar p/ Todos</span>
                </button>
              </div>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome, email ou #CR-código..."
                className="w-full pl-10 pr-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-white text-xs placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={packageFilter}
                onChange={(e) => {
                  setPackageFilter(e.target.value);
                  setPage(1);
                }}
                className="px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-300 text-xs focus:outline-none focus:border-indigo-500"
                aria-label="Filtrar por pacote de acesso"
              >
                <option value="all">Todos os Pacotes</option>
                {ACCESS_PACKAGE_LIST.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.shortName}
                  </option>
                ))}
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-300 text-xs focus:outline-none focus:border-indigo-500"
              >
                <option value="all">Todos Status</option>
                <option value="online">Online</option>
                <option value="offline">Offline</option>
                <option value="banned">Banidos</option>
              </select>

              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-300 text-xs focus:outline-none focus:border-indigo-500"
              >
                <option value="all">Todos Papéis</option>
                <option value="user">Usuários</option>
                <option value="admin">Administradores</option>
              </select>
            </div>
          </div>

          {/* Users Table */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-950/60 text-zinc-400 uppercase font-bold border-b border-zinc-800">
                  <tr>
                    <th className="py-3.5 px-3 w-10">
                      <button
                        type="button"
                        onClick={toggleSelectAllInPage}
                        className="text-zinc-400 hover:text-white flex items-center justify-center cursor-pointer"
                        title="Selecionar todos da página"
                      >
                        {allPageSelected ? (
                          <CheckSquare className="w-4 h-4 text-indigo-400" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>
                    </th>
                    <th className="py-3.5 px-4">Usuário</th>
                    <th className="py-3.5 px-4">Código Único</th>
                    <th className="py-3.5 px-4">Pacote & Escolha</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4">Pagamento</th>
                    <th className="py-3.5 px-4">Região / País</th>
                    <th className="py-3.5 px-4">Cadastrado em</th>
                    <th className="py-3.5 px-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {loadingUsers ? (
                    <tr>
                      <td colSpan={9} className="text-center py-8 text-zinc-500">
                        Carregando usuários...
                      </td>
                    </tr>
                  ) : users.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="text-center py-8 text-zinc-500">
                        Nenhum usuário encontrado.
                      </td>
                    </tr>
                  ) : (
                    users.map((u) => {
                      const isSelected = selectedUserIds.includes(u.id);
                      const isPaid = u.payment_status === 'pago';
                      const pkgCfg = getPackageConfig(u.access_package);
                      return (
                        <tr
                          key={u.id}
                          className={`hover:bg-zinc-800/40 transition ${isSelected ? 'bg-indigo-950/20' : ''}`}
                        >
                          <td className="py-3 px-3">
                            {u.role !== 'admin' && (
                              <button
                                type="button"
                                onClick={() => toggleSelectUser(u.id)}
                                className="text-zinc-400 hover:text-white flex items-center justify-center cursor-pointer"
                                title="Selecionar para envio de mensagem"
                              >
                                {isSelected ? (
                                  <CheckSquare className="w-4 h-4 text-indigo-400" />
                                ) : (
                                  <Square className="w-4 h-4" />
                                )}
                              </button>
                            )}
                          </td>

                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2.5">
                              <img
                                src={resolveAvatarUrl(u.avatar, u.username)}
                                alt={u.username}
                                className="w-8 h-8 rounded-lg object-cover border border-zinc-700"
                              />
                              <div>
                                <div className="font-semibold text-white flex items-center gap-1.5">
                                  <span>{u.username}</span>
                                  {u.role === 'admin' && (
                                    <span className="px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 text-[9px] uppercase font-bold border border-indigo-500/30">
                                      Admin
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-zinc-400">{u.email}</div>
                                {u.admin_message?.text && (
                                  <div
                                    className="text-[10px] text-indigo-300 truncate max-w-[200px] mt-0.5"
                                    title={`Mensagem ativa: ${u.admin_message.text}`}
                                  >
                                    📢 {u.admin_message.text}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>

                          <td className="py-3 px-4">
                            <span className="font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                              {u.unique_code}
                            </span>
                          </td>

                          <td className="py-3 px-4">
                            <div className="flex flex-col gap-1 items-start">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap ${pkgCfg.badgeClass}`}
                              >
                                {pkgCfg.shortName}
                              </span>
                              <div className="flex flex-wrap gap-1">
                                {u.intent_just_browse && (
                                  <span className="text-[9.5px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-300">
                                    Navegar
                                  </span>
                                )}
                                {u.intent_choose_gender_region && (
                                  <span className="text-[9.5px] px-1.5 py-0.2 rounded bg-indigo-500/15 text-indigo-300">
                                    Região/Gênero
                                  </span>
                                )}
                                {u.intent_teach_classes && (
                                  <span
                                    className="text-[9.5px] px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-300"
                                    title={u.teach_description || 'Dar Aulas'}
                                  >
                                    Aulas
                                    {u.teach_subjects && u.teach_subjects.length > 0
                                      ? `: ${u.teach_subjects.map((s) => TEACH_SUBJECT_LABELS[s]).join(', ')}`
                                      : ''}
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>

                          <td className="py-3 px-4">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                                u.status === 'banned'
                                  ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                                  : u.status === 'online'
                                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                  : 'bg-zinc-800 text-zinc-400'
                              }`}
                            >
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${
                                  u.status === 'banned'
                                    ? 'bg-red-400'
                                    : u.status === 'online'
                                    ? 'bg-emerald-400'
                                    : 'bg-zinc-500'
                                }`}
                              />
                              {u.status === 'banned'
                                ? 'Banido'
                                : u.status === 'online'
                                ? 'Online'
                                : 'Offline'}
                            </span>
                          </td>

                          <td className="py-3 px-4">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase ${
                                isPaid
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                              }`}
                            >
                              <CreditCard className="w-3 h-3" />
                              {isPaid ? 'Pago' : 'Pendente'}
                            </span>
                          </td>

                          <td className="py-3 px-4 text-zinc-300">
                            <div>{u.country || 'Global'}</div>
                            <div className="text-[10px] text-zinc-500">
                              {getRegionLabel(inferRegionFromCountry(u.country, u.region))}
                            </div>
                          </td>

                          <td className="py-3 px-4 text-zinc-400 text-[11px]">
                            {new Date(u.created_at).toLocaleDateString()}
                          </td>

                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {/* Quick Toggle Payment Status */}
                              <button
                                onClick={() => handleTogglePaymentStatus(u)}
                                className={`p-1.5 rounded-lg transition cursor-pointer ${
                                  isPaid
                                    ? 'text-emerald-400 hover:bg-emerald-500/10'
                                    : 'text-amber-400 hover:bg-amber-500/10'
                                }`}
                                title={`Alterar pagamento (Atual: ${isPaid ? 'Pago' : 'Pendente'})`}
                              >
                                <CreditCard className="w-3.5 h-3.5" />
                              </button>

                              {/* Quick Open SPY on Online User */}
                              {u.role !== 'admin' && u.status === 'online' && (
                                <button
                                  onClick={() => {
                                    setFocusedSpyUserId(u.id);
                                    setAdminTab('spy');
                                  }}
                                  className="p-1.5 text-emerald-400 hover:text-white hover:bg-emerald-600/30 rounded-lg transition cursor-pointer"
                                  title="Monitorar transmissão ao vivo (SPY)"
                                >
                                  <Video className="w-3.5 h-3.5" />
                                </button>
                              )}

                              {/* View Details */}
                              <button
                                onClick={() => {
                                  setSelectedUser(u);
                                  setIsViewModalOpen(true);
                                }}
                                className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition cursor-pointer"
                                title="Visualizar Detalhes"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>

                              {/* Edit */}
                              <button
                                onClick={() => {
                                  setSelectedUser(u);
                                  setFormData({
                                    username: u.username,
                                    email: u.email,
                                    password: '',
                                    role: u.role,
                                    status: u.status,
                                    payment_status: u.payment_status === 'pago' ? 'pago' : 'pendente',
                                    access_package: u.access_package || 'pacote_01_gratuito',
                                    country: u.country || 'Brasil 🇧🇷',
                                    region: inferRegionFromCountry(u.country, u.region),
                                    gender: u.gender || 'unspecified',
                                    intent_just_browse: Boolean(u.intent_just_browse),
                                    intent_choose_gender_region: Boolean(u.intent_choose_gender_region),
                                    intent_teach_classes: Boolean(u.intent_teach_classes),
                                    teach_subjects: u.teach_subjects || [],
                                    teach_description: u.teach_description || '',
                                    bio: u.bio || '',
                                  });
                                  setIsEditModalOpen(true);
                                }}
                                className="p-1.5 text-zinc-400 hover:text-indigo-400 hover:bg-zinc-800 rounded-lg transition cursor-pointer"
                                title="Editar Usuário"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>

                              {/* Ban / Unban */}
                              <button
                                onClick={() => {
                                  setSelectedUser(u);
                                  setBanReasonInput(u.ban_reason || 'Violação das regras de conduta');
                                  setIsBanModalOpen(true);
                                }}
                                className={`p-1.5 rounded-lg transition cursor-pointer ${
                                  u.status === 'banned'
                                    ? 'text-emerald-400 hover:bg-emerald-500/10'
                                    : 'text-amber-400 hover:bg-amber-500/10'
                                }`}
                                title={u.status === 'banned' ? 'Desbanir Usuário' : 'Banir Usuário'}
                              >
                                <Ban className="w-3.5 h-3.5" />
                              </button>

                              {/* Delete */}
                              <button
                                onClick={() => handleDeleteUser(u.id, u.username)}
                                className="p-1.5 text-zinc-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition cursor-pointer"
                                title="Excluir Usuário"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="flex items-center justify-between p-3.5 bg-zinc-950/40 border-t border-zinc-800 text-xs text-zinc-400">
              <span>
                Página {page} de {totalPages}
              </span>
              <div className="flex items-center gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-white rounded-lg transition cursor-pointer"
                >
                  Anterior
                </button>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-white rounded-lg transition cursor-pointer"
                >
                  Próxima
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SPY LIVE MONITORING GRID */}
      {adminTab === 'spy' && (
        <div className="space-y-4">
          <div className="bg-zinc-900 border border-emerald-500/30 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30">
                <Radio className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-white">
                  Monitoramento Furtivo em Tempo Real (SPY — Áudio & Vídeo)
                </h3>
                <p className="text-xs text-zinc-400">
                  Miniaturas silenciosas das transmissões ativas de usuários online. Ative o som individualmente para ouvir ou clique para expandir.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {focusedSpyUserId && (
                <button
                  onClick={() => setFocusedSpyUserId(null)}
                  className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  Mostrar Todos
                </button>
              )}
              <button
                onClick={() => socket.emit('admin:spy_start')}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Recapturar Streams ({spyFeeds.length})</span>
              </button>
            </div>
          </div>

          {spyFeeds.length === 0 ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 text-center">
              <Video className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
              <h4 className="text-sm font-bold text-white mb-1">
                Nenhum usuário não-administrador online transmitindo no momento
              </h4>
              <p className="text-xs text-zinc-400 max-w-md mx-auto">
                Assim que qualquer usuário entrar na plataforma (Roleta ou Chamada Direta), sua miniatura ao vivo aparecerá automaticamente aqui.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {spyFeeds
                .filter((f) => !focusedSpyUserId || f.userId === focusedSpyUserId)
                .map((feed) => {
                  const isUnmuted = unmutedSockets.has(feed.socketId);
                  return (
                    <div
                      key={feed.socketId}
                      className="bg-zinc-900 border border-zinc-800 hover:border-emerald-500/50 rounded-2xl overflow-hidden shadow-xl flex flex-col transition"
                    >
                      {/* Thumbnail Video Stage */}
                      <div className="relative aspect-video bg-black flex items-center justify-center overflow-hidden">
                        {feed.stream ? (
                          <SpyVideoPlayer
                            stream={feed.stream}
                            muted={!isUnmuted}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="flex flex-col items-center justify-center text-zinc-500 p-4 text-center">
                            <Radio className="w-6 h-6 text-emerald-400 animate-spin mb-1.5" />
                            <span className="text-[11px] font-semibold text-zinc-300">
                              Capturando stream WebRTC...
                            </span>
                          </div>
                        )}

                        {/* Top Live Badge */}
                        <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-0.5 bg-black/80 backdrop-blur-md rounded-lg text-[10px] font-bold text-emerald-300 border border-emerald-500/30">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" />
                          <span>SPY LIVE</span>
                        </div>

                        {/* Activity Badge */}
                        <div className="absolute top-2 right-2 px-2 py-0.5 bg-black/80 backdrop-blur-md rounded-lg text-[10px] font-semibold text-indigo-300 border border-white/10">
                          {feed.activity}
                        </div>

                        {/* Bottom Audio & Expand Controls */}
                        <div className="absolute bottom-2 right-2 flex items-center gap-1.5">
                          <button
                            onClick={() => toggleSpyAudio(feed.socketId)}
                            className={`p-1.5 rounded-lg border backdrop-blur-md transition cursor-pointer ${
                              isUnmuted
                                ? 'bg-emerald-600/90 border-emerald-400 text-white'
                                : 'bg-black/75 border-white/10 text-zinc-300 hover:text-white'
                            }`}
                            title={isUnmuted ? 'Silenciar áudio deste usuário' : 'Ouvir áudio em tempo real'}
                          >
                            {isUnmuted ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                          </button>

                          <button
                            onClick={() => setExpandedSpySocketId(feed.socketId)}
                            className="p-1.5 bg-black/75 hover:bg-indigo-600 text-white rounded-lg border border-white/10 backdrop-blur-md transition cursor-pointer"
                            title="Expandir transmissão"
                          >
                            <Maximize2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Card Footer */}
                      <div className="p-3 flex items-center justify-between gap-2 bg-zinc-950/60 border-t border-zinc-800">
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-white truncate">{feed.username}</div>
                          <div className="font-mono text-[11px] text-emerald-400 font-semibold">
                            {feed.unique_code}
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => {
                              setSelectedUserIds([feed.userId]);
                              setAdminTab('users');
                            }}
                            className="p-1.5 bg-indigo-500/15 hover:bg-indigo-600 text-indigo-300 hover:text-white rounded-lg transition cursor-pointer"
                            title="Enviar mensagem no painel deste usuário"
                          >
                            <Megaphone className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              const found = users.find((x) => x.id === feed.userId);
                              if (found) {
                                setSelectedUser(found);
                                setBanReasonInput('Violação flagrada no monitoramento ao vivo');
                                setIsBanModalOpen(true);
                              } else {
                                handleToggleBan(
                                  {
                                    id: feed.userId,
                                    username: feed.username,
                                    unique_code: feed.unique_code,
                                    email: '',
                                    role: 'user',
                                    status: 'online',
                                    created_at: new Date().toISOString(),
                                  },
                                  'Violação flagrada no monitoramento ao vivo'
                                );
                              }
                            }}
                            className="p-1.5 bg-red-500/15 hover:bg-red-600 text-red-400 hover:text-white rounded-lg transition cursor-pointer"
                            title="Banir usuário imediatamente"
                          >
                            <Ban className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {adminTab === 'clients' && (
        /* Admin Client Leads Spreadsheet with Attendant Name, General/User Filters & PDF Export */
        <div className="space-y-4">
          <div className="bg-zinc-900 border border-indigo-500/30 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-500/20 text-indigo-400 rounded-xl border border-indigo-500/30">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-white">
                  Planilha Geral de Clientes Atendidos
                </h3>
                <p className="text-xs text-zinc-400">
                  Visualize todos os clientes recebidos pelo widget com o nome do usuário que atendeu, filtros gerais/por atendente e exportação em PDF.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className="px-2.5 py-1.5 bg-zinc-950 border border-zinc-800 rounded-xl text-[11px] font-bold text-zinc-300">
                Exibindo {filteredClientLeads.length} de {clientLeads.length}
              </span>
              <button
                type="button"
                onClick={handleExportClientsPdf}
                disabled={filteredClientLeads.length === 0}
                className="flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-rose-600/20 transition cursor-pointer disabled:cursor-not-allowed"
              >
                <Download className="w-4 h-4" />
                <span>Exportar PDF</span>
              </button>
            </div>
          </div>

          {/* General Client Filter + Filter by Attendant User */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-3.5 flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
                placeholder="Filtro geral: cliente, usuário que atendeu, WhatsApp, e-mail, mensagem ou identificação..."
                className="w-full pl-10 pr-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-white text-xs placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 bg-zinc-950 border border-zinc-800 rounded-xl px-2.5 py-1">
                <UserCheck className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <select
                  value={clientOwnerFilter}
                  onChange={(e) => setClientOwnerFilter(e.target.value)}
                  className="bg-transparent py-1.5 text-zinc-200 text-xs focus:outline-none cursor-pointer"
                  aria-label="Filtrar por usuário que atendeu"
                >
                  <option value="all" className="bg-zinc-900">
                    Todos os Usuários (Atendentes)
                  </option>
                  {clientAttendants.map((att) => (
                    <option key={att.id} value={att.id} className="bg-zinc-900">
                      {att.username} ({att.unique_code})
                    </option>
                  ))}
                </select>
              </div>

              <select
                value={clientStatusFilter}
                onChange={(e) => setClientStatusFilter(e.target.value)}
                className="px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-300 text-xs focus:outline-none focus:border-indigo-500 cursor-pointer"
                aria-label="Filtrar por status do cliente"
              >
                <option value="all">Todos Status</option>
                <option value="novo">Novo</option>
                <option value="em_atendimento">Em Atendimento</option>
                <option value="atendido">Atendido</option>
                <option value="retornar">Retornar</option>
              </select>

              <select
                value={clientReadFilter}
                onChange={(e) => setClientReadFilter(e.target.value)}
                className="px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-300 text-xs focus:outline-none focus:border-indigo-500 cursor-pointer"
                aria-label="Filtrar por leitura"
              >
                <option value="all">Lidos e Pendentes</option>
                <option value="pendente">Apenas Pendentes</option>
                <option value="lido">Apenas Lidos</option>
              </select>

              {(clientSearch ||
                clientOwnerFilter !== 'all' ||
                clientStatusFilter !== 'all' ||
                clientReadFilter !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setClientSearch('');
                    setClientOwnerFilter('all');
                    setClientStatusFilter('all');
                    setClientReadFilter('all');
                  }}
                  className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-semibold transition cursor-pointer"
                >
                  Limpar
                </button>
              )}
            </div>
          </div>

          {/* Clients Spreadsheet Table */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-950/60 text-zinc-400 uppercase font-bold border-b border-zinc-800">
                  <tr>
                    <th className="py-3.5 px-4">Identificação</th>
                    <th className="py-3.5 px-4">Usuário que Atendeu</th>
                    <th className="py-3.5 px-4">Nome do Cliente</th>
                    <th className="py-3.5 px-4">WhatsApp</th>
                    <th className="py-3.5 px-4">E-mail</th>
                    <th className="py-3.5 px-4">Mensagem Inicial</th>
                    <th className="py-3.5 px-4">Data de Entrada</th>
                    <th className="py-3.5 px-4">Leitura / Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {loadingClients ? (
                    <tr>
                      <td colSpan={8} className="text-center py-8 text-zinc-500">
                        Carregando lista de clientes...
                      </td>
                    </tr>
                  ) : filteredClientLeads.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-8 text-zinc-500">
                        Nenhum cliente encontrado com os filtros selecionados.
                      </td>
                    </tr>
                  ) : (
                    filteredClientLeads.map((lead) => (
                      <tr key={lead.id} className="hover:bg-zinc-800/40 transition">
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className="font-mono font-bold text-indigo-300 bg-indigo-500/15 px-2 py-0.5 rounded border border-indigo-500/30">
                            {lead.client_label}
                          </span>
                        </td>

                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="font-semibold text-white">
                            {lead.owner_name || 'Não identificado'}
                          </div>
                          <div className="font-mono text-[11px] text-emerald-400 font-bold">
                            {lead.owner_code}
                          </div>
                        </td>

                        <td className="py-3 px-4 font-semibold text-white whitespace-nowrap">
                          {lead.name}
                        </td>

                        <td className="py-3 px-4 font-mono text-emerald-300 whitespace-nowrap">
                          {lead.whatsapp}
                        </td>

                        <td className="py-3 px-4 text-zinc-300 whitespace-nowrap">
                          {lead.email || '-'}
                        </td>

                        <td className="py-3 px-4 text-zinc-300 max-w-xs">
                          <p className="line-clamp-2" title={lead.message}>
                            {lead.message || '-'}
                          </p>
                        </td>

                        <td className="py-3 px-4 text-zinc-400 text-[11px] whitespace-nowrap">
                          {lead.call_date
                            ? new Date(lead.call_date).toLocaleString('pt-BR')
                            : '-'}
                        </td>

                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="flex flex-col gap-1 items-start">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                lead.is_read
                                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                                  : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                              }`}
                            >
                              {lead.is_read ? 'Lido' : 'Pendente'}
                            </span>
                            <span className="text-[11px] text-zinc-400 font-medium">
                              {formatClientStatusLabel(lead.status)}
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {adminTab === 'reports' && (
        /* Reports & Moderation Tab */
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl p-4 md:p-6">
          <h3 className="text-base font-bold text-white mb-2">Relatórios de Denúncias dos Usuários</h3>
          <p className="text-xs text-zinc-400 mb-6">
            Denúncias enviadas em tempo real durante a Roleta ou Chamadas Diretas.
          </p>

          <div className="space-y-3">
            {reports.length === 0 ? (
              <div className="text-center py-8 text-zinc-500 text-xs">
                Nenhuma denúncia registrada no momento.
              </div>
            ) : (
              reports.map((rep) => (
                <div
                  key={rep.id}
                  className={`p-4 rounded-2xl border transition ${
                    rep.resolved
                      ? 'bg-zinc-950/40 border-zinc-800 opacity-60'
                      : 'bg-zinc-950 border-red-500/30'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-sm">
                          Denunciado: {rep.reported_name}
                        </span>
                        <span className="font-mono text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
                          {rep.reported_code}
                        </span>
                        {rep.resolved && (
                          <span className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded">
                            Resolvido
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-red-300 font-semibold mt-1">
                        Motivo: {rep.reason}
                      </p>
                      {rep.details && (
                        <p className="text-xs text-zinc-400 mt-0.5 italic">"{rep.details}"</p>
                      )}

                      <div className="text-[11px] text-zinc-500 mt-2">
                        Denunciante: {rep.reporter_name} • Data: {new Date(rep.created_at).toLocaleString()}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {!rep.resolved && (
                        <>
                          <button
                            onClick={() => {
                              const reportedUser = users.find((u) => u.id === rep.reported_id);
                              if (reportedUser) {
                                handleToggleBan(reportedUser, `Denúncia: ${rep.reason}`);
                              } else {
                                handleToggleBan(
                                  {
                                    id: rep.reported_id,
                                    username: rep.reported_name,
                                    unique_code: rep.reported_code,
                                    email: '',
                                    role: 'user',
                                    status: 'online',
                                    created_at: new Date().toISOString(),
                                  },
                                  `Denúncia: ${rep.reason}`
                                );
                              }
                            }}
                            className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                          >
                            <Ban className="w-3.5 h-3.5" />
                            <span>Banir Infrator</span>
                          </button>

                          <button
                            onClick={() => handleResolveReport(rep.id)}
                            className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-semibold transition cursor-pointer"
                          >
                            Resolver
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* --- MODALS --- */}

      {/* Expanded SPY Preview Modal */}
      {expandedFeed && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
          <div className="relative w-full max-w-3xl bg-zinc-900 border-2 border-emerald-500/40 rounded-3xl overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-5 py-3 bg-zinc-950 border-b border-zinc-800">
              <div className="flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
                <span className="font-bold text-white text-sm">{expandedFeed.username}</span>
                <span className="font-mono text-xs text-emerald-400 font-bold">
                  {expandedFeed.unique_code}
                </span>
                <span className="text-[11px] px-2 py-0.5 bg-indigo-500/20 text-indigo-300 rounded-md">
                  {expandedFeed.activity}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggleSpyAudio(expandedFeed.socketId)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
                    unmutedSockets.has(expandedFeed.socketId)
                      ? 'bg-emerald-600 text-white'
                      : 'bg-zinc-800 text-zinc-300'
                  }`}
                >
                  {unmutedSockets.has(expandedFeed.socketId) ? (
                    <>
                      <Volume2 className="w-3.5 h-3.5" /> Áudio Ativo
                    </>
                  ) : (
                    <>
                      <VolumeX className="w-3.5 h-3.5" /> Ouvir Áudio
                    </>
                  )}
                </button>
                <button
                  onClick={() => setExpandedSpySocketId(null)}
                  className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="aspect-video bg-black flex items-center justify-center">
              <SpyVideoPlayer
                stream={expandedFeed.stream}
                muted={!unmutedSockets.has(expandedFeed.socketId)}
                className="w-full h-full object-contain"
              />
            </div>
          </div>
        </div>
      )}

      {/* View User Modal */}
      {isViewModalOpen && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl">
            <button
              onClick={() => setIsViewModalOpen(false)}
              className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="text-center mb-4">
              <img
                src={resolveAvatarUrl(selectedUser.avatar, selectedUser.username)}
                alt={selectedUser.username}
                className="w-20 h-20 rounded-2xl mx-auto object-cover border-2 border-indigo-500 mb-2"
              />
              <h3 className="text-lg font-bold text-white">{selectedUser.username}</h3>
              <p className="font-mono text-emerald-400 font-bold">{selectedUser.unique_code}</p>
            </div>

            <div className="space-y-2.5 text-xs bg-zinc-950 p-4 rounded-xl border border-zinc-800">
              <div className="flex justify-between">
                <span className="text-zinc-500">ID do Sistema:</span>
                <span className="font-mono text-zinc-300">{selectedUser.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">E-mail:</span>
                <span className="text-zinc-300">{selectedUser.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Papel:</span>
                <span className="font-semibold text-white uppercase">{selectedUser.role}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Status:</span>
                <span className="font-semibold text-white">{selectedUser.status}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Status de Pagamento:</span>
                <span
                  className={`font-bold uppercase ${
                    selectedUser.payment_status === 'pago' ? 'text-emerald-400' : 'text-amber-400'
                  }`}
                >
                  {selectedUser.payment_status === 'pago' ? 'Pago' : 'Pendente'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Pacote Escolhido:</span>
                <span className="font-bold text-indigo-300">
                  {getPackageConfig(selectedUser.access_package).name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">País / Região:</span>
                <span className="text-zinc-300">
                  {selectedUser.country || 'Global'} ({getRegionLabel(inferRegionFromCountry(selectedUser.country, selectedUser.region))})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Gênero:</span>
                <span className="text-zinc-300">
                  {selectedUser.gender === 'male'
                    ? 'Masculino'
                    : selectedUser.gender === 'female'
                    ? 'Feminino'
                    : 'Não especificado'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Opções de Cadastro:</span>
                <span className="text-zinc-300 text-right">
                  {[
                    selectedUser.intent_just_browse ? 'Apenas Navegar' : null,
                    selectedUser.intent_choose_gender_region ? 'Escolher Gênero/Região' : null,
                    selectedUser.intent_teach_classes ? 'Dar Aulas' : null,
                  ]
                    .filter(Boolean)
                    .join(' • ') || 'Não informado'}
                </span>
              </div>
              {selectedUser.intent_teach_classes && (
                <div className="p-2 bg-emerald-950/30 border border-emerald-500/30 rounded text-emerald-200">
                  <div className="font-bold">
                    Matérias:{' '}
                    {selectedUser.teach_subjects && selectedUser.teach_subjects.length > 0
                      ? selectedUser.teach_subjects.map((s) => TEACH_SUBJECT_LABELS[s]).join(', ')
                      : 'Não especificadas'}
                  </div>
                  {selectedUser.teach_description && (
                    <div className="mt-1 text-zinc-300">{selectedUser.teach_description}</div>
                  )}
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-zinc-500">Criado em:</span>
                <span className="text-zinc-300">{new Date(selectedUser.created_at).toLocaleString()}</span>
              </div>
              {selectedUser.admin_message?.text && (
                <div className="p-2.5 bg-indigo-950/40 border border-indigo-500/30 rounded text-indigo-200 mt-2">
                  Mensagem ativa: {selectedUser.admin_message.text}
                </div>
              )}
              {selectedUser.ban_reason && (
                <div className="p-2 bg-red-950/40 border border-red-500/30 rounded text-red-300 mt-2">
                  Motivo do Ban: {selectedUser.ban_reason}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {isEditModalOpen && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl">
            <button
              onClick={() => setIsEditModalOpen(false)}
              className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-bold text-white mb-4">Editar Usuário</h3>

            <form onSubmit={handleSaveEdit} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 font-semibold mb-1">Nome de Usuário</label>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 font-semibold mb-1">E-mail</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-zinc-400 font-semibold mb-1">Papel</label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value as any })}
                    className="w-full px-2.5 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="user">Usuário</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>

                <div>
                  <label className="block text-zinc-400 font-semibold mb-1">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                    className="w-full px-2.5 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="online">Online</option>
                    <option value="offline">Offline</option>
                    <option value="banned">Banido</option>
                  </select>
                </div>

                <div>
                  <label className="block text-zinc-400 font-semibold mb-1">Pagamento</label>
                  <select
                    value={formData.payment_status}
                    onChange={(e) =>
                      setFormData({ ...formData, payment_status: e.target.value as PaymentStatus })
                    }
                    className="w-full px-2.5 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="pendente">Pendente</option>
                    <option value="pago">Pago</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-zinc-400 font-semibold mb-1">Pacote de Acesso</label>
                <select
                  value={formData.access_package}
                  onChange={(e) =>
                    setFormData({ ...formData, access_package: e.target.value as AccessPackageId })
                  }
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                >
                  {ACCESS_PACKAGE_LIST.map((pkg) => (
                    <option key={pkg.id} value={pkg.id}>
                      {pkg.name} ({pkg.priceLabel})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-zinc-400 font-semibold mb-1">País</label>
                  <input
                    type="text"
                    value={formData.country}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        country: e.target.value,
                        region: inferRegionFromCountry(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 font-semibold mb-1">Região</label>
                  <select
                    value={formData.region}
                    onChange={(e) =>
                      setFormData({ ...formData, region: e.target.value as WorldRegionId })
                    }
                    className="w-full px-2.5 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                  >
                    {WORLD_REGIONS.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-zinc-400 font-semibold mb-1">Gênero</label>
                  <select
                    value={formData.gender}
                    onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                    className="w-full px-2.5 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="unspecified">Não especificar</option>
                    <option value="male">Masculino</option>
                    <option value="female">Feminino</option>
                  </select>
                </div>
              </div>

              <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl space-y-2">
                <div className="font-semibold text-zinc-300">Opções de Cadastro</div>
                <div className="flex flex-wrap gap-3">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.intent_just_browse}
                      onChange={(e) =>
                        setFormData({ ...formData, intent_just_browse: e.target.checked })
                      }
                      className="accent-indigo-600"
                    />
                    <span>Apenas Navegar</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.intent_choose_gender_region}
                      onChange={(e) =>
                        setFormData({ ...formData, intent_choose_gender_region: e.target.checked })
                      }
                      className="accent-indigo-600"
                    />
                    <span>Escolher Gênero/Região</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.intent_teach_classes}
                      onChange={(e) =>
                        setFormData({ ...formData, intent_teach_classes: e.target.checked })
                      }
                      className="accent-emerald-600"
                    />
                    <span>Dar Aulas</span>
                  </label>
                </div>

                {formData.intent_teach_classes && (
                  <div className="space-y-2 pt-1.5 border-t border-zinc-800">
                    <div className="flex flex-wrap gap-3">
                      {(['idiomas', 'musica', 'outros'] as TeachSubject[]).map((subj) => (
                        <label key={subj} className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.teach_subjects.includes(subj)}
                            onChange={() =>
                              setFormData({
                                ...formData,
                                teach_subjects: formData.teach_subjects.includes(subj)
                                  ? formData.teach_subjects.filter((s) => s !== subj)
                                  : [...formData.teach_subjects, subj],
                              })
                            }
                            className="accent-emerald-600"
                          />
                          <span>{TEACH_SUBJECT_LABELS[subj]}</span>
                        </label>
                      ))}
                    </div>
                    <input
                      type="text"
                      value={formData.teach_description}
                      onChange={(e) =>
                        setFormData({ ...formData, teach_description: e.target.value })
                      }
                      placeholder="Descrição das aulas..."
                      className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-white"
                    />
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="flex-1 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl cursor-pointer"
                >
                  Salvar Alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create User Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl">
            <button
              onClick={() => setIsCreateModalOpen(false)}
              className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-bold text-white mb-4">Criar Novo Usuário</h3>

            <form onSubmit={handleCreateUser} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 font-semibold mb-1">Nome de Usuário</label>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    placeholder="Nome do usuário"
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 font-semibold mb-1">E-mail</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="email@exemplo.com"
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 font-semibold mb-1">Senha Inicial</label>
                  <input
                    type="text"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 font-semibold mb-1">Pacote de Acesso</label>
                  <select
                    value={formData.access_package}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        access_package: e.target.value as AccessPackageId,
                      })
                    }
                    className="w-full px-2.5 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                  >
                    {ACCESS_PACKAGE_LIST.map((pkg) => (
                      <option key={pkg.id} value={pkg.id}>
                        {pkg.shortName} ({pkg.priceLabel})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div>
                  <label className="block text-zinc-400 font-semibold mb-1">Papel</label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value as any })}
                    className="w-full px-2.5 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="user">Usuário</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>

                <div>
                  <label className="block text-zinc-400 font-semibold mb-1">Pagamento</label>
                  <select
                    value={formData.payment_status}
                    onChange={(e) =>
                      setFormData({ ...formData, payment_status: e.target.value as PaymentStatus })
                    }
                    className="w-full px-2.5 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="pendente">Pendente</option>
                    <option value="pago">Pago</option>
                  </select>
                </div>

                <div>
                  <label className="block text-zinc-400 font-semibold mb-1">País</label>
                  <input
                    type="text"
                    value={formData.country}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        country: e.target.value,
                        region: inferRegionFromCountry(e.target.value),
                      })
                    }
                    className="w-full px-2.5 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 font-semibold mb-1">Gênero</label>
                  <select
                    value={formData.gender}
                    onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                    className="w-full px-2.5 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="unspecified">Não esp.</option>
                    <option value="male">Masculino</option>
                    <option value="female">Feminino</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="flex-1 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl cursor-pointer"
                >
                  Cadastrar Usuário
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Ban / Unban Modal */}
      {isBanModalOpen && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="relative w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl">
            <button
              onClick={() => setIsBanModalOpen(false)}
              className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 bg-red-500/10 text-red-400 rounded-xl">
                <Ban className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-white text-base">
                  {selectedUser.status === 'banned' ? 'Desbanir Usuário' : 'Banir Usuário'}
                </h3>
                <p className="text-xs text-zinc-400">
                  {selectedUser.username} ({selectedUser.unique_code})
                </p>
              </div>
            </div>

            {selectedUser.status !== 'banned' ? (
              <div className="space-y-4 text-xs">
                <div>
                  <label className="block text-zinc-400 font-semibold mb-1">
                    Motivo do Banimento em Tempo Real
                  </label>
                  <textarea
                    value={banReasonInput}
                    onChange={(e) => setBanReasonInput(e.target.value)}
                    rows={3}
                    placeholder="ex: Violação das diretrizes de conduta..."
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-red-500"
                  />
                </div>
                <p className="text-[11px] text-zinc-400">
                  ⚠️ Ao banir, a conexão de vídeo e a sessão deste usuário serão canceladas imediatamente.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setIsBanModalOpen(false)}
                    className="flex-1 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => handleToggleBan(selectedUser, banReasonInput)}
                    className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl cursor-pointer"
                  >
                    Confirmar Ban
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4 text-xs">
                <p className="text-zinc-300">
                  Deseja restabelecer o acesso deste usuário à plataforma? Ele poderá voltar a fazer chamadas e entrar na roleta.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setIsBanModalOpen(false)}
                    className="flex-1 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => handleToggleBan(selectedUser, '')}
                    className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl cursor-pointer"
                  >
                    Confirmar Desban
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
