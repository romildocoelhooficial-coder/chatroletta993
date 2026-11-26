import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import {
  ACCESS_PACKAGE_LIST,
  ACCESS_PACKAGES,
  TEACH_SUBJECT_LABELS,
  WORLD_REGIONS,
  inferRegionFromCountry,
} from '../constants/packages.ts';
import { AccessPackageId, TeachSubject, WorldRegionId } from '../types/index.ts';
import {
  X,
  UserPlus,
  LogIn,
  Users,
  Check,
  AlertCircle,
  GraduationCap,
  Compass,
  PackageCheck,
} from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'login' | 'register';
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, initialMode = 'login' }) => {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);

  // Form states
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [country, setCountry] = useState('Brasil 🇧🇷');
  const [region, setRegion] = useState<WorldRegionId>('america_sul');
  const [gender, setGender] = useState('unspecified');
  const [bio, setBio] = useState('');

  // Registration Checkboxes & Teaching Options (Req 01)
  const [intentJustBrowse, setIntentJustBrowse] = useState(true);
  const [intentChooseGenderRegion, setIntentChooseGenderRegion] = useState(false);
  const [intentTeachClasses, setIntentTeachClasses] = useState(false);
  const [teachSubjects, setTeachSubjects] = useState<TeachSubject[]>([]);
  const [teachDescription, setTeachDescription] = useState('');

  // 4 Access Packages (Req 02)
  const [accessPackage, setAccessPackage] = useState<AccessPackageId>('pacote_01_gratuito');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCountryChange = (val: string) => {
    setCountry(val);
    setRegion(inferRegionFromCountry(val));
  };

  const toggleTeachSubject = (subj: TeachSubject) => {
    setTeachSubjects((prev) =>
      prev.includes(subj) ? prev.filter((s) => s !== subj) : [...prev, subj]
    );
    if (!intentTeachClasses) {
      setIntentTeachClasses(true);
      setAccessPackage('pacote_04_professor');
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await login(identifier, password);
    setLoading(false);
    if (res.success) {
      onClose();
    } else {
      setError(res.error || 'Credenciais inválidas.');
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await register({
      username,
      email,
      password,
      country,
      region,
      gender,
      bio,
      access_package: accessPackage,
      intent_just_browse: intentJustBrowse,
      intent_choose_gender_region: intentChooseGenderRegion,
      intent_teach_classes: intentTeachClasses,
      teach_subjects: intentTeachClasses ? teachSubjects : [],
      teach_description: intentTeachClasses ? teachDescription : '',
    });
    setLoading(false);
    if (res.success) {
      setSuccessMsg(
        `Cadastro realizado no ${ACCESS_PACKAGES[accessPackage].shortName}! Seu código único foi gerado.`
      );
      setTimeout(() => {
        onClose();
      }, 1200);
    } else {
      setError(res.error || 'Erro ao registrar.');
    }
  };

  const demoAccounts = [
    {
      name: 'Lucas Silva',
      code: '#CR-849201',
      email: 'lucas@exemplo.com',
      role: 'user',
      pkg: 'Pacote 04 • Profissional',
      flag: '🇧🇷',
    },
    {
      name: 'Sofia Martinez',
      code: '#CR-193852',
      email: 'sofia@exemplo.com',
      role: 'user',
      pkg: 'Pacote 03 • Região/Gênero',
      flag: '🇵🇹',
    },
    {
      name: 'Alex Morgan',
      code: '#CR-648291',
      email: 'alex@exemplo.com',
      role: 'user',
      pkg: 'Pacote 02 • Boas Vindas',
      flag: '🇺🇸',
    },
    {
      name: 'Clara Costa',
      code: '#CR-552910',
      email: 'clara@exemplo.com',
      role: 'user',
      pkg: 'Pacote 01 • Gratuito',
      flag: '🇪🇸',
    },
  ];

  const handleQuickLogin = async (account: (typeof demoAccounts)[0]) => {
    setError(null);
    setLoading(true);
    const res = await login(account.email, 'user123');
    setLoading(false);
    if (res.success) {
      onClose();
    } else {
      setError(res.error || 'Erro ao alternar de conta.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-5 sm:p-6">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header Tabs */}
        <div className="flex border-b border-zinc-800 mb-5 pb-2">
          <button
            onClick={() => {
              setMode('login');
              setError(null);
            }}
            className={`flex items-center gap-2 pb-2 px-3 font-semibold text-sm transition border-b-2 cursor-pointer ${
              mode === 'login'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <LogIn className="w-4 h-4" /> Entrar
          </button>
          <button
            onClick={() => {
              setMode('register');
              setError(null);
            }}
            className={`flex items-center gap-2 pb-2 px-3 font-semibold text-sm transition border-b-2 cursor-pointer ${
              mode === 'register'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <UserPlus className="w-4 h-4" /> Cadastrar-se
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-950/50 border border-red-500/50 rounded-xl text-red-200 text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-4 p-3 bg-emerald-950/50 border border-emerald-500/50 rounded-xl text-emerald-200 text-sm flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{successMsg}</span>
          </div>
        )}

        {mode === 'login' ? (
          <div>
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">
                  E-mail ou Código de Usuário (#CR-XXXXXX)
                </label>
                <input
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="ex: lucas@exemplo.com ou #CR-849201"
                  required
                  className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">
                  Senha
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Sua senha secreta"
                  required
                  className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 text-sm"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-medium rounded-xl text-sm transition flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                {loading ? 'Entrando...' : 'Acessar Plataforma'}
              </button>
            </form>

            {/* Quick Demo Switcher */}
            <div className="mt-6 pt-5 border-t border-zinc-800">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-indigo-400" /> Contas Pré-configuradas para Teste Rápido:
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {demoAccounts.map((acc) => (
                  <button
                    key={acc.email}
                    onClick={() => handleQuickLogin(acc)}
                    className="p-2.5 bg-zinc-800/60 hover:bg-zinc-800 border border-zinc-700/60 hover:border-indigo-500/50 rounded-xl text-left transition flex flex-col group cursor-pointer"
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-xs font-bold text-white group-hover:text-indigo-300 flex items-center gap-1">
                        {acc.flag} {acc.name}
                      </span>
                    </div>
                    <span className="text-[11px] font-mono text-indigo-400 mt-0.5">{acc.code}</span>
                    <span className="text-[10px] text-emerald-400 font-semibold mt-0.5">
                      {acc.pkg}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={handleRegister} className="space-y-3.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">
                  Nome de Usuário
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Como quer ser chamado?"
                  required
                  className="w-full px-3.5 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">
                  E-mail
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seuemail@exemplo.com"
                  required
                  className="w-full px-3.5 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">
                  Senha
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  required
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">
                  País de Origem
                </label>
                <select
                  value={country}
                  onChange={(e) => handleCountryChange(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-white text-xs sm:text-sm focus:outline-none focus:border-indigo-500"
                >
                  <option value="Brasil 🇧🇷">Brasil 🇧🇷</option>
                  <option value="Argentina 🇦🇷">Argentina 🇦🇷</option>
                  <option value="Portugal 🇵🇹">Portugal 🇵🇹</option>
                  <option value="Espanha 🇪🇸">Espanha 🇪🇸</option>
                  <option value="Alemanha 🇩🇪">Alemanha 🇩🇪</option>
                  <option value="Estados Unidos 🇺🇸">Estados Unidos 🇺🇸</option>
                  <option value="Canadá 🇨🇦">Canadá 🇨🇦</option>
                  <option value="Japão 🇯🇵">Japão 🇯🇵</option>
                  <option value="Angola 🇦🇴">Angola 🇦🇴</option>
                  <option value="Austrália 🇦🇺">Austrália 🇦🇺</option>
                  <option value="Global 🌐">Outro / Global 🌐</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">
                  Gênero
                </label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-white text-xs sm:text-sm focus:outline-none focus:border-indigo-500"
                >
                  <option value="unspecified">Não especificar</option>
                  <option value="male">Masculino</option>
                  <option value="female">Feminino</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">
                Região no Planisfério
              </label>
              <select
                value={region}
                onChange={(e) => setRegion(e.target.value as WorldRegionId)}
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-white text-xs sm:text-sm focus:outline-none focus:border-indigo-500"
              >
                {WORLD_REGIONS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            {/* 01 - Registration Checkboxes */}
            <div className="p-3.5 bg-zinc-950/70 border border-zinc-800 rounded-xl space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-indigo-300">
                <Compass className="w-3.5 h-3.5" />
                <span>Objetivo na Plataforma (Marque as opções desejadas)</span>
              </div>

              <label className="flex items-center gap-2.5 text-xs text-zinc-200 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={intentJustBrowse}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setIntentJustBrowse(checked);
                    if (checked && !intentChooseGenderRegion && !intentTeachClasses) {
                      setAccessPackage('pacote_01_gratuito');
                    }
                  }}
                  className="w-4 h-4 rounded accent-indigo-600 cursor-pointer"
                />
                <span>Quero apenas Navegar</span>
              </label>

              <label className="flex items-center gap-2.5 text-xs text-zinc-200 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={intentChooseGenderRegion}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setIntentChooseGenderRegion(checked);
                    if (checked && !intentTeachClasses) {
                      setAccessPackage('pacote_03_premium');
                    }
                  }}
                  className="w-4 h-4 rounded accent-indigo-600 cursor-pointer"
                />
                <span>Quero Escolher o Gênero e Região</span>
              </label>

              <div className="space-y-2 pt-1 border-t border-zinc-800/80">
                <label className="flex items-center gap-2.5 text-xs text-emerald-300 font-semibold cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={intentTeachClasses}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setIntentTeachClasses(checked);
                      if (checked) {
                        setAccessPackage('pacote_04_professor');
                      }
                    }}
                    className="w-4 h-4 rounded accent-emerald-600 cursor-pointer"
                  />
                  <GraduationCap className="w-4 h-4 text-emerald-400" />
                  <span>Quero Dar Aulas de:</span>
                </label>

                <div className="pl-6 space-y-2">
                  <div className="flex flex-wrap gap-3">
                    {(['idiomas', 'musica', 'outros'] as TeachSubject[]).map((subj) => (
                      <label
                        key={subj}
                        className="flex items-center gap-1.5 text-xs text-zinc-300 cursor-pointer select-none"
                      >
                        <input
                          type="checkbox"
                          checked={teachSubjects.includes(subj)}
                          onChange={() => toggleTeachSubject(subj)}
                          className="w-3.5 h-3.5 rounded accent-emerald-600 cursor-pointer"
                        />
                        <span>{TEACH_SUBJECT_LABELS[subj]}</span>
                      </label>
                    ))}
                  </div>

                  <textarea
                    rows={2}
                    value={teachDescription}
                    onChange={(e) => {
                      setTeachDescription(e.target.value);
                      if (e.target.value.trim() && !intentTeachClasses) {
                        setIntentTeachClasses(true);
                        setAccessPackage('pacote_04_professor');
                      }
                    }}
                    placeholder="Descreva suas aulas (ex: Inglês para conversação, violão iniciante, reforço escolar...)"
                    className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 text-xs"
                  />
                </div>
              </div>
            </div>

            {/* 02 - 4 Access Packages */}
            <div className="p-3.5 bg-zinc-950/70 border border-zinc-800 rounded-xl space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-300">
                <PackageCheck className="w-3.5 h-3.5" />
                <span>Escolha seu Pacote de Acesso</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {ACCESS_PACKAGE_LIST.map((pkg) => {
                  const selected = accessPackage === pkg.id;
                  return (
                    <button
                      key={pkg.id}
                      type="button"
                      onClick={() => setAccessPackage(pkg.id)}
                      className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                        selected
                          ? 'bg-indigo-600/20 border-indigo-400 ring-1 ring-indigo-400/50'
                          : 'bg-zinc-900/90 border-zinc-800 hover:border-zinc-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-extrabold text-white">{pkg.shortName}</span>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-zinc-800 text-emerald-300 whitespace-nowrap">
                          {pkg.priceLabel}
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-400 mt-1 leading-snug">{pkg.description}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">
                Breve Apresentação (Bio opcional)
              </label>
              <input
                type="text"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="ex: Curto música, jogos e idiomas"
                className="w-full px-4 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 text-sm"
              />
            </div>

            <div className="p-3 bg-indigo-950/30 border border-indigo-500/20 rounded-xl text-xs text-indigo-300">
              ℹ️ Ao se cadastrar, nosso sistema gerará automaticamente um <strong>Código Único exclusivo (#CR-XXXXXX)</strong> para você receber chamadas diretas como um telefone!
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-medium rounded-xl text-sm transition flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              {loading ? 'Cadastrando...' : 'Criar Conta e Obter Código'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

