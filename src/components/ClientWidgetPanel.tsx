import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useAuth } from '../context/AuthContext.tsx';
import { ClientLead, ClientLeadStatus } from '../types/index.ts';
import { localDb } from '../services/localDatabase.ts';
import { socketService } from '../services/socket.ts';
import {
  Code2,
  Copy,
  Check,
  ExternalLink,
  MessageSquare,
  Phone,
  Plus,
  Search,
  Edit2,
  Trash2,
  Eye,
  X,
  Send,
  PanelBottom,
  Calendar,
  Mail,
  UserCheck,
  Headphones,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Download,
} from 'lucide-react';

interface ClientWidgetPanelProps {
  onStartClientPreviewCall: (payload: {
    lead: ClientLead;
  }) => void;
  onOpenAuth: () => void;
}

const ACCENT_PRESETS = [
  { label: 'Esmeralda', value: '#10b981' },
  { label: 'Azul', value: '#2563eb' },
  { label: 'Índigo', value: '#4f46e5' },
  { label: 'Âmbar', value: '#d97706' },
  { label: 'Rosa', value: '#e11d48' },
];

const STATUS_META: Record<ClientLeadStatus, { label: string; textClass: string }> = {
  novo: { label: 'Novo', textClass: 'text-amber-400' },
  em_atendimento: { label: 'Em Atendimento', textClass: 'text-indigo-400' },
  atendido: { label: 'Atendido', textClass: 'text-emerald-400' },
  retornar: { label: 'Retornar', textClass: 'text-rose-400' },
};

function sanitizeWhatsappDigits(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  return digits.startsWith('55') || digits.length > 11 ? digits : `55${digits}`;
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export const ClientWidgetPanel: React.FC<ClientWidgetPanelProps> = ({
  onStartClientPreviewCall,
  onOpenAuth,
}) => {
  const { user, token } = useAuth();
  const socket = socketService.getSocket();

  const [activeSection, setActiveSection] = useState<'embed' | 'crm'>('embed');
  const [isSocketConnected, setIsSocketConnected] = useState<boolean>(socket.connected);

  // Widget Builder Configuration
  const [position, setPosition] = useState<'left' | 'right'>('left');
  const [accentColor, setAccentColor] = useState<string>('#10b981');
  const [widgetTitle, setWidgetTitle] = useState<string>('Atendimento Online');
  const [widgetSubtitle, setWidgetSubtitle] = useState<string>(
    'Preencha seus dados para falar por áudio agora mesmo'
  );
  const [buttonText, setButtonText] = useState<string>('Atendimento');
  const [codeFormat, setCodeFormat] = useState<'script' | 'html'>('script');
  const [copiedCode, setCopiedCode] = useState<boolean>(false);

  // Live Preview Widget State inside the builder
  const [previewOpen, setPreviewOpen] = useState<boolean>(true);
  const [previewName, setPreviewName] = useState<string>('');
  const [previewWhatsapp, setPreviewWhatsapp] = useState<string>('');
  const [previewEmail, setPreviewEmail] = useState<string>('');
  const [previewMessage, setPreviewMessage] = useState<string>('');
  const [previewSending, setPreviewSending] = useState<boolean>(false);
  const [previewFeedback, setPreviewFeedback] = useState<string | null>(null);

  // Client Leads CRUD State
  const [leads, setLeads] = useState<ClientLead[]>([]);
  const [loadingLeads, setLoadingLeads] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pendente' | 'lido' | ClientLeadStatus>('all');
  const [feedbackBanner, setFeedbackBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Modals for CRUD
  const [viewingLead, setViewingLead] = useState<ClientLead | null>(null);
  const [editingLead, setEditingLead] = useState<ClientLead | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState<boolean>(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const [formState, setFormState] = useState<{
    client_label: string;
    name: string;
    whatsapp: string;
    email: string;
    message: string;
    call_date: string;
    status: ClientLeadStatus;
    is_read: boolean;
    notes: string;
  }>({
    client_label: '',
    name: '',
    whatsapp: '',
    email: '',
    message: '',
    call_date: '',
    status: 'novo',
    is_read: false,
    notes: '',
  });

  const ownerCode = user?.unique_code || '#CR-849201';
  const rawOrigin =
    typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const isDevProxy =
    typeof window !== 'undefined' && window.location.hostname.startsWith('ais-dev-');
  const suggestedPublicOrigin = isDevProxy
    ? rawOrigin.replace('://ais-dev-', '://ais-pre-')
    : rawOrigin;
  const [usePublicOrigin, setUsePublicOrigin] = useState<boolean>(isDevProxy);
  const appOrigin = usePublicOrigin ? suggestedPublicOrigin : rawOrigin;

  const demoUrl = useMemo(() => {
    const qs = new URLSearchParams({
      code: ownerCode,
      position,
      accent: accentColor,
      title: widgetTitle,
      buttonText,
    });
    return `${rawOrigin}/widget-demo?${qs.toString()}`;
  }, [rawOrigin, ownerCode, position, accentColor, widgetTitle, buttonText]);

  const embedSnippetScript = useMemo(() => {
    return `<!-- Botão Flutuante de Atendimento (${position === 'left' ? 'Canto Inferior Esquerdo' : 'Canto Inferior Direito'}) -->
<script
  src="${appOrigin}/widget.js"
  data-code="${ownerCode}"
  data-position="${position}"
  data-accent="${accentColor}"
  data-title="${widgetTitle.replace(/"/g, '&quot;')}"
  data-subtitle="${widgetSubtitle.replace(/"/g, '&quot;')}"
  data-button-text="${buttonText.replace(/"/g, '&quot;')}"
  defer
></script>`;
  }, [appOrigin, ownerCode, position, accentColor, widgetTitle, widgetSubtitle, buttonText]);

  const embedSnippetFullHtml = useMemo(() => {
    return `<!-- Cole este código HTML + JavaScript antes de </body> em qualquer página web -->
<script>
  window.ChatRouletteWidgetConfig = {
    origin: ${JSON.stringify(appOrigin)},
    code: ${JSON.stringify(ownerCode)},
    position: ${JSON.stringify(position)},
    accent: ${JSON.stringify(accentColor)},
    title: ${JSON.stringify(widgetTitle)},
    subtitle: ${JSON.stringify(widgetSubtitle)},
    buttonText: ${JSON.stringify(buttonText)}
  };
  (function() {
    var s = document.createElement('script');
    s.src = ${JSON.stringify(appOrigin + '/widget.js')};
    s.async = true;
    document.body.appendChild(s);
  })();
</script>
<noscript>Ative o JavaScript para utilizar o atendimento online.</noscript>`;
  }, [appOrigin, ownerCode, position, accentColor, widgetTitle, widgetSubtitle, buttonText]);

  const activeSnippet = codeFormat === 'script' ? embedSnippetScript : embedSnippetFullHtml;

  const fetchLeads = useCallback(async () => {
    if (!user) {
      setLeads([]);
      setLoadingLeads(false);
      return;
    }
    setLoadingLeads(true);
    try {
      const res = await fetch('/api/clients', {
        headers: { Authorization: `Bearer ${token || user.id}` },
      });
      const contentType = res.headers.get('content-type');
      if (res.ok && contentType && contentType.includes('application/json')) {
        const data = await res.json();
        setLeads(data.leads || []);
        setLoadingLeads(false);
        return;
      }
    } catch {
      // Fallback to localStorage below
    }
    const fallbackLeads =
      user.role === 'admin'
        ? localDb.getClientLeads()
        : localDb.getClientLeads(user.id);
    setLeads(fallbackLeads);
    setLoadingLeads(false);
  }, [user, token]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  // Listen to real-time lead creations/updates pushed from embedded website widgets
  useEffect(() => {
    const onLeadCreated = (data: { lead: ClientLead }) => {
      if (!data?.lead) return;
      setLeads((prev) => {
        if (prev.some((l) => l.id === data.lead.id)) return prev;
        return [data.lead, ...prev];
      });
    };

    const onLeadUpdated = (data: { lead: ClientLead }) => {
      if (!data?.lead) return;
      setLeads((prev) =>
        prev.map((l) => (l.id === data.lead.id ? data.lead : l))
      );
    };

    const onConnect = () => setIsSocketConnected(true);
    const onDisconnect = () => setIsSocketConnected(false);
    setIsSocketConnected(socket.connected);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('client:lead_created', onLeadCreated);
    socket.on('client:lead_updated', onLeadUpdated);
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('client:lead_created', onLeadCreated);
      socket.off('client:lead_updated', onLeadUpdated);
    };
  }, [socket]);

  const showNotice = (type: 'success' | 'error', text: string) => {
    setFeedbackBanner({ type, text });
    setTimeout(() => setFeedbackBanner(null), 4000);
  };

  const handleCopySnippet = () => {
    navigator.clipboard.writeText(activeSnippet);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // Live Interactive Preview Form Submit: saves lead + triggers real incoming audio call ("Cliente On Line 02")
  const handlePreviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      onOpenAuth();
      return;
    }
    if (!previewName.trim() || !previewWhatsapp.trim() || !previewEmail.trim() || !previewMessage.trim()) {
      return;
    }

    setPreviewSending(true);
    setPreviewFeedback(null);

    let createdLead: ClientLead | null = null;
    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token || user.id}`,
        },
        body: JSON.stringify({
          name: previewName.trim(),
          whatsapp: previewWhatsapp.trim(),
          email: previewEmail.trim(),
          message: previewMessage.trim(),
          status: 'novo',
        }),
      });
      const ct = res.headers.get('content-type');
      if (res.ok && ct && ct.includes('application/json')) {
        const data = await res.json();
        createdLead = data.lead;
      }
    } catch {
      // Fallback below
    }

    if (!createdLead) {
      createdLead = localDb.createClientLead({
        owner_id: user.id,
        owner_code: user.unique_code,
        name: previewName.trim(),
        whatsapp: previewWhatsapp.trim(),
        email: previewEmail.trim(),
        message: previewMessage.trim(),
        status: 'novo',
      });
    }

    setLeads((prev) => [createdLead!, ...prev.filter((l) => l.id !== createdLead!.id)]);
    setPreviewSending(false);
    setPreviewFeedback(`Chamada de áudio disparada como ${createdLead.client_label}!`);
    setPreviewName('');
    setPreviewWhatsapp('');
    setPreviewEmail('');
    setPreviewMessage('');

    onStartClientPreviewCall({ lead: createdLead });
  };

  const openCreateModal = () => {
    setFormState({
      client_label: '',
      name: '',
      whatsapp: '',
      email: '',
      message: '',
      call_date: new Date().toISOString().slice(0, 16),
      status: 'novo',
      is_read: false,
      notes: '',
    });
    setIsCreateOpen(true);
  };

  const openEditModal = (lead: ClientLead) => {
    setEditingLead(lead);
    setFormState({
      client_label: lead.client_label,
      name: lead.name,
      whatsapp: lead.whatsapp,
      email: lead.email,
      message: lead.message,
      call_date: new Date(lead.call_date).toISOString().slice(0, 16),
      status: lead.status,
      is_read: Boolean(lead.is_read),
      notes: lead.notes || '',
    });
  };

  const handleSaveCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const isoDate = formState.call_date
      ? new Date(formState.call_date).toISOString()
      : new Date().toISOString();

    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token || user.id}`,
        },
        body: JSON.stringify({
          ...formState,
          call_date: isoDate,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setLeads((prev) => [data.lead, ...prev]);
        setIsCreateOpen(false);
        showNotice('success', 'Cliente cadastrado com sucesso.');
        return;
      }
    } catch {
      // Fallback
    }

    const created = localDb.createClientLead({
      owner_id: user.id,
      owner_code: user.unique_code,
      client_label: formState.client_label || undefined,
      name: formState.name,
      whatsapp: formState.whatsapp,
      email: formState.email,
      message: formState.message,
      call_date: isoDate,
      status: formState.status,
      notes: formState.notes,
    });
    setLeads((prev) => [created, ...prev]);
    setIsCreateOpen(false);
    showNotice('success', 'Cliente cadastrado localmente.');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !editingLead) return;
    const isoDate = formState.call_date
      ? new Date(formState.call_date).toISOString()
      : editingLead.call_date;

    try {
      const res = await fetch(`/api/clients/${editingLead.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token || user.id}`,
        },
        body: JSON.stringify({
          ...formState,
          call_date: isoDate,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setLeads((prev) => prev.map((l) => (l.id === editingLead.id ? data.lead : l)));
        setEditingLead(null);
        showNotice('success', 'Registro do cliente atualizado.');
        return;
      }
    } catch {
      // Fallback
    }

    const updated = localDb.updateClientLead(editingLead.id, {
      ...formState,
      call_date: isoDate,
    });
    if (updated) {
      setLeads((prev) => prev.map((l) => (l.id === editingLead.id ? updated : l)));
    }
    setEditingLead(null);
    showNotice('success', 'Registro atualizado.');
  };

  const handleQuickStatusChange = async (lead: ClientLead, nextStatus: ClientLeadStatus) => {
    if (!user) return;
    setLeads((prev) =>
      prev.map((l) => (l.id === lead.id ? { ...l, status: nextStatus } : l))
    );
    try {
      await fetch(`/api/clients/${lead.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token || user.id}`,
        },
        body: JSON.stringify({ status: nextStatus }),
      });
    } catch {
      localDb.updateClientLead(lead.id, { status: nextStatus });
    }
  };

  const handleToggleRead = async (lead: ClientLead) => {
    if (!user) return;
    const nextRead = !lead.is_read;
    setLeads((prev) =>
      prev.map((l) => (l.id === lead.id ? { ...l, is_read: nextRead } : l))
    );
    try {
      const res = await fetch(`/api/clients/${lead.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token || user.id}`,
        },
        body: JSON.stringify({ is_read: nextRead }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.lead) {
          setLeads((prev) => prev.map((l) => (l.id === lead.id ? data.lead : l)));
        }
      }
    } catch {
      localDb.updateClientLead(lead.id, { is_read: nextRead });
    }
    showNotice('success', nextRead ? 'Cliente marcado como Lido.' : 'Cliente marcado como Pendente.');
  };

  const handleDeleteLead = async (id: string) => {
    if (!user) return;
    try {
      const res = await fetch(`/api/clients/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token || user.id}` },
      });
      if (res.ok) {
        setLeads((prev) => prev.filter((l) => l.id !== id));
        setDeleteConfirmId(null);
        showNotice('success', 'Registro excluído com sucesso.');
        return;
      }
    } catch {
      // Fallback
    }
    localDb.deleteClientLead(id);
    setLeads((prev) => prev.filter((l) => l.id !== id));
    setDeleteConfirmId(null);
    showNotice('success', 'Registro excluído.');
  };

  const filteredLeads = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return leads.filter((l) => {
      let matchStatus = true;
      if (statusFilter === 'pendente') matchStatus = !l.is_read;
      else if (statusFilter === 'lido') matchStatus = Boolean(l.is_read);
      else if (statusFilter !== 'all') matchStatus = l.status === statusFilter;
      if (!matchStatus) return false;
      if (!q) return true;
      return (
        l.name.toLowerCase().includes(q) ||
        l.whatsapp.toLowerCase().includes(q) ||
        l.email.toLowerCase().includes(q) ||
        l.message.toLowerCase().includes(q) ||
        l.client_label.toLowerCase().includes(q) ||
        (l.owner_name || '').toLowerCase().includes(q) ||
        (l.owner_code || '').toLowerCase().includes(q)
      );
    });
  }, [leads, searchQuery, statusFilter]);

  const counts = useMemo(() => {
    return {
      total: leads.length,
      pendente: leads.filter((l) => !l.is_read).length,
      lido: leads.filter((l) => Boolean(l.is_read)).length,
      atendido: leads.filter((l) => l.status === 'atendido').length,
    };
  }, [leads]);

  const handleExportPdf = () => {
    if (filteredLeads.length === 0) {
      showNotice('error', 'Não há atendimentos filtrados para exportar.');
      return;
    }

    try {
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const nowStr = new Date().toLocaleString('pt-BR');

      doc.setFontSize(15);
      doc.setTextColor(15, 23, 42);
      doc.text('Relatório de Atendimentos de Clientes — ChatRouletteP2P', 14, 15);

      doc.setFontSize(9);
      doc.setTextColor(71, 85, 105);
      const filterLabelMap: Record<string, string> = {
        all: 'Todos',
        pendente: 'Pendentes',
        lido: 'Lidos',
        novo: 'Novos',
        em_atendimento: 'Em Atendimento',
        atendido: 'Atendidos',
        retornar: 'Retornar',
      };
      const activeFilters = [
        `Filtro: ${filterLabelMap[statusFilter] || statusFilter}`,
        searchQuery.trim() ? `Busca: "${searchQuery.trim()}"` : null,
      ]
        .filter(Boolean)
        .join('   |   ');

      doc.text(
        `Gerado em: ${nowStr}   |   Total listado: ${filteredLeads.length} registro(s)   |   ${activeFilters}`,
        14,
        22
      );

      const tableRows = filteredLeads.map((lead) => [
        lead.client_label || '-',
        `${lead.owner_name || user?.username || 'Atendente'}\n(${lead.owner_code || ownerCode})`,
        lead.name || '-',
        lead.whatsapp || '-',
        lead.email || '-',
        lead.message || '-',
        lead.call_date ? formatDateTime(lead.call_date) : '-',
        lead.is_read ? 'Lido' : 'Pendente',
        STATUS_META[lead.status]?.label || lead.status,
      ]);

      autoTable(doc, {
        startY: 27,
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
          fillColor: [16, 185, 129],
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
      doc.save(`atendimentos-clientes-${fileDate}.pdf`);
      showNotice('success', 'Relatório de atendimentos exportado em PDF!');
    } catch (err) {
      console.error('Erro ao exportar PDF de atendimentos:', err);
      showNotice('error', 'Não foi possível gerar o arquivo PDF.');
    }
  };

  if (!user) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 bg-zinc-950">
        <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center">
          <Headphones className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-white mb-2">Painel de Atendimento Web</h2>
          <p className="text-xs text-zinc-400 mb-6 leading-relaxed">
            Entre na sua conta ou selecione uma conta demo para gerar o botão flutuante do seu site e gerenciar os clientes atendidos.
          </p>
          <button
            onClick={onOpenAuth}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl text-xs transition cursor-pointer"
          >
            Entrar / Escolher Conta
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-zinc-950 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Top Workspace Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-zinc-800">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Central de Atendimento Web e Clientes
            </h1>
            <p className="text-xs text-zinc-400 mt-1">
              Incorpore o botão flutuante em qualquer página web, receba chamadas de áudio ao vivo e gerencie cada cliente.
            </p>
          </div>

          <div className="flex items-center gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-xl self-start md:self-auto">
            <button
              type="button"
              onClick={() => setActiveSection('embed')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition whitespace-nowrap shrink-0 cursor-pointer ${
                activeSection === 'embed'
                  ? 'bg-emerald-600 text-white'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Code2 className="w-4 h-4" />
              <span>Botão Incorporável (HTML/JS)</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('crm')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition whitespace-nowrap shrink-0 cursor-pointer ${
                activeSection === 'crm'
                  ? 'bg-emerald-600 text-white'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <UserCheck className="w-4 h-4" />
              <span className="tabular-nums">Gestão de Clientes ({leads.length})</span>
            </button>
          </div>
        </div>

        {feedbackBanner && (
          <div
            className={`px-4 py-3 rounded-xl border text-xs font-medium flex items-center justify-between ${
              feedbackBanner.type === 'success'
                ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                : 'bg-red-950/40 border-red-500/40 text-red-300'
            }`}
          >
            <span>{feedbackBanner.text}</span>
            <button onClick={() => setFeedbackBanner(null)} className="text-zinc-400 hover:text-white cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* SECTION 1: EMBEDDABLE FLOATING WIDGET BUILDER + LIVE INTERACTIVE PREVIEW */}
        {activeSection === 'embed' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {/* Left Column: Config + Copyable HTML/JS Code */}
            <div className="lg:col-span-6 bg-zinc-900 border border-zinc-800 rounded-2xl p-6 flex flex-col gap-5">
              <div>
                <h2 className="text-base font-bold text-white">01. Configurar Botão Flutuante</h2>
                <p className="text-xs text-zinc-400 mt-1">
                  Personalize o posicionamento na página de destino e copie o código para incorporar em qualquer site.
                </p>
              </div>

              {/* Position Selector: Left vs Right */}
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-2">
                  Posição do Botão na Página
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setPosition('left')}
                    className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                      position === 'left'
                        ? 'bg-emerald-500/15 border-emerald-500 text-emerald-300'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white'
                    }`}
                  >
                    <PanelBottom className="w-4 h-4" />
                    <span>Canto Inferior Esquerdo</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPosition('right')}
                    className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                      position === 'right'
                        ? 'bg-emerald-500/15 border-emerald-500 text-emerald-300'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white'
                    }`}
                  >
                    <PanelBottom className="w-4 h-4" />
                    <span>Canto Inferior Direito</span>
                  </button>
                </div>
              </div>

              {/* Labels & Accent */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
                <div>
                  <label className="block text-zinc-400 font-semibold mb-1">Título da Janela</label>
                  <input
                    type="text"
                    value={widgetTitle}
                    onChange={(e) => setWidgetTitle(e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 font-semibold mb-1">Texto do Botão</label>
                  <input
                    type="text"
                    value={buttonText}
                    onChange={(e) => setButtonText(e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3.5 text-xs items-end">
                <div className="sm:col-span-8">
                  <label className="block text-zinc-400 font-semibold mb-1">Subtítulo do Formulário</label>
                  <input
                    type="text"
                    value={widgetSubtitle}
                    onChange={(e) => setWidgetSubtitle(e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div className="sm:col-span-4">
                  <label className="block text-zinc-400 font-semibold mb-1">Cor do Botão</label>
                  <div className="flex items-center gap-1.5">
                    {ACCENT_PRESETS.map((preset) => (
                      <button
                        key={preset.value}
                        type="button"
                        onClick={() => setAccentColor(preset.value)}
                        title={preset.label}
                        style={{ backgroundColor: preset.value }}
                        className={`w-6 h-6 rounded-lg border-2 transition cursor-pointer ${
                          accentColor === preset.value ? 'border-white scale-110' : 'border-transparent opacity-75 hover:opacity-100'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Code Format Switch + Copyable Snippet */}
              <div className="pt-2 border-t border-zinc-800 flex flex-col gap-2.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1 p-1 bg-zinc-950 border border-zinc-800 rounded-lg text-xs">
                    <button
                      type="button"
                      onClick={() => setCodeFormat('script')}
                      className={`px-3 py-1 rounded-md font-semibold transition cursor-pointer ${
                        codeFormat === 'script' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      Script 1 Linha (JS)
                    </button>
                    <button
                      type="button"
                      onClick={() => setCodeFormat('html')}
                      className={`px-3 py-1 rounded-md font-semibold transition cursor-pointer ${
                        codeFormat === 'html' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      HTML + JS Completo
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <a
                      href={demoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-semibold transition"
                    >
                      <span>Testar em Página Externa</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                    <button
                      type="button"
                      onClick={handleCopySnippet}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition cursor-pointer"
                    >
                      {copiedCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedCode ? 'Copiado!' : 'Copiar Código'}</span>
                    </button>
                  </div>
                </div>

                {isDevProxy && (
                  <div className="flex items-center justify-between gap-2 px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-[11px]">
                    <span className="text-zinc-400">
                      {usePublicOrigin
                        ? 'Usando URL pública compartilhada para funcionar em sites externos.'
                        : 'Usando URL local de pré-visualização.'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setUsePublicOrigin((v) => !v)}
                      className="text-emerald-400 hover:text-emerald-300 font-semibold whitespace-nowrap cursor-pointer"
                    >
                      {usePublicOrigin ? 'Usar URL Atual' : 'Usar URL Pública'}
                    </button>
                  </div>
                )}

                <pre className="bg-zinc-950 border border-zinc-800 rounded-xl p-3.5 text-[11px] font-mono text-emerald-300 overflow-x-auto max-h-56 leading-relaxed select-all">
                  {activeSnippet}
                </pre>

                <p className="text-[11px] text-zinc-400">
                  Destino das chamadas configurado para o seu código <span className="font-mono text-emerald-400 font-bold">{ownerCode}</span> ({isSocketConnected ? 'Receptor Online' : 'Conectando receptor...'}). Ao preencher o formulário no site, o cliente dispara uma chamada de áudio identificada sequencialmente (ex: Cliente On Line 02).
                </p>
              </div>
            </div>

            {/* Right Column: Live Interactive Site Preview Canvas */}
            <div className="lg:col-span-6 bg-zinc-900 border border-zinc-800 rounded-2xl p-6 flex flex-col">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-base font-bold text-white">02. Simulação ao Vivo no Site</h2>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Teste o botão flutuante e envie o formulário para disparar a chamada de áudio imediatamente.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewOpen((v) => !v)}
                  className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap shrink-0"
                >
                  {previewOpen ? 'Minimizar Card' : 'Abrir Formulário'}
                </button>
              </div>

              {/* Simulated Webpage Frame */}
              <div className="relative flex-1 min-h-[500px] bg-slate-100 rounded-xl border border-zinc-700 overflow-hidden flex flex-col justify-between p-6 text-slate-900">
                {/* Mock Website Content */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                    <span className="font-bold text-sm text-slate-900">suaempresa.com.br</span>
                    <span className="text-xs text-slate-500">Início · Planos · Contato</span>
                  </div>
                  <div className="max-w-sm space-y-2 pt-2">
                    <h3 className="text-lg font-extrabold text-slate-900 leading-snug">
                      Atendimento instantâneo direto da sua página web
                    </h3>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      O visitante clica no botão flutuante no{' '}
                      <strong>
                        {position === 'left' ? 'canto inferior esquerdo' : 'canto inferior direito'}
                      </strong>
                      , informa Nome, WhatsApp, E-mail e Mensagem e entra em chamada de áudio com você.
                    </p>
                  </div>
                </div>

                {/* Floating Widget Preview anchored Bottom-Left OR Bottom-Right */}
                <div
                  className={`relative z-10 flex flex-col gap-3 mt-4 ${
                    position === 'right' ? 'items-end' : 'items-start'
                  }`}
                >
                  {previewOpen && (
                    <div className="w-full max-w-[330px] bg-slate-900 text-white border border-slate-700 rounded-2xl overflow-hidden shadow-2xl">
                      <div
                        className="px-4 py-3.5 border-b border-slate-800 flex items-start justify-between gap-2"
                        style={{
                          background: `linear-gradient(135deg, ${accentColor}33, #0f172a)`,
                        }}
                      >
                        <div>
                          <div className="text-sm font-bold text-white">{widgetTitle}</div>
                          <div className="text-[11px] text-slate-300 mt-0.5">{widgetSubtitle}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setPreviewOpen(false)}
                          className="p-1 text-slate-400 hover:text-white rounded-lg cursor-pointer"
                          title="Fechar formulário"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <form onSubmit={handlePreviewSubmit} className="p-4 space-y-2.5 text-xs">
                        {previewFeedback && (
                          <div className="p-2.5 bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 rounded-lg text-[11px] font-medium">
                            {previewFeedback}
                          </div>
                        )}
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                            Nome
                          </label>
                          <input
                            type="text"
                            required
                            value={previewName}
                            onChange={(e) => setPreviewName(e.target.value)}
                            placeholder="Ex: Carlos Eduardo"
                            className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                            WhatsApp
                          </label>
                          <input
                            type="tel"
                            required
                            value={previewWhatsapp}
                            onChange={(e) => setPreviewWhatsapp(e.target.value)}
                            placeholder="(11) 98888-7777"
                            className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                            E-mail
                          </label>
                          <input
                            type="email"
                            required
                            value={previewEmail}
                            onChange={(e) => setPreviewEmail(e.target.value)}
                            placeholder="carlos@empresa.com"
                            className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                            Mensagem
                          </label>
                          <textarea
                            rows={2}
                            required
                            value={previewMessage}
                            onChange={(e) => setPreviewMessage(e.target.value)}
                            placeholder="Olá, gostaria de falar com um atendente..."
                            className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 resize-none"
                          />
                        </div>
                        <button
                          type="submit"
                          disabled={previewSending}
                          style={{ backgroundColor: accentColor }}
                          className="w-full py-2.5 px-4 rounded-xl text-slate-950 font-extrabold text-xs flex items-center justify-center gap-2 transition hover:brightness-110 cursor-pointer disabled:opacity-60"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>{previewSending ? 'Chamando...' : 'Enviar e Iniciar Chamada de Áudio'}</span>
                        </button>
                      </form>
                    </div>
                  )}

                  {/* Floating Action Button */}
                  <button
                    type="button"
                    onClick={() => setPreviewOpen((v) => !v)}
                    style={{ backgroundColor: accentColor }}
                    className="inline-flex items-center gap-2.5 px-4 py-3 rounded-full text-slate-950 font-extrabold text-xs shadow-xl transition transform hover:-translate-y-0.5 cursor-pointer"
                  >
                    <Phone className="w-4 h-4" />
                    <span>{buttonText}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SECTION 2: CLIENT LEADS CRUD & ATTENDANCE MANAGEMENT */}
        {activeSection === 'crm' && (
          <div className="space-y-5">
            {/* Summary Metrics Strip */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <div className="text-xs text-zinc-400 font-medium">Total de Clientes</div>
                <div className="text-2xl font-bold text-white mt-1 tabular-nums">{counts.total}</div>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <div className="text-xs text-zinc-400 font-medium">Pendentes (Não Lidos)</div>
                <div className="text-2xl font-bold text-amber-400 mt-1 tabular-nums">{counts.pendente}</div>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <div className="text-xs text-zinc-400 font-medium">Lidos</div>
                <div className="text-2xl font-bold text-emerald-400 mt-1 tabular-nums">{counts.lido}</div>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <div className="text-xs text-zinc-400 font-medium">Atendidos</div>
                <div className="text-2xl font-bold text-indigo-400 mt-1 tabular-nums">{counts.atendido}</div>
              </div>
            </div>

            {/* Toolbar: Search + Status Filter + New Client */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-1">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Buscar por cliente, usuário que atendeu, WhatsApp, e-mail ou código..."
                    className="w-full pl-9 pr-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="flex items-center gap-1 p-1 bg-zinc-950 border border-zinc-800 rounded-xl text-xs overflow-x-auto">
                  {(
                    [
                      { id: 'all', label: 'Todos' },
                      { id: 'pendente', label: 'Pendentes' },
                      { id: 'lido', label: 'Lidos' },
                      { id: 'novo', label: 'Novos' },
                      { id: 'em_atendimento', label: 'Em Atendimento' },
                      { id: 'atendido', label: 'Atendidos' },
                      { id: 'retornar', label: 'Retornar' },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setStatusFilter(tab.id)}
                      className={`px-3 py-1.5 rounded-lg font-semibold whitespace-nowrap shrink-0 transition cursor-pointer ${
                        statusFilter === tab.id
                          ? 'bg-zinc-800 text-white'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleExportPdf}
                  disabled={filteredLeads.length === 0}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white rounded-xl text-xs font-bold transition whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed"
                >
                  <Download className="w-4 h-4" />
                  <span>Exportar PDF</span>
                </button>
                <button
                  type="button"
                  onClick={openCreateModal}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Novo Cliente</span>
                </button>
              </div>
            </div>

            {/* Client Leads Data Table */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-950/70 text-zinc-400 font-semibold border-b border-zinc-800">
                    <tr>
                      <th className="py-3.5 px-4">Identificação</th>
                      <th className="py-3.5 px-4">Usuário que Atendeu</th>
                      <th className="py-3.5 px-4">Nome</th>
                      <th className="py-3.5 px-4">WhatsApp</th>
                      <th className="py-3.5 px-4">E-mail</th>
                      <th className="py-3.5 px-4">Mensagem Inicial</th>
                      <th className="py-3.5 px-4">Data de Entrada</th>
                      <th className="py-3.5 px-4">Leitura / Status</th>
                      <th className="py-3.5 px-4 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/70">
                    {loadingLeads ? (
                      <tr>
                        <td colSpan={9} className="py-10 text-center text-zinc-500">
                          Carregando registros de clientes...
                        </td>
                      </tr>
                    ) : filteredLeads.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-12 text-center">
                          <p className="text-sm font-semibold text-zinc-300 mb-1">
                            Nenhum registro encontrado
                          </p>
                          <p className="text-xs text-zinc-500 mb-4">
                            Quando um visitante preencher o botão flutuante do site ou você cadastrar manualmente, o cliente aparecerá aqui.
                          </p>
                          <button
                            type="button"
                            onClick={openCreateModal}
                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition cursor-pointer"
                          >
                            Cadastrar Primeiro Cliente
                          </button>
                        </td>
                      </tr>
                    ) : (
                      filteredLeads.map((lead) => {
                        const waDigits = sanitizeWhatsappDigits(lead.whatsapp);
                        const meta = STATUS_META[lead.status] || STATUS_META.novo;
                        const isRead = Boolean(lead.is_read);
                        return (
                          <tr
                            key={lead.id}
                            className={`hover:bg-zinc-800/35 transition ${!isRead ? 'bg-amber-500/[0.03]' : ''}`}
                          >
                            <td className="py-3.5 px-4 font-mono font-bold text-emerald-400 whitespace-nowrap">
                              {lead.client_label}
                            </td>
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <div className="font-semibold text-white">
                                {lead.owner_name || user?.username || 'Atendente'}
                              </div>
                              <div className="font-mono text-[11px] text-emerald-400">
                                {lead.owner_code || ownerCode}
                              </div>
                            </td>
                            <td className="py-3.5 px-4 font-semibold text-white whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                {!isRead && (
                                  <span
                                    className="w-2 h-2 rounded-full bg-amber-400 shrink-0"
                                    title="Pendente"
                                  />
                                )}
                                <span>{lead.name}</span>
                              </div>
                            </td>
                            <td className="py-3.5 px-4 font-mono text-zinc-300 whitespace-nowrap tabular-nums">
                              {lead.whatsapp}
                            </td>
                            <td className="py-3.5 px-4 text-zinc-300 max-w-[180px] truncate">
                              {lead.email || '—'}
                            </td>
                            <td className="py-3.5 px-4 text-zinc-400 max-w-[240px] truncate" title={lead.message}>
                              {lead.message || '—'}
                            </td>
                            <td className="py-3.5 px-4 font-mono text-zinc-400 whitespace-nowrap tabular-nums">
                              {formatDateTime(lead.call_date)}
                            </td>
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                    isRead
                                      ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                                      : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                                  }`}
                                >
                                  {isRead ? 'Lido' : 'Pendente'}
                                </span>
                                <select
                                  value={lead.status}
                                  onChange={(e) =>
                                    handleQuickStatusChange(lead, e.target.value as ClientLeadStatus)
                                  }
                                  className={`bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1 text-[11px] font-semibold focus:outline-none focus:border-emerald-500 cursor-pointer ${meta.textClass}`}
                                >
                                  <option value="novo">Novo</option>
                                  <option value="em_atendimento">Em Atendimento</option>
                                  <option value="atendido">Atendido</option>
                                  <option value="retornar">Retornar</option>
                                </select>
                              </div>
                            </td>
                            <td className="py-3.5 px-4 text-right whitespace-nowrap">
                              <div className="inline-flex items-center gap-1.5">
                                {waDigits && (
                                  <a
                                    href={`https://wa.me/${waDigits}?text=${encodeURIComponent(`Olá ${lead.name}, tudo bem? Recebemos seu contato pelo atendimento online.`)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-1.5 text-emerald-400 hover:bg-emerald-500/15 rounded-lg transition"
                                    title="Responder no WhatsApp"
                                  >
                                    <ArrowUpRight className="w-4 h-4" />
                                  </a>
                                )}
                                <button
                                  type="button"
                                  onClick={() => onStartClientPreviewCall({ lead })}
                                  className="p-1.5 text-indigo-400 hover:bg-indigo-500/15 rounded-lg transition cursor-pointer"
                                  title="Abrir tela de chamada / chat de atendimento"
                                >
                                  <Phone className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setViewingLead(lead)}
                                  className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition cursor-pointer"
                                  title="Ver detalhes completos"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleToggleRead(lead)}
                                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold border transition cursor-pointer ${
                                    isRead
                                      ? 'bg-zinc-950 border-zinc-700 text-amber-300 hover:bg-zinc-800'
                                      : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25'
                                  }`}
                                  title={isRead ? 'Marcar como Pendente' : 'Marcar como Lido'}
                                >
                                  {isRead ? (
                                    <>
                                      <Clock className="w-3.5 h-3.5" />
                                      <span>Pendente</span>
                                    </>
                                  ) : (
                                    <>
                                      <CheckCircle2 className="w-3.5 h-3.5" />
                                      <span>Marcar Lido</span>
                                    </>
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openEditModal(lead)}
                                  className="inline-flex items-center gap-1 px-2 py-1 bg-zinc-950 border border-zinc-800 hover:border-indigo-500/40 text-zinc-300 hover:text-indigo-300 rounded-lg text-[11px] font-semibold transition cursor-pointer"
                                  title="Editar cliente"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                  <span>Editar</span>
                                </button>
                                {deleteConfirmId === lead.id ? (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteLead(lead.id)}
                                    className="px-2 py-1 bg-red-600 hover:bg-red-500 text-white rounded-lg text-[11px] font-bold cursor-pointer"
                                  >
                                    Confirmar
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setDeleteConfirmId(lead.id)}
                                    className="inline-flex items-center gap-1 px-2 py-1 bg-zinc-950 border border-zinc-800 hover:border-red-500/40 text-zinc-400 hover:text-red-400 rounded-lg text-[11px] font-semibold transition cursor-pointer"
                                    title="Deletar cliente"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span>Deletar</span>
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* View Client Lead Detail Modal */}
      {viewingLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="relative w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-mono text-xs font-bold text-emerald-400">
                  {viewingLead.client_label}
                </div>
                <h3 className="text-lg font-bold text-white mt-0.5">{viewingLead.name}</h3>
              </div>
              <button
                type="button"
                onClick={() => setViewingLead(null)}
                className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 space-y-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-zinc-400 flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5" /> WhatsApp
                </span>
                <span className="font-mono font-semibold text-white tabular-nums">
                  {viewingLead.whatsapp}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-zinc-400 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5" /> E-mail
                </span>
                <span className="text-zinc-200">{viewingLead.email || '—'}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-zinc-400 flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5" /> Usuário que Atendeu
                </span>
                <span className="text-zinc-200 font-semibold">
                  {viewingLead.owner_name || user?.username || 'Atendente'} ({viewingLead.owner_code})
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-zinc-400 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" /> Data da Chamada
                </span>
                <span className="font-mono text-zinc-200 tabular-nums">
                  {formatDateTime(viewingLead.call_date)}
                </span>
              </div>
              <div className="pt-2 border-t border-zinc-800">
                <span className="text-zinc-400 block mb-1 flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5" /> Mensagem do Cliente
                </span>
                <p className="text-zinc-100 leading-relaxed bg-zinc-900 p-3 rounded-lg border border-zinc-800">
                  {viewingLead.message || 'Sem mensagem.'}
                </p>
              </div>
              {viewingLead.notes && (
                <div className="pt-2 border-t border-zinc-800">
                  <span className="text-zinc-400 block mb-1">Anotações Internas</span>
                  <p className="text-zinc-300 leading-relaxed">{viewingLead.notes}</p>
                </div>
              )}
              {viewingLead.source_url && (
                <div className="text-[11px] text-zinc-500 truncate">
                  Origem: {viewingLead.source_url}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              {sanitizeWhatsappDigits(viewingLead.whatsapp) && (
                <a
                  href={`https://wa.me/${sanitizeWhatsappDigits(viewingLead.whatsapp)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5"
                >
                  <span>Abrir WhatsApp</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
              <button
                type="button"
                onClick={() => {
                  const target = viewingLead;
                  setViewingLead(null);
                  openEditModal(target);
                }}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-xs font-semibold cursor-pointer"
              >
                Editar Dados
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit Client Lead Modal */}
      {(isCreateOpen || editingLead) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-white">
                {editingLead ? 'Editar Dados do Cliente' : 'Cadastrar Novo Cliente'}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setIsCreateOpen(false);
                  setEditingLead(null);
                }}
                className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={editingLead ? handleSaveEdit : handleSaveCreate}
              className="space-y-3 text-xs"
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 font-semibold mb-1">Identificador</label>
                  <input
                    type="text"
                    value={formState.client_label}
                    onChange={(e) => setFormState({ ...formState, client_label: e.target.value })}
                    placeholder="Auto (ex: Cliente On Line 02)"
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-white font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 font-semibold mb-1">Status</label>
                  <select
                    value={formState.status}
                    onChange={(e) =>
                      setFormState({ ...formState, status: e.target.value as ClientLeadStatus })
                    }
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="novo">Novo</option>
                    <option value="em_atendimento">Em Atendimento</option>
                    <option value="atendido">Atendido</option>
                    <option value="retornar">Retornar</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-zinc-400 font-semibold mb-1">Nome</label>
                <input
                  type="text"
                  required
                  value={formState.name}
                  onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                  placeholder="Nome completo"
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 font-semibold mb-1">WhatsApp</label>
                  <input
                    type="tel"
                    required
                    value={formState.whatsapp}
                    onChange={(e) => setFormState({ ...formState, whatsapp: e.target.value })}
                    placeholder="(11) 99999-9999"
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-white font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 font-semibold mb-1">E-mail</label>
                  <input
                    type="email"
                    value={formState.email}
                    onChange={(e) => setFormState({ ...formState, email: e.target.value })}
                    placeholder="cliente@email.com"
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-zinc-400 font-semibold mb-1">Data de Entrada</label>
                <input
                  type="datetime-local"
                  value={formState.call_date}
                  onChange={(e) => setFormState({ ...formState, call_date: e.target.value })}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-white font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-zinc-400 font-semibold mb-1">Mensagem Inicial</label>
                <textarea
                  rows={2}
                  value={formState.message}
                  onChange={(e) => setFormState({ ...formState, message: e.target.value })}
                  placeholder="Mensagem inicial deixada pelo cliente..."
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-white focus:outline-none focus:border-emerald-500 resize-none"
                />
              </div>

              <label className="flex items-center gap-2 text-zinc-300 font-semibold cursor-pointer select-none pt-0.5">
                <input
                  type="checkbox"
                  checked={formState.is_read}
                  onChange={(e) => setFormState({ ...formState, is_read: e.target.checked })}
                  className="rounded border-zinc-700 bg-zinc-950 text-emerald-500 focus:ring-emerald-500"
                />
                <span>Marcar como Lido (desmarque para deixar Pendente)</span>
              </label>

              <div>
                <label className="block text-zinc-400 font-semibold mb-1">Notas de Atendimento</label>
                <input
                  type="text"
                  value={formState.notes}
                  onChange={(e) => setFormState({ ...formState, notes: e.target.value })}
                  placeholder="Observações internas..."
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreateOpen(false);
                    setEditingLead(null);
                  }}
                  className="flex-1 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl cursor-pointer"
                >
                  {editingLead ? 'Salvar Alterações' : 'Cadastrar Cliente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
