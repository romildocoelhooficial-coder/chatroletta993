import React, { useEffect, useState } from 'react';
import { Phone, PhoneOff, Volume2, BellRing, Users, Headphones } from 'lucide-react';
import { sounds } from '../services/audio.ts';
import { resolveAvatarUrl } from '../services/avatar.ts';

interface ClientCallMeta {
  leadId?: string;
  clientLabel: string;
  name: string;
  whatsapp: string;
  email: string;
  message: string;
  call_date?: string;
}

interface IncomingCallModalProps {
  isOpen: boolean;
  caller: {
    id: string;
    username: string;
    unique_code: string;
    avatar?: string;
    country?: string;
  } | null;
  callType: 'video' | 'audio';
  isGroupInvite?: boolean;
  isClientWidget?: boolean;
  clientMeta?: ClientCallMeta | null;
  participants?: { username: string; unique_code: string }[];
  onAccept: () => void;
  onDecline: () => void;
}

export const IncomingCallModal: React.FC<IncomingCallModalProps> = ({
  isOpen,
  caller,
  callType,
  isGroupInvite,
  isClientWidget,
  clientMeta,
  participants,
  onAccept,
  onDecline,
}) => {
  const [soundActive, setSoundActive] = useState(true);

  useEffect(() => {
    if (!isOpen || !caller) {
      sounds.stopAll();
      return;
    }

    sounds.unlockAudio();
    sounds.startIncomingRing();
    setSoundActive(sounds.isAudioRunning());

    const checkAudio = setInterval(() => {
      setSoundActive(sounds.isAudioRunning());
    }, 350);

    // Flash browser tab title so user notices even when looking at another tab
    const originalTitle = document.title;
    let toggle = false;
    const titleInterval = setInterval(() => {
      toggle = !toggle;
      document.title = toggle
        ? `📞 Chamada de ${caller.username}!`
        : originalTitle;
    }, 900);

    // Trigger system notification if permission was granted
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(`Chamada de ${caller.username}`, {
          body: `${caller.unique_code} está ligando para você agora.`,
          tag: `incoming_call_${caller.unique_code}`,
        });
      } catch {
        // ignore notification errors
      }
    }

    return () => {
      clearInterval(checkAudio);
      clearInterval(titleInterval);
      document.title = originalTitle;
      sounds.stopAll();
    };
  }, [isOpen, caller]);

  if (!isOpen || !caller) return null;

  const triggerSoundManual = () => {
    sounds.unlockAudio();
    sounds.startIncomingRing();
    setSoundActive(sounds.isAudioRunning());
  };

  const badgeLabel = isGroupInvite
    ? 'Convite para Chamada em Grupo'
    : isClientWidget
    ? 'Atendimento Web • Chamada de Áudio'
    : callType === 'audio'
    ? 'Chamada de Áudio Recebida'
    : 'Chamada Telefônica Recebida';

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in zoom-in-95 duration-200">
      <div
        className={`relative w-full max-w-sm bg-gradient-to-b from-zinc-900 to-zinc-950 border-2 ${
          isGroupInvite ? 'border-indigo-500/60' : 'border-emerald-500/50'
        } rounded-3xl shadow-2xl p-6 text-center overflow-hidden`}
      >
        {/* Animated radar rings in background */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-25">
          <div
            className={`w-64 h-64 rounded-full border ${
              isGroupInvite ? 'border-indigo-500' : 'border-emerald-500'
            } animate-ping`}
          />
          <div className="w-44 h-44 rounded-full border border-indigo-500 animate-pulse" />
        </div>

        {/* Incoming Badge with Pulsing Bell */}
        <div
          className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold tracking-wide uppercase mb-4 animate-bounce border ${
            isGroupInvite
              ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300'
              : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
          }`}
        >
          {isGroupInvite ? (
            <Users className="w-4 h-4 text-indigo-400" />
          ) : isClientWidget ? (
            <Headphones className="w-4 h-4 text-emerald-400" />
          ) : (
            <BellRing className="w-4 h-4 animate-spin text-emerald-400" />
          )}
          <span>{badgeLabel}</span>
        </div>

        {/* Caller Avatar */}
        <div className="relative w-24 h-24 mx-auto mb-4">
          <img
            src={resolveAvatarUrl(caller.avatar, caller.username)}
            alt={caller.username}
            className={`w-full h-full rounded-full object-cover border-4 shadow-2xl ${
              isGroupInvite ? 'border-indigo-500/80' : 'border-emerald-500/80'
            }`}
          />
          <div
            className={`absolute -bottom-1 -right-1 p-2 rounded-full text-white shadow-md animate-pulse ${
              isGroupInvite ? 'bg-indigo-500' : 'bg-emerald-500'
            }`}
          >
            {isClientWidget || callType === 'audio' ? (
              <Headphones className="w-4 h-4" />
            ) : (
              <Phone className="w-4 h-4" />
            )}
          </div>
        </div>

        {/* Caller Info */}
        <h3 className="text-xl font-extrabold text-white mb-0.5">{caller.username}</h3>
        <p className="font-mono text-sm font-black text-emerald-400 mb-1">{caller.unique_code}</p>
        {caller.country && <p className="text-xs text-zinc-400 mb-2">{caller.country}</p>}

        {/* Client Widget Lead Details Preview */}
        {isClientWidget && clientMeta && (
          <div className="mb-3 p-3 bg-zinc-900/90 border border-emerald-500/30 rounded-2xl text-left text-xs space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-zinc-400">Cliente:</span>
              <span className="font-semibold text-white truncate">{clientMeta.name}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-zinc-400">WhatsApp:</span>
              <span className="font-mono text-emerald-300 truncate">{clientMeta.whatsapp}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-zinc-400">E-mail:</span>
              <span className="text-zinc-200 truncate">{clientMeta.email}</span>
            </div>
            {clientMeta.message && (
              <div className="pt-1.5 border-t border-zinc-800 text-zinc-300 text-[11px] leading-snug line-clamp-3">
                <span className="text-zinc-500 font-semibold">Mensagem: </span>
                {clientMeta.message}
              </div>
            )}
          </div>
        )}

        {/* Group Invite Participants Info */}
        {isGroupInvite && (
          <div className="mb-3 p-2.5 bg-indigo-950/50 border border-indigo-500/30 rounded-2xl text-xs text-indigo-200">
            <p className="font-semibold mb-1">Você foi convidado para participar desta chamada:</p>
            {participants && participants.length > 0 ? (
              <div className="flex flex-wrap items-center justify-center gap-1.5">
                {participants.map((p, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 bg-indigo-500/20 border border-indigo-400/30 rounded-lg text-[11px] font-medium"
                  >
                    {p.username} ({p.unique_code})
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-[11px] text-indigo-300">Seu vídeo aparecerá integrado no painel ao vivo</span>
            )}
          </div>
        )}

        {/* Sound Alert Helper */}
        <div className="mb-5 flex flex-col items-center">
          {soundActive ? (
            <>
              <div className="flex items-center justify-center gap-1.5 text-xs text-emerald-300 font-semibold mb-1">
                <Volume2 className="w-4 h-4 animate-pulse text-emerald-400" />
                <span>Tocando melodia de chamada...</span>
              </div>
              <button
                type="button"
                onClick={triggerSoundManual}
                className="text-[11px] text-zinc-400 hover:text-emerald-300 underline transition cursor-pointer"
              >
                Não ouviu o toque? Clique aqui para reforçar o áudio
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={triggerSoundManual}
              className="px-4 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/60 text-amber-200 text-xs font-bold flex items-center gap-2 animate-pulse cursor-pointer"
            >
              <Volume2 className="w-4 h-4 text-amber-300" />
              <span>Som bloqueado pelo navegador — Clique para tocar</span>
            </button>
          )}
        </div>

        {/* Action Buttons: Atender / Recusar */}
        <div className="flex items-center justify-center gap-8 pt-2">
          {/* Recusar */}
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={() => {
                sounds.stopAll();
                onDecline();
              }}
              className="w-16 h-16 bg-red-600 hover:bg-red-500 active:bg-red-700 rounded-full flex items-center justify-center text-white shadow-xl shadow-red-600/40 transition transform hover:scale-105 active:scale-95 cursor-pointer"
              title="Recusar Chamada"
            >
              <PhoneOff className="w-7 h-7" />
            </button>
            <span className="text-xs font-bold text-red-400">Recusar</span>
          </div>

          {/* Atender */}
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={() => {
                sounds.stopAll();
                onAccept();
              }}
              className="w-18 h-18 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 rounded-full flex items-center justify-center text-white shadow-2xl shadow-emerald-500/50 transition transform hover:scale-110 active:scale-95 ring-4 ring-emerald-500/40 animate-pulse cursor-pointer"
              title={isGroupInvite ? 'Entrar na Chamada' : 'Atender Chamada'}
            >
              <Phone className="w-8 h-8" />
            </button>
            <span className="text-xs font-extrabold text-emerald-400">
              {isGroupInvite ? 'Participar' : 'Atender'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
