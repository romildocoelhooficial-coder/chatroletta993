import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import {
  User,
  Report,
  ClientLead,
  ClientLeadStatus,
  AccessPackageId,
  WorldRegionId,
  TeachSubject,
} from './src/types/index.ts';
import {
  ACCESS_PACKAGES,
  getPackageConfig,
  inferRegionFromCountry,
} from './src/constants/packages.ts';
import { buildEmbedWidgetJs, buildWidgetDemoHtml } from './widgetBuilder.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'database.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initial Seed Users
const initialUsers: User[] = [
  {
    id: 'user_admin_001',
    unique_code: '#CR-000001',
    username: 'Administrador Master',
    email: 'admin@chatroulette.com',
    role: 'admin',
    status: 'online',
    payment_status: 'pago',
    access_package: 'pacote_04_professor',
    region: 'america_sul',
    country: 'Brasil 🇧🇷',
    gender: 'unspecified',
    bio: 'Administrador global do ChatRoulette P2P.',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
  },
  {
    id: 'user_002',
    unique_code: '#CR-849201',
    username: 'Lucas Silva',
    email: 'lucas@exemplo.com',
    role: 'user',
    status: 'online',
    payment_status: 'pago',
    access_package: 'pacote_04_professor',
    intent_teach_classes: true,
    intent_choose_gender_region: true,
    teach_subjects: ['idiomas', 'musica'],
    teach_description: 'Aulas de Inglês conversação e Violão para iniciantes.',
    region: 'america_sul',
    country: 'Brasil 🇧🇷',
    gender: 'male',
    bio: 'Adoro conversar sobre tecnologia, música e games!',
    avatar: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150&auto=format&fit=crop&q=80',
    created_at: new Date(Date.now() - 15 * 86400000).toISOString(),
  },
  {
    id: 'user_003',
    unique_code: '#CR-193852',
    username: 'Sofia Martinez',
    email: 'sofia@exemplo.com',
    role: 'user',
    status: 'online',
    payment_status: 'pago',
    access_package: 'pacote_03_premium',
    intent_choose_gender_region: true,
    region: 'europa',
    country: 'Portugal 🇵🇹',
    gender: 'female',
    bio: 'Estudante de design e fotografia. Curto conhecer pessoas do mundo.',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
    created_at: new Date(Date.now() - 10 * 86400000).toISOString(),
  },
  {
    id: 'user_004',
    unique_code: '#CR-648291',
    username: 'Alex Morgan',
    email: 'alex@exemplo.com',
    role: 'user',
    status: 'offline',
    payment_status: 'pago',
    access_package: 'pacote_02_boas_vindas',
    intent_just_browse: true,
    region: 'america_norte',
    country: 'Estados Unidos 🇺🇸',
    gender: 'male',
    bio: 'Musician & traveler. Say hi from anywhere!',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    created_at: new Date(Date.now() - 7 * 86400000).toISOString(),
  },
  {
    id: 'user_005',
    unique_code: '#CR-552910',
    username: 'Clara Costa',
    email: 'clara@exemplo.com',
    role: 'user',
    status: 'online',
    payment_status: 'pendente',
    access_package: 'pacote_01_gratuito',
    intent_just_browse: true,
    region: 'europa',
    country: 'Espanha 🇪🇸',
    gender: 'female',
    bio: '¡Hola! Vamos a practicar idiomas y charlar.',
    avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80',
    created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
  },
];

const initialReports: Report[] = [
  {
    id: 'rep_001',
    reporter_id: 'user_003',
    reporter_name: 'Sofia Martinez',
    reported_id: 'user_004',
    reported_name: 'Alex Morgan',
    reported_code: '#CR-648291',
    reason: 'Comportamento inadequado durante a chamada',
    details: 'Desconectou abruptamente após palavras ofensivas.',
    created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    resolved: false,
  },
];

interface DatabaseSchema {
  users: (User & { password_hash?: string })[];
  reports: Report[];
  clientLeads?: ClientLead[];
}

const initialClientLeads: ClientLead[] = [
  {
    id: 'lead_seed_001',
    owner_id: 'user_002',
    owner_code: '#CR-849201',
    client_label: 'Cliente On Line 01',
    name: 'Mariana Alves',
    whatsapp: '(11) 98765-4321',
    email: 'mariana.alves@empresa.com.br',
    message: 'Olá! Gostaria de tirar uma dúvida rápida sobre planos e suporte ao vivo.',
    call_date: new Date(Date.now() - 3600000 * 5).toISOString(),
    status: 'atendido',
    is_read: true,
    source_url: 'https://exemplo.com.br/contato',
    notes: 'Atendimento inicial concluído por áudio.',
  },
];

function loadDatabase(): DatabaseSchema {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(data) as DatabaseSchema;
      if (Array.isArray(parsed.users)) {
        const defaultPackages: Record<string, AccessPackageId> = {
          user_admin_001: 'pacote_04_professor',
          user_002: 'pacote_04_professor',
          user_003: 'pacote_03_premium',
          user_004: 'pacote_02_boas_vindas',
          user_005: 'pacote_01_gratuito',
        };
        parsed.users = parsed.users.map((u) => ({
          ...u,
          payment_status: u.payment_status === 'pago' ? 'pago' : 'pendente',
          access_package:
            u.access_package && u.access_package in ACCESS_PACKAGES
              ? u.access_package
              : defaultPackages[u.id] || 'pacote_01_gratuito',
          region: inferRegionFromCountry(u.country, u.region),
        }));
      }
      if (!Array.isArray(parsed.clientLeads)) {
        parsed.clientLeads = [...initialClientLeads];
      }
      return parsed;
    }
  } catch (err) {
    console.error('Failed to load database.json, initializing fresh', err);
  }
  const defaultDB: DatabaseSchema = {
    users: initialUsers.map((u) => ({
      ...u,
      password_hash: u.role === 'admin' ? 'admin123' : 'user123',
    })),
    reports: initialReports,
    clientLeads: [...initialClientLeads],
  };
  saveDatabase(defaultDB);
  return defaultDB;
}

function saveDatabase(db: DatabaseSchema) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save database.json', err);
  }
}

let db = loadDatabase();

// Generate unique identification code: #CR-XXXXXX
function generateUniqueCode(): string {
  let code = '';
  let exists = true;
  while (exists) {
    const num = Math.floor(100000 + Math.random() * 900000);
    code = `#CR-${num}`;
    exists = db.users.some((u) => u.unique_code === code);
  }
  return code;
}

const SERVER_AVATAR_PALETTES: [string, string][] = [
  ['#6366f1', '#8b5cf6'],
  ['#10b981', '#059669'],
  ['#0ea5e9', '#2563eb'],
  ['#ec4899', '#db2777'],
  ['#f59e0b', '#d97706'],
  ['#14b8a6', '#0d9488'],
];

function generateLocalAvatar(name: string = 'U'): string {
  const clean = (name || 'U').trim();
  const words = clean.split(/\s+/).filter(Boolean);
  const initials =
    words.length >= 2
      ? `${words[0][0]}${words[1][0]}`.toUpperCase()
      : clean.slice(0, 2).toUpperCase() || 'CR';
  let hash = 0;
  for (let i = 0; i < clean.length; i++) {
    hash = (hash * 31 + clean.charCodeAt(i)) | 0;
  }
  const [c1, c2] = SERVER_AVATAR_PALETTES[Math.abs(hash) % SERVER_AVATAR_PALETTES.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${c1}"/><stop offset="100%" stop-color="${c2}"/></linearGradient></defs><rect width="128" height="128" rx="28" fill="url(#g)"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="#ffffff" font-family="system-ui,-apple-system,sans-serif" font-size="48" font-weight="800">${initials}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function getNextClientLabel(ownerId: string): string {
  const leads = (db.clientLeads || []).filter((l) => l.owner_id === ownerId);
  let maxNum = 1;
  leads.forEach((lead) => {
    const match = lead.client_label?.match(/(\d+)\s*$/);
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > maxNum) maxNum = n;
    }
  });
  const nextNum = Math.max(2, maxNum + 1);
  return `Cliente On Line ${nextNum.toString().padStart(2, '0')}`;
}

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
    pingInterval: 10000,
    pingTimeout: 30000,
    connectTimeout: 45000,
  });

  app.use(express.json({ limit: '10mb' }));

  // Enable CORS for all incoming requests (Vercel, custom domains, local)
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // Socket Tracking Maps
  // userId -> Set of socketIds
  const userSockets = new Map<string, Set<string>>();
  // unique_code -> Set of socketIds (for direct dialing by code #CR-XXXXXX)
  const codeSockets = new Map<string, Set<string>>();
  // socketId -> userId
  const socketUsers = new Map<string, string>();
  // socketId -> user details cache
  const socketData = new Map<string, { userId: string; username: string; unique_code: string }>();
  // socketId -> current activity ('online' | 'roulette' | 'direct')
  const socketActivity = new Map<string, string>();

  function isAdminSocket(socketId: string): boolean {
    const uid = socketUsers.get(socketId);
    if (!uid) return false;
    const u = db.users.find((x) => x.id === uid);
    return u?.role === 'admin';
  }

  function getOnlineSpyTargets() {
    const targets: {
      socketId: string;
      userId: string;
      username: string;
      unique_code: string;
      avatar?: string;
      country?: string;
      activity: string;
    }[] = [];
    for (const [sId, data] of socketData.entries()) {
      const sock = io.sockets.sockets.get(sId);
      const u = db.users.find((x) => x.id === data.userId);
      if (sock && sock.connected && u && u.role !== 'admin' && u.status !== 'banned') {
        targets.push({
          socketId: sId,
          userId: u.id,
          username: u.username,
          unique_code: u.unique_code,
          avatar: u.avatar,
          country: u.country,
          activity: socketActivity.get(sId) || 'online',
        });
      }
    }
    return targets;
  }

  function notifyAdminsOnlineChanged() {
    const targets = getOnlineSpyTargets();
    for (const [sId] of socketData.entries()) {
      if (isAdminSocket(sId)) {
        io.to(sId).emit('admin:spy_targets', targets);
      }
    }
  }

  // Roulette waiting queue: array of { socketId, userId, regionFilter, genderFilter, userRegion, userGender, accessPackage, joinedAt }
  type QueueItem = {
    socketId: string;
    userId: string;
    regionFilter: string;
    genderFilter: string;
    userRegion: WorldRegionId;
    userGender: string;
    accessPackage: AccessPackageId;
    joinedAt: number;
  };
  let rouletteQueue: QueueItem[] = [];

  // Active rooms: roomId -> Set of socketIds
  const activeRooms = new Map<string, Set<string>>();
  // Per-room interaction timeout handles (enforces 1 min free, 15/30/60 min package limits)
  const rouletteRoomTimers = new Map<string, ReturnType<typeof setTimeout>[]>();
  // Room metadata for multi-party direct calls and host tracking
  const roomMetadata = new Map<
    string,
    { hostUserId: string; hostSocketId: string; callId: string; type: 'roulette' | 'direct'; guestSocketIds: Set<string> }
  >();
  // Pending Direct Calls (ringing only): callId -> { ... }
  const activeCalls = new Map<
    string,
    {
      callerSocketId: string;
      receiverSocketId: string;
      receiverId?: string;
      callerCode: string;
      receiverCode: string;
      startTime: number;
      timeoutTimer?: ReturnType<typeof setTimeout>;
      targetSockets?: string[];
      callType?: 'video' | 'audio';
      callerUser?: {
        id: string;
        username: string;
        unique_code: string;
        avatar?: string;
        country?: string;
      };
      targetUser?: {
        id: string;
        username: string;
        unique_code: string;
        avatar?: string;
        country?: string;
      };
      isClientWidget?: boolean;
      clientMeta?: {
        leadId: string;
        clientLabel: string;
        name: string;
        whatsapp: string;
        email: string;
        message: string;
        call_date: string;
        source_url?: string;
      };
    }
  >();
  // Track widget call & chat state for HTTP fallback + late socket attach
  interface WidgetCallState {
    callId: string;
    roomId: string;
    status: 'ringing' | 'accepted' | 'rejected' | 'ended' | 'offline';
    callerSocketId: string;
    ownerSocketId?: string;
    ownerName: string;
    ownerOnline: boolean;
    clientLabel: string;
    lead: ClientLead;
    reason?: string;
    createdAt: number;
    messages: {
      id: string;
      sender_id: string;
      sender_name: string;
      sender_code?: string;
      text: string;
      timestamp: string;
      is_system?: boolean;
    }[];
  }
  const widgetCallStates = new Map<string, WidgetCallState>();
  const widgetRecentSignatures = new Map<string, { callId: string; ts: number; result: any }>();
  const pendingWidgetDisconnects = new Map<string, ReturnType<typeof setTimeout>>();
  // Pending Group Invites: inviteId -> { ... }
  const activeInvites = new Map<
    string,
    {
      inviteId: string;
      roomId: string;
      callId: string;
      hostSocketId: string;
      targetUserId: string;
      targetCode: string;
      targetSockets: string[];
      timeoutTimer?: ReturnType<typeof setTimeout>;
    }
  >();
  // Grace period timers on unexpected socket disconnects: oldSocketId -> { timer, roomId, userId }
  const pendingDisconnects = new Map<
    string,
    { timer: ReturnType<typeof setTimeout>; roomId: string; userId: string; oldSocketId: string }
  >();

  // Helper to broadcast presence update
  function broadcastUserPresence(userId: string, status: User['status'] | string) {
    io.emit('presence:change', { userId, status });
  }

  // Helper to broadcast online users list (includes region & access package)
  function broadcastOnlineUsers() {
    const onlineList: {
      id: string;
      username: string;
      unique_code: string;
      country?: string;
      region?: WorldRegionId;
      gender?: string;
      access_package?: AccessPackageId;
      avatar?: string;
    }[] = [];
    const seenUsers = new Set<string>();
    for (const [socketId, data] of socketData.entries()) {
      const sock = io.sockets.sockets.get(socketId);
      if (sock && sock.connected && !seenUsers.has(data.userId)) {
        seenUsers.add(data.userId);
        const user = db.users.find((u) => u.id === data.userId);
        onlineList.push({
          id: data.userId,
          username: data.username,
          unique_code: data.unique_code,
          country: user?.country,
          region: inferRegionFromCountry(user?.country, user?.region),
          gender: user?.gender || 'unspecified',
          access_package: user?.access_package || 'pacote_01_gratuito',
          avatar: user?.avatar,
        });
      }
    }
    io.emit('presence:online_list', onlineList);
  }

  // --- REST API ROUTES ---

  // Auth: Register
  app.post('/api/auth/register', (req, res) => {
    const {
      username,
      email,
      password,
      country,
      gender,
      bio,
      access_package,
      intent_just_browse,
      intent_choose_gender_region,
      intent_teach_classes,
      teach_subjects,
      teach_description,
      region,
    } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Nome de usuário, email e senha são obrigatórios.' });
    }

    const existingEmail = db.users.find(
      (u) => u.email.toLowerCase() === email.toLowerCase()
    );
    if (existingEmail) {
      return res.status(400).json({ error: 'Já existe um usuário cadastrado com este e-mail.' });
    }

    const validPackage: AccessPackageId =
      access_package && access_package in ACCESS_PACKAGES
        ? access_package
        : 'pacote_01_gratuito';
    const validSubjects: TeachSubject[] = Array.isArray(teach_subjects)
      ? teach_subjects.filter((s: any) => s === 'idiomas' || s === 'musica' || s === 'outros')
      : [];

    const uniqueCode = generateUniqueCode();
    const newUser: User & { password_hash: string } = {
      id: `user_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      unique_code: uniqueCode,
      username: username.trim(),
      email: email.trim().toLowerCase(),
      password_hash: password,
      role: 'user',
      status: 'online',
      payment_status: 'pendente',
      access_package: validPackage,
      intent_just_browse: Boolean(intent_just_browse),
      intent_choose_gender_region: Boolean(intent_choose_gender_region),
      intent_teach_classes: Boolean(intent_teach_classes),
      teach_subjects: validSubjects,
      teach_description: typeof teach_description === 'string' ? teach_description.trim().slice(0, 400) : '',
      region: inferRegionFromCountry(country, region),
      country: country || 'Brasil 🇧🇷',
      gender: gender || 'unspecified',
      bio: bio || '',
      avatar: generateLocalAvatar(username),
      created_at: new Date().toISOString(),
    };

    db.users.push(newUser);
    saveDatabase(db);

    const { password_hash, ...safeUser } = newUser;
    return res.status(201).json({
      user: safeUser,
      token: safeUser.id,
      message: 'Usuário cadastrado com sucesso!',
    });
  });

  // Teacher Package 04: Save Pix QR Code image & Bank Details
  app.post('/api/users/teacher-payment', (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'Token não fornecido.' });
    }
    const user = db.users.find((u) => u.id === token);
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }
    if (user.access_package !== 'pacote_04_professor' && user.role !== 'admin') {
      return res.status(403).json({
        error: 'Recurso exclusivo do Pacote 04 (Uso Profissional para Aulas).',
      });
    }

    const { pix_qr_image, bank_details } = req.body || {};
    if (pix_qr_image !== undefined) {
      if (typeof pix_qr_image === 'string' && pix_qr_image.length > 0) {
        if (!pix_qr_image.startsWith('data:image/') || pix_qr_image.length > 800000) {
          return res.status(400).json({ error: 'Imagem de QR Code inválida ou muito grande.' });
        }
        user.pix_qr_image = pix_qr_image;
      } else {
        user.pix_qr_image = undefined;
      }
    }
    if (bank_details !== undefined) {
      user.bank_details = typeof bank_details === 'string' ? bank_details.trim().slice(0, 600) : '';
    }

    saveDatabase(db);
    const { password_hash, ...safeUser } = user;
    return res.json({ user: safeUser, message: 'Dados de recebimento salvos com sucesso!' });
  });

  // Auth: Login (accepts email or unique_code)
  app.post('/api/auth/login', (req, res) => {
    const { identifier, password } = req.body;
    if (!identifier || !password) {
      return res.status(400).json({ error: 'Identificador (e-mail ou código) e senha são obrigatórios.' });
    }

    const cleanId = identifier.trim().toLowerCase();
    const user = db.users.find(
      (u) =>
        u.email.toLowerCase() === cleanId ||
        u.unique_code.toLowerCase() === cleanId
    );

    if (!user || user.password_hash !== password) {
      return res.status(401).json({ error: 'Credenciais inválidas. Verifique seu e-mail/código e senha.' });
    }

    if (user.status === 'banned') {
      return res.status(403).json({
        error: `Sua conta foi suspensa pela moderação. Motivo: ${user.ban_reason || 'Violação dos termos de uso'}.`,
        banned: true,
      });
    }

    // Set status to online
    user.status = 'online';
    saveDatabase(db);
    broadcastUserPresence(user.id, 'online');

    const { password_hash, ...safeUser } = user;
    return res.json({
      user: safeUser,
      token: safeUser.id,
      message: 'Login realizado com sucesso!',
    });
  });

  // Auth: Get current user
  app.get('/api/auth/me', (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'Token não fornecido.' });
    }

    const user = db.users.find((u) => u.id === token);
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    const { password_hash, ...safeUser } = user;
    return res.json({ user: safeUser });
  });

  // Search User by Unique Code (for Phone dialer preview)
  app.get('/api/users/by-code/:code', (req, res) => {
    const rawCode = req.params.code.trim().toUpperCase();
    const formattedCode = rawCode.startsWith('#') ? rawCode : `#${rawCode}`;

    const user = db.users.find((u) => u.unique_code.toUpperCase() === formattedCode);
    if (!user) {
      return res.status(404).json({ error: `Nenhum usuário encontrado com o código ${formattedCode}.` });
    }

    const isConnected = userSockets.has(user.id) && userSockets.get(user.id)!.size > 0;

    return res.json({
      user: {
        id: user.id,
        unique_code: user.unique_code,
        username: user.username,
        avatar: user.avatar,
        country: user.country,
        bio: user.bio,
        status: user.status === 'banned' ? 'banned' : isConnected ? 'online' : 'offline',
      },
    });
  });

  // Submit Report
  app.post('/api/reports', (req, res) => {
    const { reporterId, reportedCode, reason, details } = req.body;
    if (!reporterId || !reportedCode || !reason) {
      return res.status(400).json({ error: 'Dados incompletos para denúncia.' });
    }

    const reporter = db.users.find((u) => u.id === reporterId);
    const reported = db.users.find((u) => u.unique_code.toUpperCase() === reportedCode.trim().toUpperCase());

    if (!reported) {
      return res.status(404).json({ error: 'Usuário denunciado não encontrado.' });
    }

    const newReport: Report = {
      id: `rep_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      reporter_id: reporterId,
      reporter_name: reporter ? reporter.username : 'Anônimo',
      reported_id: reported.id,
      reported_name: reported.username,
      reported_code: reported.unique_code,
      reason: reason.trim(),
      details: details ? details.trim() : '',
      created_at: new Date().toISOString(),
      resolved: false,
    };

    db.reports.unshift(newReport);
    saveDatabase(db);

    // Notify admins via socket if any are connected
    io.emit('admin:new_report', newReport);

    return res.status(201).json({ message: 'Denúncia recebida com sucesso. Nossa moderação analisará o caso.', report: newReport });
  });

  // Serve lightweight SVG favicon to prevent 404 console errors
  app.get('/favicon.ico', (_req, res) => {
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.send(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#4f46e5"/><circle cx="32" cy="32" r="14" fill="#10b981"/></svg>'
    );
  });

  // --- EMBEDDABLE FLOATING WIDGET SCRIPT & DEMO PAGE ---
  app.get('/widget.js', (req, res) => {
    const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
    const host = req.get('host') || `localhost:${PORT}`;
    const origin = `${proto}://${host}`;
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    return res.send(buildEmbedWidgetJs(origin));
  });

  app.get('/widget-demo', (req, res) => {
    const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
    const host = req.get('host') || `localhost:${PORT}`;
    const origin = `${proto}://${host}`;
    const code = String(req.query.code || '#CR-849201');
    const position = String(req.query.position || 'left') === 'right' ? 'right' : 'left';
    const accent = String(req.query.accent || '#10b981');
    const title = String(req.query.title || 'Atendimento Online');
    const buttonText = String(req.query.buttonText || 'Atendimento');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(buildWidgetDemoHtml({ origin, code, position, accent, title, buttonText }));
  });

  // Shared helper to create ClientLead and ring owner's sockets from Socket.IO or HTTP fallback
  function dispatchWidgetCall(
    params: {
      ownerCode: string;
      name: string;
      whatsapp: string;
      email: string;
      message: string;
      sourceUrl?: string;
    },
    callerSocket?: Socket
  ):
    | { ok: false; error: string }
    | {
        ok: true;
        callId: string;
        lead: ClientLead;
        clientLabel: string;
        ownerName: string;
        ownerOnline: boolean;
      } {
    const rawCode = (params.ownerCode || '').trim().toUpperCase();
    const cleanCode = rawCode.startsWith('#') ? rawCode : `#${rawCode}`;
    let ownerUser = db.users.find((u) => u.unique_code.toUpperCase() === cleanCode);

    // Fallback: if user registered locally/standalone and identified via socket, resolve via codeSockets
    const socketsByCode = codeSockets.get(cleanCode) || new Set<string>();
    if (!ownerUser && socketsByCode.size > 0) {
      const firstSockId = Array.from(socketsByCode)[0];
      const sMeta = socketData.get(firstSockId);
      if (sMeta) {
        ownerUser = {
          id: sMeta.userId,
          unique_code: cleanCode,
          username: sMeta.username,
          email: '',
          role: 'user',
          status: 'online',
          payment_status: 'pendente',
          created_at: new Date().toISOString(),
        };
      }
    }

    if (!ownerUser) {
      return { ok: false, error: `Atendente (${cleanCode}) não encontrado.` };
    }

    // Prevent accidental duplicate call/lead creation from simultaneous socket + HTTP fallback within 4s
    const sigKey = `${ownerUser.id}::${String(params.name || '').trim().toLowerCase()}::${String(params.whatsapp || '').trim()}`;
    const recent = widgetRecentSignatures.get(sigKey);
    if (recent && Date.now() - recent.ts < 4000) {
      const existingState = widgetCallStates.get(recent.callId);
      if (existingState && callerSocket && existingState.callerSocketId === 'http_widget') {
        existingState.callerSocketId = callerSocket.id;
        const pending = activeCalls.get(recent.callId);
        if (pending) pending.callerSocketId = callerSocket.id;
      }
      return recent.result;
    }

    if (!Array.isArray(db.clientLeads)) db.clientLeads = [];
    const clientLabel = getNextClientLabel(ownerUser.id);
    const nowIso = new Date().toISOString();

    const lead: ClientLead = {
      id: `lead_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      owner_id: ownerUser.id,
      owner_code: ownerUser.unique_code,
      owner_name: ownerUser.username,
      client_label: clientLabel,
      name: String(params.name || 'Visitante').trim(),
      whatsapp: String(params.whatsapp || '').trim(),
      email: String(params.email || '').trim(),
      message: String(params.message || '').trim(),
      call_date: nowIso,
      status: 'novo',
      is_read: false,
      source_url: params.sourceUrl,
      notes: '',
    };

    db.clientLeads.unshift(lead);
    saveDatabase(db);

    if (callerSocket) {
      socketUsers.set(callerSocket.id, lead.id);
      socketData.set(callerSocket.id, {
        userId: lead.id,
        username: clientLabel,
        unique_code: 'WEB-CHAT',
      });
    }

    const socketsById = userSockets.get(ownerUser.id) || new Set<string>();
    const allOwnerSockets = new Set<string>([...socketsByCode, ...socketsById]);
    const activeOwnerSockets: string[] = [];
    allOwnerSockets.forEach((sId) => {
      if (!callerSocket || sId !== callerSocket.id) {
        const s = io.sockets.sockets.get(sId);
        if (s && s.connected) activeOwnerSockets.push(sId);
      }
    });

    console.log(
      `[WidgetCall] target=${cleanCode} (${ownerUser.id}) matchedSockets=${activeOwnerSockets.length} label=${clientLabel}`
    );

    activeOwnerSockets.forEach((sId) => {
      io.to(sId).emit('client:lead_created', { lead });
    });

    const callId = `wcall_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const roomId = `direct_room_${callId}`;

    if (activeOwnerSockets.length === 0) {
      const offlineResult = {
        ok: true as const,
        callId,
        lead,
        clientLabel,
        ownerName: ownerUser.username,
        ownerOnline: false,
      };
      widgetCallStates.set(callId, {
        callId,
        roomId,
        status: 'offline',
        callerSocketId: callerSocket ? callerSocket.id : 'http_widget',
        ownerName: ownerUser.username,
        ownerOnline: false,
        clientLabel,
        lead,
        createdAt: Date.now(),
        messages: [],
      });
      widgetRecentSignatures.set(sigKey, { callId, ts: Date.now(), result: offlineResult });
      return offlineResult;
    }

    const clientMeta = {
      leadId: lead.id,
      clientLabel,
      name: lead.name,
      whatsapp: lead.whatsapp,
      email: lead.email,
      message: lead.message,
      call_date: lead.call_date,
      source_url: lead.source_url,
    };

    const wState: WidgetCallState = {
      callId,
      roomId,
      status: 'ringing',
      callerSocketId: callerSocket ? callerSocket.id : 'http_widget',
      ownerName: ownerUser.username,
      ownerOnline: true,
      clientLabel,
      lead,
      createdAt: Date.now(),
      messages: [],
    };
    widgetCallStates.set(callId, wState);

    const timeoutTimer = setTimeout(() => {
      if (activeCalls.has(callId)) {
        activeCalls.delete(callId);
        wState.status = 'rejected';
        wState.reason = 'O atendente não pôde atender agora, mas seus dados ficaram salvos para retorno.';
        lead.status = 'retornar';
        saveDatabase(db);
        activeOwnerSockets.forEach((sId) => {
          io.to(sId).emit('client:lead_updated', { lead });
          io.to(sId).emit('call:ended', { callId, reason: 'Chamada do site não atendida a tempo.' });
        });
        if (wState.callerSocketId && wState.callerSocketId !== 'http_widget') {
          io.to(wState.callerSocketId).emit('call:rejected', {
            callId,
            reason: wState.reason,
          });
        }
      }
    }, 45000);

    activeCalls.set(callId, {
      callerSocketId: wState.callerSocketId,
      receiverSocketId: activeOwnerSockets[0],
      callerCode: 'WEB-CHAT',
      receiverCode: ownerUser.unique_code,
      startTime: Date.now(),
      timeoutTimer,
      targetSockets: activeOwnerSockets,
      callType: 'audio',
      isClientWidget: true,
      clientMeta,
    });

    activeOwnerSockets.forEach((sId) => {
      io.to(sId).emit('call:incoming', {
        callId,
        callerSocketId: wState.callerSocketId,
        caller: {
          id: lead.id,
          username: clientLabel,
          unique_code: 'ATENDIMENTO WEB',
          avatar: generateLocalAvatar(lead.name),
          country: 'Site Externo',
        },
        callType: 'audio',
        isClientWidget: true,
        clientMeta,
      });
    });

    const onlineResult = {
      ok: true as const,
      callId,
      lead,
      clientLabel,
      ownerName: ownerUser.username,
      ownerOnline: true,
    };
    widgetRecentSignatures.set(sigKey, { callId, ts: Date.now(), result: onlineResult });
    return onlineResult;
  }

  // HTTP fallback endpoint so external widgets can still trigger incoming calls if WebSocket fails
  app.post('/api/widget/call-start', (req, res) => {
    const { ownerCode, name, whatsapp, email, message, sourceUrl } = req.body || {};
    if (!ownerCode || !name || !whatsapp) {
      return res.status(400).json({ error: 'Dados incompletos para iniciar atendimento.' });
    }
    const result = dispatchWidgetCall({
      ownerCode: String(ownerCode),
      name: String(name),
      whatsapp: String(whatsapp),
      email: String(email || ''),
      message: String(message || ''),
      sourceUrl: sourceUrl ? String(sourceUrl) : undefined,
    });
    if (result.ok === false) {
      return res.status(404).json({ error: result.error });
    }
    return res.status(201).json(result);
  });

  // HTTP fallback status & chat sync for external widgets
  app.get('/api/widget/call-state/:callId', (req, res) => {
    const state = widgetCallStates.get(req.params.callId);
    if (!state) {
      return res.status(404).json({ error: 'Atendimento não encontrado.' });
    }
    return res.json({
      callId: state.callId,
      roomId: state.roomId,
      status: state.status,
      ownerName: state.ownerName,
      ownerSocketId: state.ownerSocketId,
      reason: state.reason,
      messages: state.messages,
    });
  });

  app.post('/api/widget/chat', (req, res) => {
    const { callId, roomId, text, senderName, senderRole } = req.body || {};
    const cleanText = String(text || '').trim();
    if (!cleanText || (!callId && !roomId)) {
      return res.status(400).json({ error: 'Mensagem ou identificador inválido.' });
    }

    let state = callId ? widgetCallStates.get(String(callId)) : undefined;
    if (!state && roomId) {
      for (const s of widgetCallStates.values()) {
        if (s.roomId === String(roomId)) {
          state = s;
          break;
        }
      }
    }

    const msg = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      sender_id: senderRole === 'attendant' ? 'attendant_http' : 'widget_visitor',
      sender_name: String(senderName || (senderRole === 'attendant' ? 'Atendente' : 'Cliente')),
      sender_code: senderRole === 'attendant' ? undefined : 'WEB-CHAT',
      text: cleanText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    if (state) {
      state.messages.push(msg);
      if (state.messages.length > 200) state.messages.shift();
      if (state.roomId && activeRooms.has(state.roomId)) {
        io.to(state.roomId).emit('chat:message', msg);
      } else if (state.ownerSocketId) {
        io.to(state.ownerSocketId).emit('chat:message', msg);
      }
    } else if (roomId && activeRooms.has(String(roomId))) {
      io.to(String(roomId)).emit('chat:message', msg);
    }

    return res.status(201).json({ message: msg });
  });

  function findWidgetCallState(params: { callId?: string; roomId?: string; callerSocketId?: string }): WidgetCallState | undefined {
    if (params.callId && widgetCallStates.has(params.callId)) {
      return widgetCallStates.get(params.callId);
    }
    if (params.roomId) {
      for (const s of widgetCallStates.values()) {
        if (s.roomId === params.roomId) return s;
      }
    }
    if (params.callerSocketId) {
      for (const s of widgetCallStates.values()) {
        if (s.callerSocketId === params.callerSocketId && s.status !== 'ended') return s;
      }
    }
    return undefined;
  }

  function notifyAttendantWidgetClientLeft(wState: WidgetCallState, reasonText = 'Cliente Saiu do Chat') {
    const pending = activeCalls.get(wState.callId);
    if (pending) {
      if (pending.timeoutTimer) clearTimeout(pending.timeoutTimer);
      pending.targetSockets?.forEach((sId) => {
        io.to(sId).emit('call:dismiss_incoming', { callId: wState.callId });
        io.to(sId).emit('call:ended', { callId: wState.callId, reason: reasonText });
      });
      activeCalls.delete(wState.callId);
    }

    if (wState.status === 'ended') return;
    const wasAccepted = wState.status === 'accepted';
    wState.status = 'ended';
    wState.reason = reasonText;

    const sysMsg = {
      id: `sys_left_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      sender_id: 'system',
      sender_name: 'Sistema',
      text: reasonText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      is_system: true,
    };
    wState.messages.push(sysMsg);

    const payload = {
      callId: wState.callId,
      roomId: wState.roomId,
      clientLabel: wState.clientLabel,
      clientName: wState.lead.name,
      message: reasonText,
    };

    const room = activeRooms.get(wState.roomId);
    if (wasAccepted) {
      if (room) {
        room.forEach((sId) => {
          if (sId !== wState.callerSocketId) {
            io.to(sId).emit('chat:message', sysMsg);
            io.to(sId).emit('widget:client_left', payload);
          }
          const s = io.sockets.sockets.get(sId);
          if (s) s.leave(wState.roomId);
        });
      } else if (wState.ownerSocketId) {
        io.to(wState.ownerSocketId).emit('chat:message', sysMsg);
        io.to(wState.ownerSocketId).emit('widget:client_left', payload);
      }
    }

    activeRooms.delete(wState.roomId);
    roomMetadata.delete(wState.roomId);
  }

  // HTTP / sendBeacon endpoint so widget visitors closing the modal or tab notify the attendant
  app.post('/api/widget/hangup', (req, res) => {
    const { callId, roomId, reason } = req.body || {};
    const state = findWidgetCallState({
      callId: callId ? String(callId) : undefined,
      roomId: roomId ? String(roomId) : undefined,
    });
    if (state) {
      notifyAttendantWidgetClientLeft(state, String(reason || 'Cliente Saiu do Chat'));
    }
    return res.json({ ok: true });
  });

  // --- USER CLIENT LEADS CRUD ROUTES ---
  const requireUserToken = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const user = db.users.find((u) => u.id === token);
    if (!user) {
      return res.status(401).json({ error: 'Autenticação necessária.' });
    }
    (req as any).authUser = user;
    next();
  };

  const enrichLeadWithOwner = (lead: ClientLead): ClientLead => {
    const owner = db.users.find(
      (u) => u.id === lead.owner_id || u.unique_code === lead.owner_code
    );
    return {
      ...lead,
      owner_name: owner?.username || lead.owner_name || lead.owner_code || 'Usuário não identificado',
      owner_code: owner?.unique_code || lead.owner_code,
    };
  };

  app.get('/api/clients', requireUserToken, (req, res) => {
    const authUser = (req as any).authUser as User;
    const leads = (db.clientLeads || [])
      .filter((l) => l.owner_id === authUser.id || authUser.role === 'admin')
      .map(enrichLeadWithOwner)
      .sort((a, b) => new Date(b.call_date).getTime() - new Date(a.call_date).getTime());
    return res.json({
      leads,
      nextLabel: getNextClientLabel(authUser.id),
    });
  });

  app.post('/api/clients', requireUserToken, (req, res) => {
    const authUser = (req as any).authUser as User;
    const { name, whatsapp, email, message, call_date, status, notes, client_label, is_read } = req.body || {};
    if (!name || !whatsapp) {
      return res.status(400).json({ error: 'Nome e WhatsApp são obrigatórios.' });
    }
    if (!Array.isArray(db.clientLeads)) db.clientLeads = [];

    const newLead: ClientLead = {
      id: `lead_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      owner_id: authUser.id,
      owner_code: authUser.unique_code,
      owner_name: authUser.username,
      client_label: (client_label || '').trim() || getNextClientLabel(authUser.id),
      name: String(name).trim(),
      whatsapp: String(whatsapp).trim(),
      email: String(email || '').trim(),
      message: String(message || '').trim(),
      call_date: call_date || new Date().toISOString(),
      status: (['novo', 'em_atendimento', 'atendido', 'retornar'].includes(status) ? status : 'novo') as ClientLeadStatus,
      is_read: typeof is_read === 'boolean' ? is_read : false,
      notes: notes ? String(notes).trim() : '',
    };

    db.clientLeads.unshift(newLead);
    saveDatabase(db);
    return res.status(201).json({ lead: newLead, message: 'Cliente cadastrado com sucesso.' });
  });

  app.put('/api/clients/:id', requireUserToken, (req, res) => {
    const authUser = (req as any).authUser as User;
    const { id } = req.params;
    if (!Array.isArray(db.clientLeads)) db.clientLeads = [];
    const idx = db.clientLeads.findIndex((l) => l.id === id && (l.owner_id === authUser.id || authUser.role === 'admin'));
    if (idx === -1) {
      return res.status(404).json({ error: 'Registro de cliente não encontrado.' });
    }
    const current = db.clientLeads[idx];
    const { name, whatsapp, email, message, call_date, status, notes, client_label, is_read } = req.body || {};
    if (name !== undefined) current.name = String(name).trim();
    if (whatsapp !== undefined) current.whatsapp = String(whatsapp).trim();
    if (email !== undefined) current.email = String(email).trim();
    if (message !== undefined) current.message = String(message).trim();
    if (call_date !== undefined) current.call_date = String(call_date);
    if (client_label !== undefined) current.client_label = String(client_label).trim();
    if (notes !== undefined) current.notes = String(notes).trim();
    if (typeof is_read === 'boolean') current.is_read = is_read;
    if (['novo', 'em_atendimento', 'atendido', 'retornar'].includes(status)) {
      current.status = status as ClientLeadStatus;
    }

    saveDatabase(db);
    return res.json({ lead: enrichLeadWithOwner(current), message: 'Cliente atualizado com sucesso.' });
  });

  app.delete('/api/clients/:id', requireUserToken, (req, res) => {
    const authUser = (req as any).authUser as User;
    const { id } = req.params;
    if (!Array.isArray(db.clientLeads)) db.clientLeads = [];
    const idx = db.clientLeads.findIndex((l) => l.id === id && (l.owner_id === authUser.id || authUser.role === 'admin'));
    if (idx === -1) {
      return res.status(404).json({ error: 'Registro de cliente não encontrado.' });
    }
    db.clientLeads.splice(idx, 1);
    saveDatabase(db);
    return res.json({ message: 'Registro removido com sucesso.' });
  });

  // --- ADMIN REST API ROUTES ---
  // Middleware check for admin token
  const requireAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const user = db.users.find((u) => u.id === token);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Acesso restrito a administradores do sistema.' });
    }
    next();
  };

  // Admin Metrics
  app.get('/api/admin/metrics', requireAdmin, (_req, res) => {
    let onlineCount = 0;
    for (const [userId, sockets] of userSockets.entries()) {
      if (sockets.size > 0) {
        const u = db.users.find((x) => x.id === userId);
        if (u && u.status !== 'banned') onlineCount++;
      }
    }

    const metrics = {
      totalUsers: db.users.length,
      onlineUsers: onlineCount,
      activeCalls: activeCalls.size + activeRooms.size,
      bannedUsers: db.users.filter((u) => u.status === 'banned').length,
      pendingReports: db.reports.filter((r) => !r.resolved).length,
      rouletteQueueSize: rouletteQueue.length,
    };
    return res.json(metrics);
  });

  // Admin Users List with pagination, search & package filter
  app.get('/api/admin/users', requireAdmin, (req, res) => {
    const search = ((req.query.search as string) || '').toLowerCase().trim();
    const statusFilter = (req.query.status as string) || 'all';
    const roleFilter = (req.query.role as string) || 'all';
    const packageFilter = (req.query.package as string) || 'all';
    const page = parseInt((req.query.page as string) || '1', 10);
    const limit = parseInt((req.query.limit as string) || '10', 10);

    let filtered = db.users.map((u) => {
      const isOnline = userSockets.has(u.id) && userSockets.get(u.id)!.size > 0;
      const computedStatus = u.status === 'banned' ? 'banned' : isOnline ? 'online' : u.status;
      const { password_hash, ...safe } = u;
      return {
        ...safe,
        payment_status: u.payment_status === 'pago' ? 'pago' : 'pendente',
        access_package: u.access_package || 'pacote_01_gratuito',
        region: inferRegionFromCountry(u.country, u.region),
        is_connected: isOnline,
        status: computedStatus,
      };
    });

    if (search) {
      filtered = filtered.filter(
        (u) =>
          u.username.toLowerCase().includes(search) ||
          u.email.toLowerCase().includes(search) ||
          u.unique_code.toLowerCase().includes(search)
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

    const total = filtered.length;
    const startIndex = (page - 1) * limit;
    const paginated = filtered.slice(startIndex, startIndex + limit);

    return res.json({
      users: paginated,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  });

  // Admin Create User
  app.post('/api/admin/users', requireAdmin, (req, res) => {
    const {
      username,
      email,
      password,
      role,
      country,
      gender,
      bio,
      payment_status,
      access_package,
      intent_just_browse,
      intent_choose_gender_region,
      intent_teach_classes,
      teach_subjects,
      teach_description,
      region,
    } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Campos obrigatórios ausentes.' });
    }

    const existing = db.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (existing) {
      return res.status(400).json({ error: 'E-mail já está em uso.' });
    }

    const validPackage: AccessPackageId =
      access_package && access_package in ACCESS_PACKAGES
        ? access_package
        : 'pacote_01_gratuito';

    const newUser: User & { password_hash: string } = {
      id: `user_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      unique_code: generateUniqueCode(),
      username: username.trim(),
      email: email.trim().toLowerCase(),
      password_hash: password,
      role: role === 'admin' ? 'admin' : 'user',
      status: 'offline',
      payment_status: payment_status === 'pago' ? 'pago' : 'pendente',
      access_package: validPackage,
      intent_just_browse: Boolean(intent_just_browse),
      intent_choose_gender_region: Boolean(intent_choose_gender_region),
      intent_teach_classes: Boolean(intent_teach_classes),
      teach_subjects: Array.isArray(teach_subjects) ? teach_subjects : [],
      teach_description: typeof teach_description === 'string' ? teach_description.trim() : '',
      region: inferRegionFromCountry(country, region),
      country: country || 'Brasil 🇧🇷',
      gender: gender || 'unspecified',
      bio: bio || '',
      avatar: generateLocalAvatar(username),
      created_at: new Date().toISOString(),
    };

    db.users.unshift(newUser);
    saveDatabase(db);

    const { password_hash, ...safeUser } = newUser;
    return res.status(201).json({ user: safeUser, message: 'Usuário criado com sucesso!' });
  });

  // Admin Update User
  app.put('/api/admin/users/:id', requireAdmin, (req, res) => {
    const { id } = req.params;
    const {
      username,
      email,
      role,
      status,
      country,
      gender,
      bio,
      password,
      payment_status,
      access_package,
      intent_just_browse,
      intent_choose_gender_region,
      intent_teach_classes,
      teach_subjects,
      teach_description,
      region,
    } = req.body;

    const userIndex = db.users.findIndex((u) => u.id === id);
    if (userIndex === -1) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    const current = db.users[userIndex];
    if (username) current.username = username.trim();
    if (email) current.email = email.trim().toLowerCase();
    if (role) current.role = role;
    if (status) current.status = status;
    if (payment_status === 'pago' || payment_status === 'pendente') {
      current.payment_status = payment_status;
    }
    if (access_package && access_package in ACCESS_PACKAGES) {
      current.access_package = access_package;
    }
    if (intent_just_browse !== undefined) current.intent_just_browse = Boolean(intent_just_browse);
    if (intent_choose_gender_region !== undefined) {
      current.intent_choose_gender_region = Boolean(intent_choose_gender_region);
    }
    if (intent_teach_classes !== undefined) current.intent_teach_classes = Boolean(intent_teach_classes);
    if (Array.isArray(teach_subjects)) current.teach_subjects = teach_subjects;
    if (teach_description !== undefined) current.teach_description = String(teach_description).trim();
    if (country) {
      current.country = country;
      current.region = inferRegionFromCountry(country, region);
    } else if (region) {
      current.region = inferRegionFromCountry(current.country, region);
    }
    if (gender) current.gender = gender;
    if (bio !== undefined) current.bio = bio;
    if (password) current.password_hash = password;

    saveDatabase(db);

    const { password_hash, ...safeUser } = current;
    return res.json({ user: safeUser, message: 'Usuário atualizado com sucesso!' });
  });

  // Admin Quick Toggle Payment Status
  app.post('/api/admin/users/:id/payment', requireAdmin, (req, res) => {
    const { id } = req.params;
    const { payment_status } = req.body;
    const user = db.users.find((u) => u.id === id);
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    const nextStatus =
      payment_status === 'pago' || payment_status === 'pendente'
        ? payment_status
        : user.payment_status === 'pago'
        ? 'pendente'
        : 'pago';

    user.payment_status = nextStatus;
    saveDatabase(db);

    const { password_hash, ...safeUser } = user;
    return res.json({
      user: safeUser,
      message: `Status de pagamento alterado para "${nextStatus.toUpperCase()}".`,
    });
  });

  // Admin Broadcast Message to Selected Users or All Users (replaces previous message)
  app.post('/api/admin/messages', requireAdmin, (req, res) => {
    const { userIds, sendToAll, text } = req.body as {
      userIds?: string[];
      sendToAll?: boolean;
      text?: string;
    };

    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Digite uma mensagem antes de enviar.' });
    }

    const cleanText = text.trim();
    const messagePayload = {
      id: `adm_msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      text: cleanText,
      sent_at: new Date().toISOString(),
      sent_by: 'Administração',
    };

    let updatedCount = 0;
    db.users.forEach((u) => {
      const shouldTarget = sendToAll
        ? u.role !== 'admin'
        : Array.isArray(userIds) && userIds.includes(u.id);
      if (shouldTarget) {
        u.admin_message = messagePayload;
        updatedCount++;
        const sockets = userSockets.get(u.id);
        if (sockets) {
          sockets.forEach((sId) => {
            io.to(sId).emit('admin:user_message', { admin_message: messagePayload });
          });
        }
      }
    });

    saveDatabase(db);
    return res.json({
      message: `Mensagem enviada e fixada para ${updatedCount} usuário(s).`,
      updatedCount,
      admin_message: messagePayload,
    });
  });

  // Admin Ban / Unban User
  app.post('/api/admin/users/:id/ban', requireAdmin, (req, res) => {
    const { id } = req.params;
    const { action, reason } = req.body; // action: 'ban' | 'unban'

    const user = db.users.find((u) => u.id === id);
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    if (action === 'ban') {
      user.status = 'banned';
      user.ban_reason = reason || 'Violação das regras de conduta';

      // Terminate any active connections and calls
      const sockets = userSockets.get(user.id);
      if (sockets) {
        for (const sId of sockets) {
          io.to(sId).emit('user:banned', { reason: user.ban_reason });
          const socket = io.sockets.sockets.get(sId);
          if (socket) socket.disconnect(true);
        }
      }
      // Remove from queue
      rouletteQueue = rouletteQueue.filter((q) => q.userId !== user.id);
    } else {
      user.status = 'offline';
      user.ban_reason = undefined;
    }

    saveDatabase(db);
    broadcastUserPresence(user.id, user.status);

    return res.json({
      message: action === 'ban' ? 'Usuário banido com sucesso.' : 'Usuário desbanido com sucesso.',
      user: { id: user.id, status: user.status, ban_reason: user.ban_reason },
    });
  });

  // Admin Delete User
  app.delete('/api/admin/users/:id', requireAdmin, (req, res) => {
    const { id } = req.params;
    const index = db.users.findIndex((u) => u.id === id);
    if (index === -1) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    const deleted = db.users.splice(index, 1)[0];
    saveDatabase(db);

    // Disconnect user socket if online
    const sockets = userSockets.get(id);
    if (sockets) {
      for (const sId of sockets) {
        io.to(sId).emit('user:deleted');
        const s = io.sockets.sockets.get(sId);
        if (s) s.disconnect(true);
      }
      userSockets.delete(id);
    }

    return res.json({ message: `Usuário ${deleted.username} deletado com sucesso.` });
  });

  // Admin Reports List
  app.get('/api/admin/reports', requireAdmin, (_req, res) => {
    return res.json({ reports: db.reports });
  });

  // Admin Client Leads List (with attendant user name + general/user filters)
  app.get('/api/admin/clients', requireAdmin, (req, res) => {
    const search = ((req.query.search as string) || '').toLowerCase().trim();
    const ownerIdFilter = (req.query.ownerId as string) || 'all';
    const statusFilter = (req.query.status as string) || 'all';
    const readFilter = (req.query.readState as string) || 'all';

    let enriched = (db.clientLeads || [])
      .map((lead) => {
        const owner = db.users.find(
          (u) => u.id === lead.owner_id || u.unique_code === lead.owner_code
        );
        return {
          ...lead,
          owner_name: owner?.username || lead.owner_code || 'Usuário não identificado',
          owner_code: owner?.unique_code || lead.owner_code,
        };
      })
      .sort((a, b) => new Date(b.call_date).getTime() - new Date(a.call_date).getTime());

    if (search) {
      enriched = enriched.filter(
        (l) =>
          (l.name || '').toLowerCase().includes(search) ||
          (l.client_label || '').toLowerCase().includes(search) ||
          (l.whatsapp || '').toLowerCase().includes(search) ||
          (l.email || '').toLowerCase().includes(search) ||
          (l.message || '').toLowerCase().includes(search) ||
          (l.owner_name || '').toLowerCase().includes(search) ||
          (l.owner_code || '').toLowerCase().includes(search)
      );
    }

    if (ownerIdFilter !== 'all') {
      enriched = enriched.filter(
        (l) => l.owner_id === ownerIdFilter || l.owner_code === ownerIdFilter
      );
    }

    if (statusFilter !== 'all') {
      enriched = enriched.filter((l) => l.status === statusFilter);
    }

    if (readFilter === 'lido') {
      enriched = enriched.filter((l) => Boolean(l.is_read));
    } else if (readFilter === 'pendente') {
      enriched = enriched.filter((l) => !l.is_read);
    }

    const attendants = db.users
      .filter(
        (u) =>
          u.role !== 'admin' ||
          (db.clientLeads || []).some((l) => l.owner_id === u.id || l.owner_code === u.unique_code)
      )
      .map((u) => ({
        id: u.id,
        username: u.username,
        unique_code: u.unique_code,
      }))
      .sort((a, b) => a.username.localeCompare(b.username, 'pt-BR'));

    return res.json({
      leads: enriched,
      attendants,
    });
  });

  // Admin Resolve Report
  app.post('/api/admin/reports/:id/resolve', requireAdmin, (req, res) => {
    const { id } = req.params;
    const report = db.reports.find((r) => r.id === id);
    if (!report) {
      return res.status(404).json({ error: 'Denúncia não encontrada.' });
    }

    report.resolved = true;
    saveDatabase(db);
    return res.json({ message: 'Denúncia marcada como resolvida.', report });
  });

  // --- REALISTIC AI PARTNER SIMULATOR (GEMINI TEXT + VOICE + TRANSCRIPTION) ---
  const createGeminiClient = () => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      throw new Error('GEMINI_API_KEY_MISSING');
    }
    return new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  };

  const withGeminiRetry = async <T>(fn: () => Promise<T>, maxAttempts = 2): Promise<T> => {
    let lastError: any;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (err: any) {
        lastError = err;
        const msg = String(err?.message || err || '');
        const status = err?.status || err?.code;
        const isTransient =
          status === 500 ||
          status === 502 ||
          status === 503 ||
          msg.includes('503') ||
          msg.includes('500') ||
          msg.includes('ECONNRESET') ||
          msg.includes('fetch failed');
        if (!isTransient || attempt === maxAttempts) break;
        await new Promise((r) => setTimeout(r, 400 * attempt));
      }
    }
    throw lastError;
  };

  app.post('/api/simulator/reply', async (req, res) => {
    try {
      const ai = createGeminiClient();
      const {
        persona,
        history = [],
        userMessage,
        userAudioBase64,
        userAudioMimeType,
        userName,
        isInitialGreeting,
        withVoice = true,
      } = req.body || {};

      const personaName = String(persona?.name || 'Elena Rostova').slice(0, 60);
      const personaCountry = String(persona?.country || 'Alemanha 🇩🇪').slice(0, 60);
      const allowedVoices = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'];
      const voiceName = allowedVoices.includes(persona?.voiceName) ? persona.voiceName : 'Kore';
      const callerName = String(userName || 'amigo(a)').slice(0, 40);

      let resolvedUserText = typeof userMessage === 'string' ? userMessage.trim() : '';

      // Step 1: Transcribe voice input if audio was provided
      if (userAudioBase64 && typeof userAudioBase64 === 'string') {
        const cleanBase64 = userAudioBase64.includes(',')
          ? userAudioBase64.split(',')[1]
          : userAudioBase64;
        const cleanMime = String(userAudioMimeType || 'audio/webm').split(';')[0].trim() || 'audio/webm';

        const transcribeResp = await withGeminiRetry(() =>
          ai.models.generateContent({
            model: 'gemini-3.5-transcribe',
            contents: {
              parts: [
                {
                  inlineData: {
                    mimeType: cleanMime,
                    data: cleanBase64,
                  },
                },
                {
                  text: 'Transcreva exatamente o que a pessoa falou neste áudio. Retorne apenas a transcrição limpa, sem aspas ou explicações. Se não houver fala inteligível, retorne apenas a palavra SILENCIO.',
                },
              ],
            },
          })
        );

        const transcribed = (transcribeResp.text || '').trim();
        if (!transcribed || transcribed.toUpperCase() === 'SILENCIO') {
          return res.status(400).json({
            error: 'Não foi possível identificar sua fala no áudio. Tente falar um pouco mais perto do microfone.',
          });
        }
        resolvedUserText = transcribed;
      }

      if (!isInitialGreeting && !resolvedUserText) {
        return res.status(400).json({ error: 'Envie uma mensagem de texto ou áudio para conversar.' });
      }

      // Step 2: Generate realistic partner reply in Portuguese
      const systemInstruction = [
        `Você é ${personaName}, participante real de uma chamada de vídeo aleatória no site ChatRouletteP2P (${personaCountry}).`,
        `Você está conversando ao vivo por vídeo e áudio com ${callerName}.`,
        'Responda sempre em português brasileiro natural, simpático, acolhedor e espontâneo.',
        'Mantenha cada resposta curta e natural como em uma chamada de vídeo real (1 a 3 frases curtas, no máximo 45 palavras).',
        'Não use formatação markdown, asteriscos, emojis em excesso ou tópicos; escreva exatamente como alguém falaria em voz alta.',
        'Reaja ao assunto do usuário de forma autêntica e puxe assunto quando apropriado.',
      ].join(' ');

      const conversationContents: { role: 'user' | 'model'; parts: { text: string }[] }[] = [];

      const pushNormalizedTurn = (role: 'user' | 'model', text: string) => {
        const clean = text.trim();
        if (!clean) return;
        const last = conversationContents[conversationContents.length - 1];
        if (last && last.role === role) {
          last.parts[0].text = `${last.parts[0].text}\n${clean}`;
        } else {
          conversationContents.push({ role, parts: [{ text: clean }] });
        }
      };

      if (Array.isArray(history)) {
        for (const turn of history.slice(-12)) {
          if (
            turn &&
            (turn.role === 'user' || turn.role === 'model') &&
            typeof turn.text === 'string' &&
            turn.text.trim()
          ) {
            pushNormalizedTurn(turn.role, turn.text);
          }
        }
      }

      if (conversationContents[0]?.role === 'model') {
        conversationContents.unshift({
          role: 'user',
          parts: [{ text: `Oi ${personaName}, acabamos de conectar na roleta de vídeo!` }],
        });
      }

      if (isInitialGreeting) {
        pushNormalizedTurn(
          'user',
          `Acabamos de conectar na roleta de vídeo! Cumprimente ${callerName} de forma animada e natural, diga de onde você é (${personaCountry}) e faça uma pergunta leve para começar a conversa.`
        );
      } else {
        pushNormalizedTurn('user', resolvedUserText);
      }

      const textResp = await withGeminiRetry(() =>
        ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: conversationContents,
          config: {
            systemInstruction,
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          },
        })
      );

      const replyText = (textResp.text || '').trim();
      if (!replyText) {
        return res.status(502).json({ error: 'O modelo não retornou resposta para o simulador.' });
      }

      // Step 3: Synthesize natural speech audio (WAV) when voice is enabled
      let audioBase64: string | null = null;
      let ttsWarning: string | undefined;

      if (withVoice) {
        try {
          const ttsResp = await withGeminiRetry(() =>
            ai.models.generateContent({
              model: 'gemini-3.8-flash-lite-tts',
              contents: [
                {
                  role: 'user',
                  parts: [
                    {
                      text: replyText,
                      speechMetadata: {
                        style: 'Natural, warm, expressive, conversational video chat partner speaking Brazilian Portuguese',
                      },
                    },
                  ],
                },
              ],
              config: {
                responseModalities: ['AUDIO'],
                speechConfig: {
                  voiceConfig: {
                    prebuiltVoiceConfig: { voiceName },
                  },
                },
              },
            })
          );
          audioBase64 = ttsResp.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null;
        } catch (ttsErr: any) {
          console.warn('[Simulator TTS] Voice synthesis warning:', ttsErr?.message || ttsErr);
          ttsWarning = 'Resposta gerada em texto, mas a síntese de voz falhou momentaneamente.';
        }
      }

      return res.json({
        userTranscript: userAudioBase64 ? resolvedUserText : undefined,
        replyText,
        audioBase64,
        audioMimeType: audioBase64 ? 'audio/wav' : null,
        ttsWarning,
      });
    } catch (err: any) {
      const rawMsg = String(err?.message || err || 'Erro ao processar simulador.');
      console.error('[Simulator API] Error:', rawMsg);

      if (
        rawMsg.includes('GEMINI_API_KEY_MISSING') ||
        rawMsg.includes('API_KEY_INVALID') ||
        rawMsg.includes('PERMISSION_DENIED') ||
        err?.status === 403
      ) {
        return res.status(400).json({
          error:
            'Chave da API Gemini ausente ou inválida. Verifique sua GEMINI_API_KEY no painel Settings > Secrets.',
        });
      }
      if (rawMsg.includes('RESOURCE_EXHAUSTED') || err?.status === 429) {
        return res.status(429).json({
          error:
            'Limite de uso da API Gemini atingido no momento. Tente novamente em instantes ou verifique sua cota em Settings > Secrets.',
        });
      }
      if (rawMsg.includes('NOT_FOUND') || err?.status === 404) {
        return res.status(404).json({
          error: 'Modelo Gemini indisponível ou não encontrado.',
        });
      }

      return res.status(500).json({
        error: 'Erro ao comunicar com o Simulador Gemini. Tente novamente.',
      });
    }
  });

  // --- SOCKET.IO REAL-TIME SIGNALING & MATCHMAKING ---

  io.on('connection', (socket: Socket) => {
    console.log(`[Socket Connected] ID: ${socket.id}`);

    // Auth Identification & Seamless Room Recovery
    socket.on('auth:identify', (data: { userId: string; username: string; unique_code: string; activeRoomId?: string | null }) => {
      if (!data?.userId) return;

      const user = db.users.find((u) => u.id === data.userId);
      if (user?.status === 'banned') {
        socket.emit('user:banned', { reason: user.ban_reason });
        socket.disconnect();
        return;
      }

      // Clean up any previous identity bound to this same socket (e.g. account switch / re-login)
      const prevUserId = socketUsers.get(socket.id);
      const prevMeta = socketData.get(socket.id);
      if (prevUserId && prevUserId !== data.userId && userSockets.has(prevUserId)) {
        const oldSet = userSockets.get(prevUserId)!;
        oldSet.delete(socket.id);
        if (oldSet.size === 0) {
          userSockets.delete(prevUserId);
          broadcastUserPresence(prevUserId, 'offline');
        }
      }

      const rawCode = String(data.unique_code || user?.unique_code || '').trim().toUpperCase();
      const code = rawCode ? (rawCode.startsWith('#') ? rawCode : `#${rawCode}`) : '';

      if (prevMeta?.unique_code && prevMeta.unique_code !== code && codeSockets.has(prevMeta.unique_code)) {
        const oldCodeSet = codeSockets.get(prevMeta.unique_code)!;
        oldCodeSet.delete(socket.id);
        if (oldCodeSet.size === 0) {
          codeSockets.delete(prevMeta.unique_code);
        }
      }

      socketUsers.set(socket.id, data.userId);
      socketData.set(socket.id, {
        userId: data.userId,
        username: data.username || user?.username || 'Usuário',
        unique_code: code,
      });

      if (!userSockets.has(data.userId)) {
        userSockets.set(data.userId, new Set());
      }
      userSockets.get(data.userId)!.add(socket.id);

      if (code) {
        if (!codeSockets.has(code)) {
          codeSockets.set(code, new Set());
        }
        codeSockets.get(code)!.add(socket.id);
      }

      // Deliver any currently ringing direct calls targeted at this user/code that arrived while offline
      for (const [pendingCallId, pendingCall] of activeCalls.entries()) {
        if (
          !pendingCall.isClientWidget &&
          pendingCall.callerSocketId !== socket.id &&
          ((code && pendingCall.receiverCode.toUpperCase() === code) ||
            (pendingCall.receiverId && pendingCall.receiverId === data.userId))
        ) {
          if (!pendingCall.targetSockets) pendingCall.targetSockets = [];
          if (!pendingCall.targetSockets.includes(socket.id)) {
            pendingCall.targetSockets.push(socket.id);
          }
          if (!pendingCall.receiverSocketId) {
            pendingCall.receiverSocketId = socket.id;
          }
          socket.emit('call:incoming', {
            callId: pendingCallId,
            callerSocketId: pendingCall.callerSocketId,
            caller: pendingCall.callerUser || {
              id: pendingCall.callerCode,
              username: 'Usuário',
              unique_code: pendingCall.callerCode,
            },
            callType: pendingCall.callType || 'video',
          });
          if (pendingCall.targetUser) {
            io.to(pendingCall.callerSocketId).emit('call:ringing', {
              callId: pendingCallId,
              isOffline: false,
              targetUser: pendingCall.targetUser,
            });
          }
        }
      }

      // Check if this user dropped briefly from an active room and is reconnecting within grace period
      for (const [key, pending] of pendingDisconnects.entries()) {
        if (pending.userId === data.userId && (!data.activeRoomId || data.activeRoomId === pending.roomId)) {
          clearTimeout(pending.timer);
          pendingDisconnects.delete(key);

          const room = activeRooms.get(pending.roomId);
          if (room) {
            room.delete(pending.oldSocketId);
            room.add(socket.id);
            socket.join(pending.roomId);

            const meta = roomMetadata.get(pending.roomId);
            if (meta) {
              if (meta.hostSocketId === pending.oldSocketId) {
                meta.hostSocketId = socket.id;
              }
              if (meta.guestSocketIds.has(pending.oldSocketId)) {
                meta.guestSocketIds.delete(pending.oldSocketId);
                meta.guestSocketIds.add(socket.id);
              }
            }

            // Notify room peers to update socketId mapping and trigger ICE restart
            socket.to(pending.roomId).emit('room:peer_reconnected', {
              roomId: pending.roomId,
              oldSocketId: pending.oldSocketId,
              newSocketId: socket.id,
              peer: {
                id: data.userId,
                username: data.username || user?.username || 'Usuário',
                unique_code: code,
                avatar: user?.avatar,
                country: user?.country,
              },
            });

            socket.emit('room:resumed', {
              roomId: pending.roomId,
              oldSocketId: pending.oldSocketId,
              newSocketId: socket.id,
            });
            console.log(`[Room Recovery] User ${code} reconnected to ${pending.roomId} seamlessly.`);
          }
        }
      }

      // Broadcast user online status and full active directory
      broadcastUserPresence(data.userId, 'online');
      broadcastOnlineUsers();
      notifyAdminsOnlineChanged();
      socket.emit('auth:identified', { success: true, socketId: socket.id });
    });

    socket.on('auth:logout', () => {
      const prevUserId = socketUsers.get(socket.id);
      const prevMeta = socketData.get(socket.id);
      if (prevUserId && userSockets.has(prevUserId)) {
        const set = userSockets.get(prevUserId)!;
        set.delete(socket.id);
        if (set.size === 0) {
          userSockets.delete(prevUserId);
          broadcastUserPresence(prevUserId, 'offline');
        }
      }
      if (prevMeta?.unique_code && codeSockets.has(prevMeta.unique_code)) {
        const cSet = codeSockets.get(prevMeta.unique_code)!;
        cSet.delete(socket.id);
        if (cSet.size === 0) {
          codeSockets.delete(prevMeta.unique_code);
        }
      }
      socketUsers.delete(socket.id);
      socketData.delete(socket.id);
      socketActivity.delete(socket.id);
      broadcastOnlineUsers();
      notifyAdminsOnlineChanged();
    });

    socket.on('user:activity', (data: { activity: string }) => {
      if (data?.activity) {
        socketActivity.set(socket.id, data.activity);
        notifyAdminsOnlineChanged();
      }
    });

    // --- ADMIN LIVE MODERATION MONITOR (SPY) SIGNALING ---
    socket.on('admin:spy_start', (data?: { targetSocketIds?: string[] }) => {
      if (!isAdminSocket(socket.id)) return;
      const targets = getOnlineSpyTargets();
      socket.emit('admin:spy_targets', targets);

      const filterSet = Array.isArray(data?.targetSocketIds) && data!.targetSocketIds.length > 0
        ? new Set(data!.targetSocketIds)
        : null;

      targets.forEach((t) => {
        if (!filterSet || filterSet.has(t.socketId)) {
          io.to(t.socketId).emit('spy:offer_request', { adminSocketId: socket.id });
        }
      });
    });

    socket.on('admin:spy_stop', (data?: { targetSocketId?: string }) => {
      if (!isAdminSocket(socket.id)) return;
      if (data?.targetSocketId) {
        io.to(data.targetSocketId).emit('spy:close_peer', { adminSocketId: socket.id });
      } else {
        for (const [sId] of socketData.entries()) {
          if (sId !== socket.id) {
            io.to(sId).emit('spy:close_peer', { adminSocketId: socket.id });
          }
        }
      }
    });

    socket.on('spy:webrtc_offer', (payload: { toAdminSocketId: string; sdp: any; activity?: string }) => {
      if (!payload?.toAdminSocketId || !isAdminSocket(payload.toAdminSocketId)) return;
      const uData = socketData.get(socket.id);
      const uProfile = uData ? db.users.find((u) => u.id === uData.userId) : undefined;
      io.to(payload.toAdminSocketId).emit('spy:webrtc_offer', {
        fromSocketId: socket.id,
        userId: uData?.userId || socket.id,
        username: uData?.username || 'Usuário',
        unique_code: uData?.unique_code || '',
        avatar: uProfile?.avatar,
        country: uProfile?.country,
        activity: payload.activity || socketActivity.get(socket.id) || 'online',
        sdp: payload.sdp,
      });
    });

    socket.on('spy:webrtc_answer', (payload: { toSocketId: string; sdp: any }) => {
      if (!isAdminSocket(socket.id) || !payload?.toSocketId) return;
      io.to(payload.toSocketId).emit('spy:webrtc_answer', {
        adminSocketId: socket.id,
        sdp: payload.sdp,
      });
    });

    socket.on('spy:ice_candidate', (payload: { toSocketId: string; candidate: any }) => {
      if (!payload?.toSocketId || !payload?.candidate) return;
      io.to(payload.toSocketId).emit('spy:ice_candidate', {
        fromSocketId: socket.id,
        candidate: payload.candidate,
      });
    });

    socket.on('connection:keepalive', () => {
      // Lightweight heartbeat to keep TCP/WebSocket connections open through proxies
    });

    socket.on('presence:request_online_list', () => {
      broadcastOnlineUsers();
    });

    // --- ROULETTE MATCHMAKING (Strict Region, Gender & Package Enforcement) ---

    function clearRouletteTimers(roomId: string) {
      const timers = rouletteRoomTimers.get(roomId);
      if (timers) {
        timers.forEach((t) => clearTimeout(t));
        rouletteRoomTimers.delete(roomId);
      }
    }

    function isCompatibleMatch(a: QueueItem, b: QueueItem): boolean {
      if (a.userId === b.userId) return false;
      if (a.regionFilter !== 'all' && b.userRegion !== a.regionFilter) return false;
      if (b.regionFilter !== 'all' && a.userRegion !== b.regionFilter) return false;
      if (a.genderFilter !== 'all' && b.userGender !== a.genderFilter) return false;
      if (b.genderFilter !== 'all' && a.userGender !== b.genderFilter) return false;
      return true;
    }

    function tryMatchUsers() {
      if (rouletteQueue.length < 2) return;

      // Clean up stale or disconnected sockets
      rouletteQueue = rouletteQueue.filter((q) => {
        const sock = io.sockets.sockets.get(q.socketId);
        return sock && sock.connected;
      });

      let matchedAny = true;
      while (matchedAny && rouletteQueue.length >= 2) {
        matchedAny = false;
        for (let i = 0; i < rouletteQueue.length; i++) {
          for (let j = i + 1; j < rouletteQueue.length; j++) {
            if (isCompatibleMatch(rouletteQueue[i], rouletteQueue[j])) {
              const peer1 = rouletteQueue[i];
              const peer2 = rouletteQueue[j];
              rouletteQueue.splice(j, 1);
              rouletteQueue.splice(i, 1);
              createRouletteRoom(peer1, peer2);
              matchedAny = true;
              break;
            }
          }
          if (matchedAny) break;
        }
      }
    }

    function buildQueueItem(sockId: string, uId: string, payload?: { filter?: string; regionFilter?: string; genderFilter?: string }): QueueItem {
      const uProfile = db.users.find((u) => u.id === uId);
      const pkgId: AccessPackageId = uProfile?.access_package || 'pacote_01_gratuito';
      const pkg = getPackageConfig(pkgId);
      const allowFilters = uProfile?.role === 'admin' || (pkg.canChooseRegion && pkg.canChooseGender);

      const requestedRegion = payload?.regionFilter || payload?.filter || 'all';
      const requestedGender = payload?.genderFilter || 'all';

      return {
        socketId: sockId,
        userId: uId,
        regionFilter: allowFilters ? requestedRegion : 'all',
        genderFilter: allowFilters ? requestedGender : 'all',
        userRegion: inferRegionFromCountry(uProfile?.country, uProfile?.region),
        userGender: uProfile?.gender || 'unspecified',
        accessPackage: pkgId,
        joinedAt: Date.now(),
      };
    }

    function createRouletteRoom(peer1: QueueItem, peer2: QueueItem) {
      const roomId = `room_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      activeRooms.set(roomId, new Set([peer1.socketId, peer2.socketId]));

      const data1 = socketData.get(peer1.socketId) || { userId: peer1.userId, username: 'Usuário', unique_code: '' };
      const data2 = socketData.get(peer2.socketId) || { userId: peer2.userId, username: 'Usuário', unique_code: '' };

      const userProfile1 = db.users.find((u) => u.id === peer1.userId);
      const userProfile2 = db.users.find((u) => u.id === peer2.userId);

      const pkg1 = getPackageConfig(userProfile1?.access_package);
      const pkg2 = getPackageConfig(userProfile2?.access_package);

      const sock1 = io.sockets.sockets.get(peer1.socketId);
      const sock2 = io.sockets.sockets.get(peer2.socketId);

      if (sock1) sock1.join(roomId);
      if (sock2) sock2.join(roomId);

      // Peer 1 is the WebRTC initiator (creates offer)
      io.to(peer1.socketId).emit('roulette:matched', {
        roomId,
        isInitiator: true,
        peerSocketId: peer2.socketId,
        sessionDurationSeconds: pkg1.durationSeconds,
        peer: {
          id: data2.userId,
          username: data2.username,
          unique_code: data2.unique_code,
          country: userProfile2?.country || 'Global 🌐',
          region: inferRegionFromCountry(userProfile2?.country, userProfile2?.region),
          gender: userProfile2?.gender || 'unspecified',
          access_package: userProfile2?.access_package || 'pacote_01_gratuito',
          intent_teach_classes: userProfile2?.intent_teach_classes,
          teach_subjects: userProfile2?.teach_subjects,
          teach_description: userProfile2?.teach_description,
          avatar: userProfile2?.avatar,
        },
      });

      // Peer 2 waits for offer
      io.to(peer2.socketId).emit('roulette:matched', {
        roomId,
        isInitiator: false,
        peerSocketId: peer1.socketId,
        sessionDurationSeconds: pkg2.durationSeconds,
        peer: {
          id: data1.userId,
          username: data1.username,
          unique_code: data1.unique_code,
          country: userProfile1?.country || 'Global 🌐',
          region: inferRegionFromCountry(userProfile1?.country, userProfile1?.region),
          gender: userProfile1?.gender || 'unspecified',
          access_package: userProfile1?.access_package || 'pacote_01_gratuito',
          intent_teach_classes: userProfile1?.intent_teach_classes,
          teach_subjects: userProfile1?.teach_subjects,
          teach_description: userProfile1?.teach_description,
          avatar: userProfile1?.avatar,
        },
      });

      // Server-side per-package duration enforcement (drops connection automatically when timer expires)
      const scheduleDrop = (targetSocketId: string, otherSocketId: string, pkgCfg: typeof pkg1) =>
        setTimeout(() => {
          if (!activeRooms.has(roomId)) return;
          clearRouletteTimers(roomId);
          activeRooms.delete(roomId);
          io.to(targetSocketId).emit('roulette:timeout_ended', {
            reason: `Tempo limite de ${pkgCfg.durationLabel} (${pkgCfg.shortName}) atingido. A conexão foi encerrada.`,
            durationSeconds: pkgCfg.durationSeconds,
          });
          io.to(otherSocketId).emit('roulette:peer_left', {
            reason: 'O tempo da sessão do parceiro expirou.',
          });
        }, pkgCfg.durationSeconds * 1000);

      rouletteRoomTimers.set(roomId, [
        scheduleDrop(peer1.socketId, peer2.socketId, pkg1),
        scheduleDrop(peer2.socketId, peer1.socketId, pkg2),
      ]);
    }

    socket.on('roulette:join_queue', (payload: { filter?: string; regionFilter?: string; genderFilter?: string }) => {
      const userId = socketUsers.get(socket.id);
      if (!userId) return;

      // Remove any existing entry for this socket
      rouletteQueue = rouletteQueue.filter((q) => q.socketId !== socket.id);

      const item = buildQueueItem(socket.id, userId, payload);
      rouletteQueue.push(item);

      socket.emit('roulette:queue_status', { inQueue: true, position: rouletteQueue.length });
      tryMatchUsers();
    });

    socket.on('roulette:leave_queue', () => {
      rouletteQueue = rouletteQueue.filter((q) => q.socketId !== socket.id);
      socket.emit('roulette:queue_status', { inQueue: false });
    });

    socket.on('roulette:next', (payload: { roomId?: string; rejoin?: boolean; regionFilter?: string; genderFilter?: string }) => {
      const { roomId, rejoin } = payload || {};
      if (roomId && activeRooms.has(roomId)) {
        clearRouletteTimers(roomId);
        const room = activeRooms.get(roomId)!;
        room.forEach((sId) => {
          if (sId !== socket.id) {
            io.to(sId).emit('roulette:peer_left', { reason: 'O parceiro passou para o próximo.' });
          }
        });
        activeRooms.delete(roomId);
      }

      const userId = socketUsers.get(socket.id);
      if (rejoin && userId) {
        rouletteQueue = rouletteQueue.filter((q) => q.socketId !== socket.id);
        rouletteQueue.push(buildQueueItem(socket.id, userId, payload));
        socket.emit('roulette:queue_status', { inQueue: true, position: rouletteQueue.length });
        tryMatchUsers();
      }
    });

    // --- DIRECT CALL SIGNALING (TELEPHONE STYLE) ---

    socket.on('call:dial', (data: { targetCode: string; callType: 'video' | 'audio'; callerInfo?: any }) => {
      let callerId = socketUsers.get(socket.id);
      let callerData = socketData.get(socket.id);

      // Auto-identify if caller passed credentials in dial payload
      if (!callerId && data.callerInfo && typeof data.callerInfo.id === 'string') {
        const cId: string = data.callerInfo.id;
        callerId = cId;
        const rawCallerCode = String(data.callerInfo.unique_code || '').trim().toUpperCase();
        const code = rawCallerCode ? (rawCallerCode.startsWith('#') ? rawCallerCode : `#${rawCallerCode}`) : '';
        socketUsers.set(socket.id, cId);
        socketData.set(socket.id, {
          userId: cId,
          username: String(data.callerInfo.username || 'Usuário'),
          unique_code: code,
        });
        if (!userSockets.has(cId)) userSockets.set(cId, new Set());
        userSockets.get(cId)!.add(socket.id);
        if (code) {
          if (!codeSockets.has(code)) codeSockets.set(code, new Set());
          codeSockets.get(code)!.add(socket.id);
        }
        callerData = socketData.get(socket.id);
        broadcastOnlineUsers();
      }

      if (!callerId) {
        return socket.emit('call:error', { message: 'Você precisa estar autenticado na plataforma para ligar.' });
      }

      const rawTarget = String(data.targetCode || '').trim().toUpperCase();
      let cleanCode = rawTarget;
      if (/^\d{4,}$/.test(rawTarget)) {
        cleanCode = `#CR-${rawTarget}`;
      } else if (rawTarget.startsWith('CR-')) {
        cleanCode = `#${rawTarget}`;
      } else if (rawTarget && !rawTarget.startsWith('#')) {
        cleanCode = `#${rawTarget}`;
      }

      let targetUser: any = db.users.find((u) => u.unique_code.toUpperCase() === cleanCode);

      // Fallback: resolve connected user from socket maps (e.g. standalone/local registered account)
      if (!targetUser) {
        for (const [sId, sMeta] of socketData.entries()) {
          if (sMeta.unique_code.toUpperCase() === cleanCode) {
            const s = io.sockets.sockets.get(sId);
            if (s && s.connected) {
              targetUser = {
                id: sMeta.userId,
                username: sMeta.username,
                unique_code: cleanCode,
                status: 'online',
              };
              break;
            }
          }
        }
      }

      if (!targetUser) {
        return socket.emit('call:error', { message: `Código ${cleanCode} não existe na plataforma.` });
      }

      if (
        targetUser.id === callerId ||
        (callerData && callerData.unique_code.toUpperCase() === cleanCode)
      ) {
        return socket.emit('call:error', { message: 'Você não pode ligar para o seu próprio código.' });
      }

      if (targetUser.status === 'banned') {
        return socket.emit('call:error', { message: 'Este usuário está indisponível ou suspenso pela moderação.' });
      }

      const callerUser = db.users.find((u) => u.id === callerId) || {
        id: callerId,
        username: callerData?.username || data.callerInfo?.username || 'Usuário',
        unique_code: callerData?.unique_code || data.callerInfo?.unique_code || '',
        avatar: data.callerInfo?.avatar,
        country: data.callerInfo?.country,
      };

      const callId = `call_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

      // Locate recipient sockets by unique_code, user.id, AND live socketData scan
      const socketsByCode = codeSockets.get(cleanCode) || new Set<string>();
      const socketsById = userSockets.get(targetUser.id) || new Set<string>();
      const allTargetSockets = new Set<string>([...socketsByCode, ...socketsById]);
      for (const [sId, sMeta] of socketData.entries()) {
        if (sMeta.unique_code.toUpperCase() === cleanCode || sMeta.userId === targetUser.id) {
          allTargetSockets.add(sId);
        }
      }

      // Filter for currently connected recipient sockets (excluding the dialing socket itself)
      const activeRecipientSockets: string[] = [];
      allTargetSockets.forEach((sId) => {
        if (sId !== socket.id) {
          const s = io.sockets.sockets.get(sId);
          if (s && s.connected) {
            activeRecipientSockets.push(sId);
          }
        }
      });

      console.log(
        `[call:dial] From: ${callerUser.unique_code} (${socket.id}) To: ${cleanCode} (${targetUser.id}). Active recipient sockets: ${activeRecipientSockets.length}`
      );

      const callerPayload = {
        id: callerId,
        username: callerUser.username,
        unique_code: callerUser.unique_code,
        avatar: callerUser.avatar,
        country: callerUser.country,
      };

      const targetPayload = {
        id: targetUser.id,
        username: targetUser.username,
        unique_code: targetUser.unique_code,
        avatar: targetUser.avatar,
        country: targetUser.country,
      };

      const callType = data.callType || 'video';
      const timeoutMs = activeRecipientSockets.length > 0 ? 35000 : 30000;

      const timeoutTimer = setTimeout(() => {
        const existing = activeCalls.get(callId);
        if (!existing) return;
        activeCalls.delete(callId);
        const hadRecipients = (existing.targetSockets?.length || 0) > 0;
        socket.emit('call:rejected', {
          callId,
          reason: hadRecipients
            ? 'O destinatário não atendeu a chamada a tempo.'
            : `${targetUser.username} (${cleanCode}) está offline ou sem aba conectada no momento.`,
        });
        existing.targetSockets?.forEach((sId) => {
          io.to(sId).emit('call:ended', { callId, reason: 'Chamada perdida.' });
        });
      }, timeoutMs);

      activeCalls.set(callId, {
        callerSocketId: socket.id,
        receiverSocketId: activeRecipientSockets[0] || '',
        receiverId: targetUser.id,
        callerCode: callerUser.unique_code || '',
        receiverCode: targetUser.unique_code,
        startTime: Date.now(),
        timeoutTimer,
        targetSockets: activeRecipientSockets,
        callType,
        callerUser: callerPayload,
        targetUser: targetPayload,
      });

      // Notify caller immediately with accurate online/offline ringing status
      socket.emit('call:ringing', {
        callId,
        isOffline: activeRecipientSockets.length === 0,
        targetUser: targetPayload,
      });

      // Send incoming call modal & ringtone to ALL active sockets of the recipient
      activeRecipientSockets.forEach((sId) => {
        io.to(sId).emit('call:incoming', {
          callId,
          callerSocketId: socket.id,
          caller: callerPayload,
          callType,
        });
      });
    });

    // --- EMBEDDED WEBSITE WIDGET AUDIO CALL SIGNALING ---
    socket.on(
      'widget:call_start',
      (data: { ownerCode: string; name: string; whatsapp: string; email: string; message: string; sourceUrl?: string }) => {
        const result = dispatchWidgetCall(
          {
            ownerCode: data?.ownerCode || '',
            name: data?.name || 'Visitante',
            whatsapp: data?.whatsapp || '',
            email: data?.email || '',
            message: data?.message || '',
            sourceUrl: data?.sourceUrl,
          },
          socket
        );

        if (result.ok === false) {
          return socket.emit('call:error', { message: result.error });
        }

        if (!result.ownerOnline) {
          return socket.emit('widget:owner_offline', {
            lead: result.lead,
            clientLabel: result.clientLabel,
          });
        }

        socket.emit('widget:call_ringing', {
          callId: result.callId,
          lead: result.lead,
          clientLabel: result.clientLabel,
          ownerName: result.ownerName,
        });
      }
    );

    // Attach or reattach a widget socket to an existing call (e.g., started via HTTP fallback or after reconnect)
    socket.on('widget:attach_call', (data: { callId: string }) => {
      const callId = String(data?.callId || '');
      if (!callId) return;
      const wState = widgetCallStates.get(callId);
      if (!wState) return;

      const oldSocketId = wState.callerSocketId;
      if (pendingWidgetDisconnects.has(callId)) {
        clearTimeout(pendingWidgetDisconnects.get(callId)!);
        pendingWidgetDisconnects.delete(callId);
      }
      wState.callerSocketId = socket.id;
      socketUsers.set(socket.id, wState.lead.id);
      socketData.set(socket.id, {
        userId: wState.lead.id,
        username: wState.clientLabel,
        unique_code: 'WEB-CHAT',
      });

      const pendingCall = activeCalls.get(callId);
      if (pendingCall) {
        pendingCall.callerSocketId = socket.id;
      }

      if (wState.status === 'accepted' && wState.ownerSocketId) {
        const roomId = wState.roomId;
        let room = activeRooms.get(roomId);
        if (!room) {
          room = new Set([wState.ownerSocketId]);
          activeRooms.set(roomId, room);
        }
        if (oldSocketId && oldSocketId !== 'http_widget') {
          room.delete(oldSocketId);
        }
        room.add(socket.id);
        socket.join(roomId);

        const ownerSock = io.sockets.sockets.get(wState.ownerSocketId);
        if (ownerSock) ownerSock.join(roomId);

        const meta = roomMetadata.get(roomId);
        if (meta) {
          meta.hostUserId = wState.lead.id;
          meta.hostSocketId = socket.id;
        }

        // Notify attendant to rebind peer socket & receive WebRTC offer
        io.to(wState.ownerSocketId).emit('room:peer_reconnected', {
          roomId,
          oldSocketId: oldSocketId || 'http_widget',
          newSocketId: socket.id,
          peer: {
            id: wState.lead.id,
            username: wState.clientLabel,
            unique_code: 'ATENDIMENTO WEB',
          },
        });

        // Notify widget to initiate WebRTC offer immediately
        socket.emit('call:accepted', {
          callId,
          roomId,
          peerSocketId: wState.ownerSocketId,
          isInitiator: true,
          isHost: false,
          callType: 'audio',
          isClientWidget: true,
        });
      }
    });

    socket.on('call:accept', (data: { callId: string; callerSocketId: string }) => {
      console.log(`[call:accept] Call ${data.callId} accepted by ${socket.id}`);

      // CRITICAL: Clear ringing timeout and remove from pending activeCalls so call never drops at 35s!
      const pendingCall = activeCalls.get(data.callId);
      const wState = widgetCallStates.get(data.callId);
      const effectiveCallerSocketId =
        (wState && wState.callerSocketId && wState.callerSocketId !== 'http_widget'
          ? wState.callerSocketId
          : pendingCall?.callerSocketId) || data.callerSocketId;

      if (pendingCall) {
        if (pendingCall.timeoutTimer) {
          clearTimeout(pendingCall.timeoutTimer);
        }
        // Dismiss incoming call modal on any other tabs of the same receiver
        pendingCall.targetSockets?.forEach((sId) => {
          if (sId !== socket.id) {
            io.to(sId).emit('call:dismiss_incoming', { callId: data.callId });
          }
        });
        activeCalls.delete(data.callId);
      }

      if (wState) {
        wState.status = 'accepted';
        wState.ownerSocketId = socket.id;
      }

      if (pendingCall?.isClientWidget && pendingCall.clientMeta?.leadId && Array.isArray(db.clientLeads)) {
        const lead = db.clientLeads.find((l) => l.id === pendingCall.clientMeta!.leadId);
        if (lead) {
          lead.status = 'em_atendimento';
          saveDatabase(db);
          socket.emit('client:lead_updated', { lead });
        }
      }

      const roomId = `direct_room_${data.callId}`;
      const callerLiveSocket =
        effectiveCallerSocketId !== 'http_widget'
          ? io.sockets.sockets.get(effectiveCallerSocketId)
          : undefined;
      activeRooms.set(roomId, new Set(callerLiveSocket ? [effectiveCallerSocketId, socket.id] : [socket.id]));

      if (callerLiveSocket) callerLiveSocket.join(roomId);
      socket.join(roomId);

      const callerData = socketData.get(effectiveCallerSocketId);
      const receiverData = socketData.get(socket.id);
      const callerProfile = callerData ? db.users.find((u) => u.id === callerData.userId) : undefined;
      const receiverProfile = receiverData ? db.users.find((u) => u.id === receiverData.userId) : undefined;

      roomMetadata.set(roomId, {
        hostUserId: callerData?.userId || wState?.lead.id || '',
        hostSocketId: effectiveCallerSocketId,
        callId: data.callId,
        type: 'direct',
        guestSocketIds: new Set(),
      });

      // Caller initiates the WebRTC offer (and is the Host who can invite guests)
      if (callerLiveSocket) {
        io.to(effectiveCallerSocketId).emit('call:accepted', {
          callId: data.callId,
          roomId,
          peerSocketId: socket.id,
          isInitiator: true,
          isHost: !pendingCall?.isClientWidget,
          callType: pendingCall?.callType || 'video',
          isClientWidget: !!pendingCall?.isClientWidget,
          clientMeta: pendingCall?.clientMeta,
          peer: receiverData
            ? {
                id: receiverData.userId,
                username: receiverData.username,
                unique_code: receiverData.unique_code,
                avatar: receiverProfile?.avatar,
                country: receiverProfile?.country,
              }
            : undefined,
        });
      }

      // Receiver will answer the offer
      socket.emit('call:accepted', {
        callId: data.callId,
        roomId,
        peerSocketId: effectiveCallerSocketId,
        isInitiator: false,
        isHost: !!pendingCall?.isClientWidget,
        callType: pendingCall?.callType || 'video',
        isClientWidget: !!pendingCall?.isClientWidget,
        clientMeta: pendingCall?.clientMeta,
        peer: callerData
          ? {
              id: callerData.userId,
              username: pendingCall?.clientMeta?.clientLabel || callerData.username,
              unique_code: pendingCall?.isClientWidget ? 'ATENDIMENTO WEB' : callerData.unique_code,
              avatar: callerProfile?.avatar || (pendingCall?.clientMeta ? generateLocalAvatar(pendingCall.clientMeta.name) : undefined),
              country: callerProfile?.country || (pendingCall?.isClientWidget ? 'Site Externo' : undefined),
            }
          : wState
          ? {
              id: wState.lead.id,
              username: wState.clientLabel,
              unique_code: 'ATENDIMENTO WEB',
              avatar: generateLocalAvatar(wState.lead.name),
              country: 'Site Externo',
            }
          : undefined,
      });
    });

    socket.on('call:reject', (data: { callId: string; callerSocketId: string; reason?: string }) => {
      console.log(`[call:reject] Call ${data.callId} rejected by ${socket.id}`);
      const pendingCall = activeCalls.get(data.callId);
      const wState = widgetCallStates.get(data.callId);
      if (wState) {
        wState.status = 'rejected';
        wState.reason = data.reason || 'Chamada recusada pelo destinatário.';
      }
      if (pendingCall?.timeoutTimer) {
        clearTimeout(pendingCall.timeoutTimer);
      }
      pendingCall?.targetSockets?.forEach((sId) => {
        if (sId !== socket.id) {
          io.to(sId).emit('call:dismiss_incoming', { callId: data.callId });
        }
      });
      if (pendingCall?.isClientWidget && pendingCall.clientMeta?.leadId && Array.isArray(db.clientLeads)) {
        const lead = db.clientLeads.find((l) => l.id === pendingCall.clientMeta!.leadId);
        if (lead) {
          lead.status = 'retornar';
          saveDatabase(db);
          socket.emit('client:lead_updated', { lead });
        }
      }
      activeCalls.delete(data.callId);
      const targetCallerId = wState?.callerSocketId || data.callerSocketId;
      if (targetCallerId && targetCallerId !== 'http_widget') {
        io.to(targetCallerId).emit('call:rejected', {
          callId: data.callId,
          reason: data.reason || 'Chamada recusada pelo destinatário.',
        });
      }
    });

    // --- MULTI-PARTY DIRECT CALL INVITATION (ADD GUEST WITH VIDEO OVERLAY) ---

    socket.on('call:invite', (data: { roomId: string; callId: string; targetCode: string; callerInfo?: any }) => {
      const hostId = socketUsers.get(socket.id) || data.callerInfo?.id;
      const hostData = socketData.get(socket.id);
      if (!hostId) {
        return socket.emit('call:invite_error', { message: 'Você precisa estar autenticado para convidar.' });
      }

      const cleanCode = (data.targetCode || '').trim().toUpperCase();
      const targetUser = db.users.find((u) => u.unique_code.toUpperCase() === cleanCode);
      if (!targetUser) {
        return socket.emit('call:invite_error', { message: `Código ${cleanCode} não encontrado.` });
      }

      if (targetUser.id === hostId || (hostData && hostData.unique_code === cleanCode)) {
        return socket.emit('call:invite_error', { message: 'Você já está nesta chamada.' });
      }

      if (targetUser.status === 'banned') {
        return socket.emit('call:invite_error', { message: 'Este usuário está suspenso.' });
      }

      // Ensure room exists (even if promoted from virtual/solo session)
      let roomId = data.roomId;
      if (!roomId || !activeRooms.has(roomId)) {
        roomId = roomId || `direct_room_${data.callId || Date.now()}`;
        activeRooms.set(roomId, new Set([socket.id]));
        socket.join(roomId);
        roomMetadata.set(roomId, {
          hostUserId: hostId,
          hostSocketId: socket.id,
          callId: data.callId || roomId,
          type: 'direct',
          guestSocketIds: new Set(),
        });
      }

      const roomMembers = activeRooms.get(roomId)!;

      // Check if target is already in the room
      for (const sId of roomMembers) {
        const sData = socketData.get(sId);
        if (sData && (sData.userId === targetUser.id || sData.unique_code === cleanCode)) {
          return socket.emit('call:invite_error', { message: `${targetUser.username} já está participando desta chamada.` });
        }
      }

      // Find active recipient sockets
      const socketsByCode = codeSockets.get(cleanCode) || new Set<string>();
      const socketsById = userSockets.get(targetUser.id) || new Set<string>();
      const allTargetSockets = new Set<string>([...socketsByCode, ...socketsById]);
      const activeRecipientSockets: string[] = [];
      allTargetSockets.forEach((sId) => {
        if (sId !== socket.id && !roomMembers.has(sId)) {
          const s = io.sockets.sockets.get(sId);
          if (s && s.connected) activeRecipientSockets.push(sId);
        }
      });

      if (activeRecipientSockets.length === 0) {
        return socket.emit('call:invite_error', {
          message: `${targetUser.username} (${cleanCode}) está offline no momento. Abra outra aba com essa conta para testar ao vivo.`,
        });
      }

      const hostProfile = db.users.find((u) => u.id === hostId);
      const inviteId = `inv_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

      const existingParticipants: { username: string; unique_code: string }[] = [];
      roomMembers.forEach((sId) => {
        const mData = socketData.get(sId);
        if (mData && sId !== socket.id) {
          existingParticipants.push({ username: mData.username, unique_code: mData.unique_code });
        }
      });

      const timeoutTimer = setTimeout(() => {
        if (activeInvites.has(inviteId)) {
          activeInvites.delete(inviteId);
          socket.emit('call:invite_rejected', {
            inviteId,
            targetName: targetUser.username,
            targetCode: targetUser.unique_code,
            reason: 'Não respondeu ao convite a tempo.',
          });
          activeRecipientSockets.forEach((sId) => {
            io.to(sId).emit('call:dismiss_incoming', { callId: inviteId });
          });
        }
      }, 35000);

      activeInvites.set(inviteId, {
        inviteId,
        roomId,
        callId: data.callId || roomId,
        hostSocketId: socket.id,
        targetUserId: targetUser.id,
        targetCode: targetUser.unique_code,
        targetSockets: activeRecipientSockets,
        timeoutTimer,
      });

      socket.emit('call:invite_sent', {
        inviteId,
        targetUser: {
          id: targetUser.id,
          username: targetUser.username,
          unique_code: targetUser.unique_code,
          avatar: targetUser.avatar,
          country: targetUser.country,
        },
      });

      activeRecipientSockets.forEach((sId) => {
        io.to(sId).emit('call:incoming', {
          callId: inviteId,
          inviteId,
          roomId,
          isGroupInvite: true,
          callerSocketId: socket.id,
          caller: {
            id: hostId,
            username: hostData?.username || hostProfile?.username || 'Anfitrião',
            unique_code: hostData?.unique_code || hostProfile?.unique_code || '',
            avatar: hostProfile?.avatar,
            country: hostProfile?.country,
          },
          participants: existingParticipants,
          callType: 'video',
        });
      });
    });

    socket.on('call:accept_invite', (data: { inviteId: string; roomId: string; callId?: string; hostSocketId: string }) => {
      const invite = activeInvites.get(data.inviteId);
      if (invite) {
        if (invite.timeoutTimer) clearTimeout(invite.timeoutTimer);
        invite.targetSockets.forEach((sId) => {
          if (sId !== socket.id) {
            io.to(sId).emit('call:dismiss_incoming', { callId: data.inviteId });
          }
        });
        activeInvites.delete(data.inviteId);
      }

      const roomId = data.roomId || invite?.roomId;
      if (!roomId || !activeRooms.has(roomId)) {
        return socket.emit('call:error', { message: 'A chamada em grupo já foi encerrada.' });
      }

      const roomMembers = activeRooms.get(roomId)!;
      const meta = roomMetadata.get(roomId);

      // Build list of existing peers BEFORE adding guest
      const existingPeers: any[] = [];
      roomMembers.forEach((memberSocketId) => {
        if (memberSocketId !== socket.id) {
          const mData = socketData.get(memberSocketId);
          const mProfile = mData ? db.users.find((u) => u.id === mData.userId) : undefined;
          existingPeers.push({
            socketId: memberSocketId,
            id: mData?.userId || memberSocketId,
            username: mData?.username || 'Participante',
            unique_code: mData?.unique_code || '',
            avatar: mProfile?.avatar,
            country: mProfile?.country,
            isHost: meta ? meta.hostSocketId === memberSocketId : memberSocketId === data.hostSocketId,
            isGuest: meta ? meta.guestSocketIds.has(memberSocketId) : false,
          });
        }
      });

      // Add guest to room
      roomMembers.add(socket.id);
      if (meta) {
        meta.guestSocketIds.add(socket.id);
      }
      socket.join(roomId);

      const guestData = socketData.get(socket.id);
      const guestProfile = guestData ? db.users.find((u) => u.id === guestData.userId) : undefined;

      // 1. Send existing room state to Guest
      socket.emit('call:joined_group', {
        callId: invite?.callId || data.callId || roomId,
        roomId,
        hostSocketId: meta?.hostSocketId || data.hostSocketId,
        peers: existingPeers,
      });

      // 2. Notify ALL existing members that Guest joined (they will initiate WebRTC offers to Guest)
      socket.to(roomId).emit('room:peer_joined', {
        roomId,
        peerSocketId: socket.id,
        shouldInitiateOffer: true,
        peer: {
          socketId: socket.id,
          id: guestData?.userId || socket.id,
          username: guestData?.username || 'Convidado',
          unique_code: guestData?.unique_code || '',
          avatar: guestProfile?.avatar,
          country: guestProfile?.country,
          isHost: false,
          isGuest: true,
        },
      });

      // 3. System chat notice to everyone in the room
      io.to(roomId).emit('chat:message', {
        id: `sys_${Date.now()}`,
        sender_id: 'system',
        sender_name: 'Sistema',
        text: `${guestData?.username || 'Convidado'} (${guestData?.unique_code || ''}) entrou na chamada como convidado!`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        is_system: true,
      });
    });

    socket.on('call:reject_invite', (data: { inviteId: string; hostSocketId?: string; reason?: string }) => {
      const invite = activeInvites.get(data.inviteId);
      if (invite) {
        if (invite.timeoutTimer) clearTimeout(invite.timeoutTimer);
        invite.targetSockets.forEach((sId) => {
          if (sId !== socket.id) {
            io.to(sId).emit('call:dismiss_incoming', { callId: data.inviteId });
          }
        });
        activeInvites.delete(data.inviteId);
      }

      const guestData = socketData.get(socket.id);
      const targetHost = data.hostSocketId || invite?.hostSocketId;
      if (targetHost) {
        io.to(targetHost).emit('call:invite_rejected', {
          inviteId: data.inviteId,
          targetName: guestData?.username || 'Convidado',
          targetCode: guestData?.unique_code || invite?.targetCode || '',
          reason: data.reason || 'Convite recusado pelo usuário.',
        });
      }
    });

    socket.on('room:media_state', (data: { roomId: string; isMicMuted: boolean; isVideoDisabled: boolean }) => {
      if (data.roomId && activeRooms.has(data.roomId)) {
        socket.to(data.roomId).emit('room:media_state', {
          socketId: socket.id,
          isMicMuted: data.isMicMuted,
          isVideoDisabled: data.isVideoDisabled,
        });
      }
    });

    socket.on('call:hangup', (data: { callId?: string; roomId?: string; targetSocketId?: string }) => {
      const leaverInfo = socketData.get(socket.id);
      const widgetStateForCaller = findWidgetCallState({
        callId: data.callId,
        roomId: data.roomId,
        callerSocketId: leaverInfo?.unique_code === 'WEB-CHAT' ? socket.id : undefined,
      });

      if (
        widgetStateForCaller &&
        (leaverInfo?.unique_code === 'WEB-CHAT' || widgetStateForCaller.callerSocketId === socket.id)
      ) {
        notifyAttendantWidgetClientLeft(widgetStateForCaller, 'Cliente Saiu do Chat');
        return;
      }

      // Cancel any pending ringing call initiated by this socket
      if (data.callId && activeCalls.has(data.callId)) {
        const call = activeCalls.get(data.callId)!;
        if (call.timeoutTimer) clearTimeout(call.timeoutTimer);
        call.targetSockets?.forEach((sId) => {
          io.to(sId).emit('call:ended', { callId: data.callId, reason: 'O chamador cancelou a ligação.' });
        });
        activeCalls.delete(data.callId);
      }

      // Cancel any pending group invites sent by this socket
      for (const [invId, inv] of activeInvites.entries()) {
        if (inv.hostSocketId === socket.id) {
          if (inv.timeoutTimer) clearTimeout(inv.timeoutTimer);
          inv.targetSockets.forEach((sId) => io.to(sId).emit('call:dismiss_incoming', { callId: invId }));
          activeInvites.delete(invId);
        }
      }

      if (data.roomId && activeRooms.has(data.roomId)) {
        const room = activeRooms.get(data.roomId)!;
        const meta = roomMetadata.get(data.roomId);
        const leaverData = socketData.get(socket.id);

        room.delete(socket.id);
        socket.leave(data.roomId);
        meta?.guestSocketIds.delete(socket.id);

        if (room.size >= 2) {
          // 2+ members still in call: keep the call alive for remaining participants!
          io.to(data.roomId).emit('room:peer_left', {
            roomId: data.roomId,
            socketId: socket.id,
            username: leaverData?.username || 'Participante',
            reason: `${leaverData?.username || 'Um participante'} saiu da chamada.`,
          });
          io.to(data.roomId).emit('chat:message', {
            id: `sys_${Date.now()}`,
            sender_id: 'system',
            sender_name: 'Sistema',
            text: `${leaverData?.username || 'Participante'} saiu da conversa.`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            is_system: true,
          });
        } else {
          // Fewer than 2 members left -> end the call cleanly
          room.forEach((sId) => {
            io.to(sId).emit('call:ended', { reason: 'Chamada encerrada pelo usuário.' });
            const s = io.sockets.sockets.get(sId);
            if (s) s.leave(data.roomId!);
          });
          activeRooms.delete(data.roomId);
          roomMetadata.delete(data.roomId);
        }
        if (data.callId && widgetCallStates.has(data.callId)) {
          const wState = widgetCallStates.get(data.callId)!;
          wState.status = 'ended';
          wState.reason = 'Chamada encerrada pelo usuário.';
        }
      } else if (data.targetSocketId && data.targetSocketId !== 'virtual_peer' && data.targetSocketId !== 'mock_caller') {
        if (data.targetSocketId !== 'http_widget') {
          io.to(data.targetSocketId).emit('call:ended', { reason: 'Chamada encerrada pelo usuário.' });
        }
        if (data.callId && widgetCallStates.has(data.callId)) {
          const wState = widgetCallStates.get(data.callId)!;
          wState.status = 'ended';
          wState.reason = 'Chamada encerrada pelo usuário.';
        }
      }
    });

    // --- WEBRTC SIGNALING RELAY (P2P) ---

    socket.on('webrtc:offer', (payload: { toSocketId: string; sdp: any; roomId?: string }) => {
      io.to(payload.toSocketId).emit('webrtc:offer', {
        fromSocketId: socket.id,
        sdp: payload.sdp,
        roomId: payload.roomId,
      });
    });

    socket.on('webrtc:answer', (payload: { toSocketId: string; sdp: any; roomId?: string }) => {
      io.to(payload.toSocketId).emit('webrtc:answer', {
        fromSocketId: socket.id,
        sdp: payload.sdp,
        roomId: payload.roomId,
      });
    });

    socket.on('webrtc:ice_candidate', (payload: { toSocketId: string; candidate: any; roomId?: string }) => {
      io.to(payload.toSocketId).emit('webrtc:ice_candidate', {
        fromSocketId: socket.id,
        candidate: payload.candidate,
        roomId: payload.roomId,
      });
    });

    // --- IN-CALL CHAT & REACTIONS ---

    socket.on('chat:message', (payload: { toSocketId?: string; roomId?: string; callId?: string; text: string; senderName: string }) => {
      const sData = socketData.get(socket.id);
      const msg = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        sender_id: socket.id,
        sender_name: payload.senderName || sData?.username || 'Usuário',
        sender_code: sData?.unique_code,
        text: payload.text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      // Also persist message in widgetCallStates if this room/callId belongs to a widget session
      if (payload.callId && widgetCallStates.has(payload.callId)) {
        const wState = widgetCallStates.get(payload.callId)!;
        wState.messages.push(msg);
      } else if (payload.roomId) {
        for (const wState of widgetCallStates.values()) {
          if (wState.roomId === payload.roomId) {
            wState.messages.push(msg);
            break;
          }
        }
      }

      if (payload.roomId && activeRooms.has(payload.roomId)) {
        io.to(payload.roomId).emit('chat:message', msg);
      } else if (payload.toSocketId && payload.toSocketId !== 'http_widget') {
        io.to(payload.toSocketId).emit('chat:message', msg);
        socket.emit('chat:message', msg);
      } else {
        socket.emit('chat:message', msg);
      }
    });

    socket.on('call:reaction', (payload: { toSocketId?: string; roomId?: string; emoji: string; senderName?: string }) => {
      if (payload.roomId && activeRooms.has(payload.roomId)) {
        socket.to(payload.roomId).emit('call:reaction', {
          emoji: payload.emoji,
          senderName: payload.senderName,
        });
      } else if (payload.toSocketId) {
        io.to(payload.toSocketId).emit('call:reaction', {
          emoji: payload.emoji,
          senderName: payload.senderName,
        });
      }
    });

    // Package 04 Teacher Pix QR Code overlay on video & Bank Details relay
    socket.on(
      'call:teacher_payment_overlay',
      (payload: { roomId?: string; toSocketId?: string; visible: boolean; qrImage?: string; teacherName?: string }) => {
        const userId = socketUsers.get(socket.id);
        const uProfile = userId ? db.users.find((u) => u.id === userId) : undefined;
        if (uProfile && uProfile.access_package !== 'pacote_04_professor' && uProfile.role !== 'admin') {
          return;
        }
        const out = {
          visible: Boolean(payload?.visible),
          qrImage: payload?.qrImage || '',
          teacherName: payload?.teacherName || uProfile?.username || 'Professor',
        };
        if (payload.roomId && activeRooms.has(payload.roomId)) {
          socket.to(payload.roomId).emit('call:teacher_payment_overlay', out);
        } else if (payload.toSocketId) {
          io.to(payload.toSocketId).emit('call:teacher_payment_overlay', out);
        }
      }
    );

    socket.on(
      'call:teacher_bank_details',
      (payload: { roomId?: string; toSocketId?: string; bankDetails: string; teacherName?: string }) => {
        const userId = socketUsers.get(socket.id);
        const uProfile = userId ? db.users.find((u) => u.id === userId) : undefined;
        if (uProfile && uProfile.access_package !== 'pacote_04_professor' && uProfile.role !== 'admin') {
          return;
        }
        const out = {
          bankDetails: String(payload?.bankDetails || '').trim(),
          teacherName: payload?.teacherName || uProfile?.username || 'Professor',
        };
        if (payload.roomId && activeRooms.has(payload.roomId)) {
          socket.to(payload.roomId).emit('call:teacher_bank_details', out);
        } else if (payload.toSocketId) {
          io.to(payload.toSocketId).emit('call:teacher_bank_details', out);
        }
      }
    );

    // Disconnect handling with 12s grace period for active calls so network blips don't drop calls
    socket.on('disconnect', () => {
      console.log(`[Socket Disconnected] ID: ${socket.id}`);
      const userId = socketUsers.get(socket.id);
      const uData = socketData.get(socket.id);

      // Remove from roulette queue
      rouletteQueue = rouletteQueue.filter((q) => q.socketId !== socket.id);

      // Cancel any pending unanswered ringing calls
      for (const [callId, call] of activeCalls.entries()) {
        if (call.callerSocketId === socket.id) {
          if (call.timeoutTimer) clearTimeout(call.timeoutTimer);
          call.targetSockets?.forEach((sId) => {
            io.to(sId).emit('call:ended', { callId, reason: 'O autor da chamada desconectou.' });
          });
          activeCalls.delete(callId);
        } else if (call.receiverSocketId === socket.id) {
          if (call.timeoutTimer) clearTimeout(call.timeoutTimer);
          io.to(call.callerSocketId).emit('call:ended', { callId, reason: 'O destinatário desconectou.' });
          activeCalls.delete(callId);
        }
      }

      // Special handling when a Web Widget client disconnects: quickly notify attendant "Cliente Saiu do Chat"
      if (uData?.unique_code === 'WEB-CHAT') {
        const wState = findWidgetCallState({ callerSocketId: socket.id });
        if (wState && wState.status !== 'ended') {
          const disconnectedSockId = socket.id;
          const timer = setTimeout(() => {
            pendingWidgetDisconnects.delete(wState.callId);
            if (wState.callerSocketId === disconnectedSockId && wState.status !== 'ended') {
              notifyAttendantWidgetClientLeft(wState, 'Cliente Saiu do Chat');
            }
          }, 2500);
          pendingWidgetDisconnects.set(wState.callId, timer);
        }
      } else {
        // Grace period for active connected rooms (allows mobile Wi-Fi/4G handoff without dropping)
        for (const [roomId, members] of activeRooms.entries()) {
          if (members.has(socket.id)) {
            const meta = roomMetadata.get(roomId);
            if (meta?.type === 'direct' && userId) {
              socket.to(roomId).emit('room:peer_reconnecting', {
                roomId,
                socketId: socket.id,
                username: uData?.username || 'Participante',
              });

              const timer = setTimeout(() => {
                pendingDisconnects.delete(socket.id);
                const currentRoom = activeRooms.get(roomId);
                if (!currentRoom) return;
                currentRoom.delete(socket.id);
                meta.guestSocketIds.delete(socket.id);

                if (currentRoom.size >= 2) {
                  io.to(roomId).emit('room:peer_left', {
                    roomId,
                    socketId: socket.id,
                    username: uData?.username || 'Participante',
                    reason: `${uData?.username || 'Participante'} perdeu a conexão.`,
                  });
                } else {
                  currentRoom.forEach((sId) => {
                    io.to(sId).emit('call:ended', { reason: 'O parceiro perdeu a conexão.' });
                  });
                  activeRooms.delete(roomId);
                  roomMetadata.delete(roomId);
                }
              }, 12000);

              pendingDisconnects.set(socket.id, {
                timer,
                roomId,
                userId,
                oldSocketId: socket.id,
              });
            } else {
              // Roulette room: immediate next notification + clear timers
              clearRouletteTimers(roomId);
              members.forEach((sId) => {
                if (sId !== socket.id) {
                  io.to(sId).emit('roulette:peer_left', { reason: 'O parceiro se desconectou.' });
                  io.to(sId).emit('call:ended', { reason: 'O parceiro se desconectou.' });
                }
              });
              activeRooms.delete(roomId);
              roomMetadata.delete(roomId);
            }
          }
        }
      }

      // Cleanup user socket map
      if (userId && userSockets.has(userId)) {
        const set = userSockets.get(userId)!;
        set.delete(socket.id);
        if (set.size === 0) {
          userSockets.delete(userId);
          broadcastUserPresence(userId, 'offline');
        }
      }

      // Cleanup code socket map
      if (uData && uData.unique_code && codeSockets.has(uData.unique_code)) {
        const cSet = codeSockets.get(uData.unique_code)!;
        cSet.delete(socket.id);
        if (cSet.size === 0) {
          codeSockets.delete(uData.unique_code);
        }
      }

      socketUsers.delete(socket.id);
      socketData.delete(socket.id);
      socketActivity.delete(socket.id);
      broadcastOnlineUsers();
      notifyAdminsOnlineChanged();
    });
  });

  // --- VITE MIDDLEWARE INTEGRATION ---
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false, ws: false },
      appType: 'spa',
    });

    // HMR is disabled in this environment; prevent @vite/client from opening a failing WebSocket to port 24678
    app.get('/@vite/client', async (_req, res, next) => {
      try {
        const result = await vite.transformRequest('/@vite/client');
        if (result?.code) {
          const safeCode = result.code.replace(
            /let wsTransport = createWebSocketModuleRunnerTransport\(\{[\s\S]*?\}\);/,
            `let wsTransport = { async connect() {}, disconnect() {}, send() {} };`
          );
          res.type('application/javascript').send(safeCode);
          return;
        }
      } catch (err) {
        console.error('Error serving @vite/client without HMR:', err);
      }
      next();
    });

    app.use(vite.middlewares);
  } else {
    // Serve static files in production
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
});
