import type { AccessPackageId, WorldRegionId, TeachSubject } from '../constants/packages.ts';

export type { AccessPackageId, WorldRegionId, TeachSubject };

export type UserRole = 'user' | 'admin';

export type UserStatus = 'online' | 'busy' | 'offline' | 'banned';

export type PaymentStatus = 'pago' | 'pendente';

export interface AdminBroadcastMessage {
  id: string;
  text: string;
  sent_at: string;
  sent_by?: string;
}

export interface User {
  id: string;
  unique_code: string; // e.g. #CR-849201
  username: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  payment_status?: PaymentStatus;
  access_package?: AccessPackageId;
  intent_just_browse?: boolean;
  intent_choose_gender_region?: boolean;
  intent_teach_classes?: boolean;
  teach_subjects?: TeachSubject[];
  teach_description?: string;
  region?: WorldRegionId;
  pix_qr_image?: string;
  bank_details?: string;
  admin_message?: AdminBroadcastMessage | null;
  country?: string;
  gender?: string;
  bio?: string;
  avatar?: string;
  ban_reason?: string;
  created_at: string;
}

export interface Report {
  id: string;
  reporter_id: string;
  reporter_name: string;
  reported_id: string;
  reported_name: string;
  reported_code: string;
  reason: string;
  details?: string;
  created_at: string;
  resolved: boolean;
}

export interface ChatMessage {
  id: string;
  sender_id: string;
  sender_name: string;
  sender_code?: string;
  text: string;
  timestamp: string;
  is_system?: boolean;
}

export type ClientLeadStatus = 'novo' | 'em_atendimento' | 'atendido' | 'retornar';

export interface ClientLead {
  id: string;
  owner_id: string;
  owner_code: string;
  owner_name?: string;
  client_label: string;
  name: string;
  whatsapp: string;
  email: string;
  message: string;
  call_date: string;
  status: ClientLeadStatus;
  is_read?: boolean;
  source_url?: string;
  notes?: string;
}

export interface CallSession {
  callId: string;
  caller: {
    id: string;
    username: string;
    unique_code: string;
    avatar?: string;
  };
  receiver: {
    id: string;
    username: string;
    unique_code: string;
    avatar?: string;
  };
  type: 'roulette' | 'direct';
  startTime: number;
}
