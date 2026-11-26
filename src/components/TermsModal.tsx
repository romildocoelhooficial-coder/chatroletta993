import React, { useState } from 'react';
import { ShieldAlert, CheckSquare, Square, Ban, Scale, UserCheck, AlertTriangle } from 'lucide-react';

interface TermsModalProps {
  isOpen: boolean;
  onAccept: () => void;
}

export const TermsModal: React.FC<TermsModalProps> = ({ isOpen, onAccept }) => {
  const [confirmedAge, setConfirmedAge] = useState(false);
  const [confirmedConduct, setConfirmedConduct] = useState(false);
  const [confirmedModeration, setConfirmedModeration] = useState(false);
  const [declinedNotice, setDeclinedNotice] = useState(false);

  if (!isOpen) return null;

  const canEnter = confirmedAge && confirmedConduct && confirmedModeration;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/95 backdrop-blur-lg overflow-y-auto">
      <div className="relative w-full max-w-xl bg-zinc-900 border-2 border-indigo-500/40 rounded-3xl p-6 sm:p-8 shadow-2xl my-auto">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 shrink-0">
            <Scale className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-400">
              Termo Obrigatório de Aceite e Conduta
            </span>
            <h2 className="text-xl font-black text-white">Regras da Plataforma ChatRoulette P2P</h2>
          </div>
        </div>

        <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 space-y-3 text-xs text-zinc-300 leading-relaxed mb-5 max-h-64 overflow-y-auto">
          <p className="font-semibold text-white">
            Antes de acessar as transmissões de áudio e vídeo, leia e confirme todas as exigências abaixo:
          </p>

          <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-zinc-900/80 border border-zinc-800">
            <UserCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <p>
              <strong className="text-white">1. Maioridade Obrigatória (+18):</strong> Declaro ser maior de idade (18 anos ou mais) e possuir plena capacidade civil para utilizar esta ferramenta de comunicação em tempo real.
            </p>
          </div>

          <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-zinc-900/80 border border-zinc-800">
            <ShieldAlert className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
            <p>
              <strong className="text-white">2. Respeito e Zero Discriminação:</strong> Comprometo-me a agir com cordialidade, conduta ética e respeito mútuo, jamais praticando qualquer tipo de discriminação (racial, étnica, religiosa, de gênero, orientação ou origem) nem discurso de ódio.
            </p>
          </div>

          <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-red-950/30 border border-red-500/30">
            <Ban className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <p>
              <strong className="text-red-300">3. Proibição de Conteúdo Sexual ou Erótico:</strong> É terminantemente proibido utilizar esta plataforma para exibição de nudez, atos ou insinuações de cunho sexual ou erótico, assédio ou qualquer conteúdo impróprio.
            </p>
          </div>

          <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-amber-950/30 border border-amber-500/30">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p>
              <strong className="text-amber-200">4. Denúncias, Monitoramento e Banimento:</strong> Estou ciente de que todas as transmissões estão sujeitas à moderação de segurança da administração e que, ao ser denunciado ou violar qualquer regra, minha conta e acesso poderão ser <strong className="text-white">banidos imediatamente</strong>.
            </p>
          </div>
        </div>

        {/* Interactive Acceptance Checkboxes */}
        <div className="space-y-2.5 mb-6 text-xs">
          <button
            type="button"
            onClick={() => {
              setConfirmedAge((v) => !v);
              setDeclinedNotice(false);
            }}
            className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition cursor-pointer ${
              confirmedAge
                ? 'bg-emerald-950/30 border-emerald-500/50 text-white'
                : 'bg-zinc-950 border-zinc-800 text-zinc-300 hover:border-zinc-700'
            }`}
          >
            {confirmedAge ? (
              <CheckSquare className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <Square className="w-4 h-4 text-zinc-500 shrink-0" />
            )}
            <span>Confirmo que sou <strong>maior de idade (18 anos ou mais)</strong>.</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setConfirmedConduct((v) => !v);
              setDeclinedNotice(false);
            }}
            className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition cursor-pointer ${
              confirmedConduct
                ? 'bg-emerald-950/30 border-emerald-500/50 text-white'
                : 'bg-zinc-950 border-zinc-800 text-zinc-300 hover:border-zinc-700'
            }`}
          >
            {confirmedConduct ? (
              <CheckSquare className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <Square className="w-4 h-4 text-zinc-500 shrink-0" />
            )}
            <span>
              Comprometo-me a manter <strong>conduta e respeito</strong>, sem discriminação, discurso de ódio ou qualquer uso sexual/erótico.
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setConfirmedModeration((v) => !v);
              setDeclinedNotice(false);
            }}
            className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition cursor-pointer ${
              confirmedModeration
                ? 'bg-emerald-950/30 border-emerald-500/50 text-white'
                : 'bg-zinc-950 border-zinc-800 text-zinc-300 hover:border-zinc-700'
            }`}
          >
            {confirmedModeration ? (
              <CheckSquare className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <Square className="w-4 h-4 text-zinc-500 shrink-0" />
            )}
            <span>
              Estou ciente de que <strong>ao ser denunciado poderei ser banido</strong> pela administração.
            </span>
          </button>
        </div>

        {declinedNotice && (
          <div className="mb-4 p-3 bg-red-950/50 border border-red-500/40 rounded-xl text-xs text-red-200 text-center">
            O aceite integral dos termos e a confirmação de maioridade são obrigatórios para acessar a plataforma.
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={() => setDeclinedNotice(true)}
            className="sm:w-1/3 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold rounded-xl text-xs transition cursor-pointer"
          >
            Não Concordo
          </button>
          <button
            type="button"
            disabled={!canEnter}
            onClick={onAccept}
            className="sm:w-2/3 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-bold rounded-xl text-xs sm:text-sm transition shadow-lg shadow-emerald-600/20 disabled:shadow-none cursor-pointer disabled:cursor-not-allowed"
          >
            Aceitar Termos e Acessar Plataforma
          </button>
        </div>
      </div>
    </div>
  );
};
