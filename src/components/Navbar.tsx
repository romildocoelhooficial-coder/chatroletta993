import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { resolveAvatarUrl } from '../services/avatar.ts';
import {
  Video,
  Phone,
  Headphones,
  Copy,
  Check,
  LogIn,
  LogOut,
  ChevronDown,
  Sparkles,
  Radio,
  Sun,
  Moon,
} from 'lucide-react';

interface NavbarProps {
  currentTab: 'roulette' | 'direct' | 'widget' | 'admin';
  onSelectTab: (tab: 'roulette' | 'direct' | 'widget' | 'admin') => void;
  onOpenAuth: () => void;
  pendingReportsCount?: number;
  theme?: 'dark' | 'light';
  onToggleTheme?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  onSelectTab,
  onOpenAuth,
  pendingReportsCount = 0,
  theme = 'dark',
  onToggleTheme,
}) => {
  const { user, logout, serverMode } = useAuth();
  const [copied, setCopied] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const copyCode = () => {
    if (user?.unique_code) {
      navigator.clipboard.writeText(user.unique_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-zinc-950/80 backdrop-blur-md border-b border-zinc-800/80 px-2.5 sm:px-4 lg:px-8 py-2 sm:py-3">
      <div className="max-w-7xl mx-auto flex flex-wrap md:flex-nowrap items-center justify-between gap-2 md:gap-4">
        {/* Brand Logo */}
        <div className="order-1 flex items-center gap-1.5 sm:gap-3 min-w-0">
          <div className="relative flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 shadow-lg shadow-indigo-600/30 shrink-0">
            <Radio className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-sm sm:text-lg text-white tracking-tight truncate">
                ChatRoulette<span className="text-indigo-400">P2P</span>
              </span>
              <span
                className={`hidden sm:inline-block text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border whitespace-nowrap ${
                  serverMode === 'connected'
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                }`}
                title={serverMode === 'connected' ? 'Conectado ao servidor Socket.io em tempo real' : 'Executando em modo resiliente local / Vercel'}
              >
                {serverMode === 'connected' ? '● Servidor Online' : '⚡ Modo Resiliente P2P'}
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 hidden sm:block">
              Vídeo aleatório & chamadas diretas por código
            </p>
          </div>
        </div>

        {/* Navigation Tabs (Full-width organized second row on mobile, centered on desktop) */}
        <nav className="order-3 md:order-2 w-full md:w-auto grid grid-cols-3 md:flex items-center gap-1 sm:gap-1.5 bg-zinc-900/90 border border-zinc-800 p-1 rounded-xl">
          <button
            onClick={() => onSelectTab('roulette')}
            className={`flex items-center justify-center gap-1 sm:gap-2 px-1 sm:px-3.5 py-1.5 rounded-lg text-[10.5px] sm:text-xs font-semibold transition whitespace-nowrap shrink-0 cursor-pointer ${
              currentTab === 'roulette'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/25'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
            }`}
          >
            <Video className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span className="truncate">Roleta Global</span>
          </button>

          <button
            onClick={() => onSelectTab('direct')}
            className={`flex items-center justify-center gap-1 sm:gap-2 px-1 sm:px-3.5 py-1.5 rounded-lg text-[10.5px] sm:text-xs font-semibold transition whitespace-nowrap shrink-0 cursor-pointer ${
              currentTab === 'direct'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/25'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
            }`}
          >
            <Phone className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span className="truncate">Chamada Direta</span>
          </button>

          <button
            onClick={() => onSelectTab('widget')}
            className={`flex items-center justify-center gap-1 sm:gap-2 px-1 sm:px-3.5 py-1.5 rounded-lg text-[10.5px] sm:text-xs font-semibold transition whitespace-nowrap shrink-0 cursor-pointer ${
              currentTab === 'widget'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/25'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
            }`}
          >
            <Headphones className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span className="truncate">Atendimento Web</span>
          </button>
        </nav>

        {/* User Status / Actions */}
        <div className="order-2 md:order-3 flex items-center gap-1 sm:gap-2.5 shrink-0">
          {onToggleTheme && (
            <button
              type="button"
              onClick={onToggleTheme}
              className="flex items-center gap-1.5 p-1.5 sm:px-2.5 sm:py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-xl text-xs font-semibold text-zinc-300 hover:text-white transition cursor-pointer shrink-0"
              title={
                theme === 'light'
                  ? 'Alternar para tema escuro padrão'
                  : 'Alternar para tema CSS com cores mais claras'
              }
              aria-label={
                theme === 'light'
                  ? 'Alternar para tema escuro padrão'
                  : 'Alternar para tema CSS com cores mais claras'
              }
            >
              {theme === 'light' ? (
                <>
                  <Moon className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="hidden lg:inline">Escuro</span>
                </>
              ) : (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                  <span className="hidden lg:inline">Claro</span>
                </>
              )}
            </button>
          )}
          {user ? (
            <div className="flex items-center gap-1 sm:gap-3">
              {/* Unique Code Badge with 1-Click Copy */}
              <button
                onClick={copyCode}
                className="group relative flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 hover:border-indigo-500/60 rounded-xl transition cursor-pointer"
                title="Clique para copiar seu código único de chamada"
              >
                <div className="text-left">
                  <div className="hidden sm:block text-[10px] uppercase font-bold text-zinc-400 group-hover:text-indigo-300 transition">
                    Seu Código de Chamada
                  </div>
                  <div className="font-mono text-[10.5px] sm:text-xs font-bold text-emerald-400 tracking-wider">
                    {user.unique_code}
                  </div>
                </div>
                {copied ? (
                  <Check className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-emerald-400 shrink-0" />
                ) : (
                  <Copy className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-zinc-400 group-hover:text-white shrink-0" />
                )}

                {copied && (
                  <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-zinc-900 border border-emerald-500/40 text-emerald-300 text-[10px] px-2 py-0.5 rounded shadow-lg whitespace-nowrap z-50">
                    Copiado para o clipboard!
                  </div>
                )}
              </button>

              {/* User Avatar & Menu */}
              <div className="relative">
                <button
                  onClick={() => setMenuOpen(!menuOpen)}
                  className="flex items-center gap-1 sm:gap-2 p-1 sm:p-1.5 sm:pr-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-xl transition"
                >
                  <img
                    src={resolveAvatarUrl(user.avatar, user.username)}
                    alt={user.username}
                    className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg object-cover border border-zinc-700"
                  />
                  <div className="text-left hidden md:block">
                    <span className="block text-xs font-semibold text-white truncate max-w-[100px]">
                      {user.username}
                    </span>
                    <span className="block text-[10px] text-zinc-400">
                      {user.role === 'admin' ? '🛡️ Admin' : '👤 Usuário'}
                    </span>
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
                </button>

                {menuOpen && (
                  <div
                    className="absolute right-0 mt-2 w-56 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl py-2 z-50 text-xs"
                    onClick={() => setMenuOpen(false)}
                  >
                    <div className="px-4 py-2 border-b border-zinc-800">
                      <p className="font-semibold text-white">{user.username}</p>
                      <p className="text-zinc-400 text-[11px] truncate">{user.email}</p>
                      <p className="font-mono text-emerald-400 text-[11px] mt-1 font-bold">
                        {user.unique_code}
                      </p>
                    </div>

                    <button
                      onClick={onOpenAuth}
                      className="w-full text-left px-4 py-2 text-zinc-300 hover:text-white hover:bg-zinc-800 flex items-center gap-2"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                      Trocar de Conta / Demo
                    </button>

                    <button
                      onClick={logout}
                      className="w-full text-left px-4 py-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 flex items-center gap-2 border-t border-zinc-800 mt-1"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Sair da Conta
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <button
              onClick={onOpenAuth}
              className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-indigo-600/20 transition whitespace-nowrap"
            >
              <LogIn className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span>Entrar</span>
              <span className="hidden sm:inline">/ Cadastrar</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
