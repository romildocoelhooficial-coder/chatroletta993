import {
  User,
  Report,
  ClientLead,
  ClientLeadStatus,
  AccessPackageId,
  WorldRegionId,
  TeachSubject,
} from '../types/index.ts';
import { inferRegionFromCountry } from '../constants/packages.ts';
import { generateLocalAvatar } from './avatar.ts';

const LOCAL_USERS_KEY = 'cr_local_users';
const LOCAL_REPORTS_KEY = 'cr_local_reports';
const LOCAL_CLIENTS_KEY = 'cr_local_client_leads';

export const initialLocalUsers: (User & { password_hash: string })[] = [
  {
    id: 'user_admin_001',
    unique_code: '#CR-000001',
    username: 'Administrador Master',
    email: 'admin@chatroulette.com',
    password_hash: 'admin123',
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
    password_hash: 'user123',
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
    password_hash: 'user123',
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
    password_hash: 'user123',
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
    password_hash: 'user123',
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

export const initialLocalReports: Report[] = [
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

export class LocalDatabaseService {
  public getUsers(): (User & { password_hash: string })[] {
    try {
      const stored = localStorage.getItem(LOCAL_USERS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as (User & { password_hash: string })[];
        const defaultPackages: Record<string, AccessPackageId> = {
          user_admin_001: 'pacote_04_professor',
          user_002: 'pacote_04_professor',
          user_003: 'pacote_03_premium',
          user_004: 'pacote_02_boas_vindas',
          user_005: 'pacote_01_gratuito',
        };
        return parsed.map((u) => ({
          ...u,
          payment_status: u.payment_status === 'pago' ? 'pago' : 'pendente',
          access_package: u.access_package || defaultPackages[u.id] || 'pacote_01_gratuito',
          region: inferRegionFromCountry(u.country, u.region),
        }));
      }
    } catch (e) {
      console.warn('Failed to parse local users', e);
    }
    this.saveUsers(initialLocalUsers);
    return initialLocalUsers;
  }

  public saveUsers(users: (User & { password_hash: string })[]) {
    try {
      localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users));
    } catch (e) {
      console.warn('Failed to save local users', e);
    }
  }

  public getReports(): Report[] {
    try {
      const stored = localStorage.getItem(LOCAL_REPORTS_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.warn('Failed to parse local reports', e);
    }
    this.saveReports(initialLocalReports);
    return initialLocalReports;
  }

  public saveReports(reports: Report[]) {
    try {
      localStorage.setItem(LOCAL_REPORTS_KEY, JSON.stringify(reports));
    } catch (e) {
      console.warn('Failed to save local reports', e);
    }
  }

  public generateUniqueCode(): string {
    const users = this.getUsers();
    let code = '';
    let exists = true;
    while (exists) {
      const num = Math.floor(100000 + Math.random() * 900000);
      code = `#CR-${num}`;
      exists = users.some((u) => u.unique_code === code);
    }
    return code;
  }

  public login(identifier: string, password: string): { user: User; token: string } | null {
    const users = this.getUsers();
    const clean = identifier.trim().toLowerCase();
    const found = users.find(
      (u) =>
        u.email.toLowerCase() === clean ||
        u.unique_code.toLowerCase() === clean
    );

    if (!found || found.password_hash !== password) {
      return null;
    }

    if (found.status === 'banned') {
      throw new Error(`Sua conta foi suspensa pela moderação. Motivo: ${found.ban_reason || 'Violação dos termos'}`);
    }

    found.status = 'online';
    this.saveUsers(users);

    const { password_hash, ...safeUser } = found;
    return { user: safeUser, token: safeUser.id };
  }

  public register(data: {
    username: string;
    email: string;
    password: string;
    country?: string;
    gender?: string;
    bio?: string;
    access_package?: AccessPackageId;
    intent_just_browse?: boolean;
    intent_choose_gender_region?: boolean;
    intent_teach_classes?: boolean;
    teach_subjects?: TeachSubject[];
    teach_description?: string;
    region?: WorldRegionId;
  }): { user: User; token: string } {
    const users = this.getUsers();
    const cleanEmail = data.email.trim().toLowerCase();

    if (users.some((u) => u.email.toLowerCase() === cleanEmail)) {
      throw new Error('Já existe um usuário cadastrado com este e-mail.');
    }

    const uniqueCode = this.generateUniqueCode();
    const resolvedPackage: AccessPackageId = data.access_package || 'pacote_01_gratuito';
    const newUser: User & { password_hash: string } = {
      id: `user_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      unique_code: uniqueCode,
      username: data.username.trim(),
      email: cleanEmail,
      password_hash: data.password,
      role: 'user',
      status: 'online',
      payment_status: 'pendente',
      access_package: resolvedPackage,
      intent_just_browse: Boolean(data.intent_just_browse),
      intent_choose_gender_region: Boolean(data.intent_choose_gender_region),
      intent_teach_classes: Boolean(data.intent_teach_classes),
      teach_subjects: Array.isArray(data.teach_subjects) ? data.teach_subjects : [],
      teach_description: (data.teach_description || '').trim(),
      region: inferRegionFromCountry(data.country, data.region),
      country: data.country || 'Brasil 🇧🇷',
      gender: data.gender || 'unspecified',
      bio: data.bio || '',
      avatar: generateLocalAvatar(data.username),
      created_at: new Date().toISOString(),
    };

    users.push(newUser);
    this.saveUsers(users);

    const { password_hash, ...safeUser } = newUser;
    return { user: safeUser, token: safeUser.id };
  }

  public updateUserProfile(userId: string, updates: Partial<User>): User | null {
    const users = this.getUsers();
    const idx = users.findIndex((u) => u.id === userId);
    if (idx === -1) return null;
    users[idx] = { ...users[idx], ...updates };
    this.saveUsers(users);
    const { password_hash, ...safeUser } = users[idx];
    return safeUser;
  }

  public getUserByCode(code: string): User | null {
    const users = this.getUsers();
    const clean = code.trim().toUpperCase();
    const formatted = clean.startsWith('#') ? clean : `#${clean}`;
    const user = users.find((u) => u.unique_code.toUpperCase() === formatted);
    if (!user) return null;
    const { password_hash, ...safeUser } = user;
    return safeUser;
  }

  public getClientLeads(ownerId?: string): ClientLead[] {
    const users = this.getUsers();
    const enrich = (list: ClientLead[]) =>
      list.map((lead) => {
        const owner = users.find(
          (u) => u.id === lead.owner_id || u.unique_code === lead.owner_code
        );
        return {
          ...lead,
          owner_name: owner?.username || lead.owner_name || lead.owner_code || 'Atendente',
          owner_code: owner?.unique_code || lead.owner_code,
        };
      });

    try {
      const stored = localStorage.getItem(LOCAL_CLIENTS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as ClientLead[];
        const filtered = ownerId ? parsed.filter((c) => c.owner_id === ownerId) : parsed;
        return enrich(filtered);
      }
    } catch (e) {
      console.warn('Failed to parse local client leads', e);
    }
    const seedOwnerId = ownerId || 'user_002';
    const seedOwner = users.find((u) => u.id === seedOwnerId);
    const initial: ClientLead[] = [
      {
        id: 'lead_seed_001',
        owner_id: seedOwnerId,
        owner_code: seedOwner?.unique_code || '#CR-849201',
        owner_name: seedOwner?.username || 'Lucas Silva',
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
    this.saveAllClientLeads(initial);
    return initial;
  }

  public saveAllClientLeads(leads: ClientLead[]) {
    try {
      localStorage.setItem(LOCAL_CLIENTS_KEY, JSON.stringify(leads));
    } catch (e) {
      console.warn('Failed to save local client leads', e);
    }
  }

  public getNextClientLabel(ownerId: string): string {
    const existing = this.getClientLeads(ownerId);
    let maxNum = 1;
    existing.forEach((lead) => {
      const match = lead.client_label?.match(/(\d+)\s*$/);
      if (match) {
        const n = parseInt(match[1], 10);
        if (n > maxNum) maxNum = n;
      }
    });
    const nextNum = Math.max(2, maxNum + 1);
    return `Cliente On Line ${nextNum.toString().padStart(2, '0')}`;
  }

  public createClientLead(data: {
    owner_id: string;
    owner_code: string;
    client_label?: string;
    name: string;
    whatsapp: string;
    email: string;
    message: string;
    call_date?: string;
    status?: ClientLeadStatus;
    is_read?: boolean;
    source_url?: string;
    notes?: string;
  }): ClientLead {
    const all = this.getClientLeads();
    const label = data.client_label || this.getNextClientLabel(data.owner_id);
    const created: ClientLead = {
      id: `lead_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      owner_id: data.owner_id,
      owner_code: data.owner_code,
      client_label: label,
      name: data.name.trim(),
      whatsapp: data.whatsapp.trim(),
      email: data.email.trim(),
      message: data.message.trim(),
      call_date: data.call_date || new Date().toISOString(),
      status: data.status || 'novo',
      is_read: data.is_read ?? false,
      source_url: data.source_url,
      notes: data.notes || '',
    };
    this.saveAllClientLeads([created, ...all]);
    return created;
  }

  public updateClientLead(id: string, updates: Partial<ClientLead>): ClientLead | null {
    const all = this.getClientLeads();
    const idx = all.findIndex((c) => c.id === id);
    if (idx === -1) return null;
    all[idx] = { ...all[idx], ...updates };
    this.saveAllClientLeads(all);
    return all[idx];
  }

  public deleteClientLead(id: string): boolean {
    const all = this.getClientLeads();
    const filtered = all.filter((c) => c.id !== id);
    if (filtered.length === all.length) return false;
    this.saveAllClientLeads(filtered);
    return true;
  }
}

export const localDb = new LocalDatabaseService();
