import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, AccessPackageId, WorldRegionId, TeachSubject } from '../types/index.ts';
import { socketService } from '../services/socket.ts';
import { localDb } from '../services/localDatabase.ts';

export interface RegisterPayload {
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
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  bannedReason: string | null;
  serverMode: 'connected' | 'standalone';
  login: (identifier: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (data: RegisterPayload) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  switchUser: (user: User) => void;
  clearBanNotice: () => void;
  updateCurrentUser: (updated: Partial<User>) => void;
  saveTeacherPaymentInfo: (data: {
    pix_qr_image?: string;
    bank_details?: string;
  }) => Promise<{ success: boolean; error?: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('cr_token'));
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [bannedReason, setBannedReason] = useState<string | null>(null);
  const [serverMode, setServerMode] = useState<'connected' | 'standalone'>('connected');

  // Initialize socket and load current user from token
  useEffect(() => {
    const socket = socketService.getSocket();

    const fetchMe = async (authToken: string) => {
      try {
        const res = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${authToken}` },
        });

        if (res.ok) {
          const contentType = res.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            const data = await res.json();
            setUser(data.user);
            socketService.identify(data.user);
            setServerMode('connected');
            setIsLoading(false);
            return;
          }
        }

        // If server responded with 404/HTML (e.g. Vercel) or failed:
        fallbackLocalUser(authToken);
      } catch (err) {
        fallbackLocalUser(authToken);
      } finally {
        setIsLoading(false);
      }
    };

    const fallbackLocalUser = (authToken: string) => {
      setServerMode('standalone');
      const users = localDb.getUsers();
      const localFound = users.find((u) => u.id === authToken);
      if (localFound) {
        const { password_hash, ...safe } = localFound;
        setUser(safe);
        socketService.identify(safe);
      } else {
        // Fallback to cached user
        const cached = localStorage.getItem('cr_user_cached');
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            setUser(parsed);
            socketService.identify(parsed);
          } catch {
            localStorage.removeItem('cr_token');
            setToken(null);
            setUser(null);
          }
        }
      }
    };

    if (token) {
      fetchMe(token);
    } else {
      // Default to guest or fast login with Lucas Silva if first visit
      const defaultUserJson = localStorage.getItem('cr_user_cached');
      if (defaultUserJson) {
        try {
          const parsed = JSON.parse(defaultUserJson);
          setUser(parsed);
          setToken(parsed.id);
          socketService.identify(parsed);
        } catch {
          // ignore
        }
      }
      setIsLoading(false);
    }

    // Listen for ban notifications
    const onUserBanned = (data: { reason?: string }) => {
      setBannedReason(data?.reason || 'Sua conta foi suspensa pela moderação.');
      setUser(null);
      setToken(null);
      localStorage.removeItem('cr_token');
      localStorage.removeItem('cr_user_cached');
      socketService.clearIdentity();
    };

    // Listen for persistent admin broadcast messages (only replaced when admin sends another)
    const onAdminUserMessage = (data: { admin_message: User['admin_message'] }) => {
      setUser((prev) => {
        if (!prev) return prev;
        const updated = { ...prev, admin_message: data.admin_message || null };
        localStorage.setItem('cr_user_cached', JSON.stringify(updated));
        return updated;
      });
    };

    socket.on('user:banned', onUserBanned);
    socket.on('admin:user_message', onAdminUserMessage);

    return () => {
      socket.off('user:banned', onUserBanned);
      socket.off('admin:user_message', onAdminUserMessage);
    };
  }, [token]);

  const login = async (identifier: string, password: string) => {
    // 1. Try server endpoint first
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password }),
      });

      const contentType = res.headers.get('content-type');
      if (res.ok && contentType && contentType.includes('application/json')) {
        const data = await res.json();
        setUser(data.user);
        setToken(data.token);
        localStorage.setItem('cr_token', data.token);
        localStorage.setItem('cr_user_cached', JSON.stringify(data.user));
        socketService.identify(data.user);
        setServerMode('connected');
        return { success: true };
      }

      // If server returned 401/403 with valid JSON error message
      if (contentType && contentType.includes('application/json')) {
        const errData = await res.json();
        if (errData.banned) {
          setBannedReason(errData.error);
        }
        return { success: false, error: errData.error || 'Credenciais inválidas.' };
      }
    } catch (err) {
      // Network error or offline - fallback below
      console.log('Server unreachable, executing offline/standalone authentication...');
    }

    // 2. Resilient Client-Side Fallback (for Vercel or offline environments)
    try {
      const localResult = localDb.login(identifier, password);
      if (localResult) {
        setUser(localResult.user);
        setToken(localResult.token);
        localStorage.setItem('cr_token', localResult.token);
        localStorage.setItem('cr_user_cached', JSON.stringify(localResult.user));
        socketService.identify(localResult.user);
        setServerMode('standalone');
        return { success: true };
      } else {
        return {
          success: false,
          error: 'Credenciais inválidas. Verifique seu e-mail/código (#CR-...) e senha.',
        };
      }
    } catch (localErr: any) {
      if (localErr?.message?.includes('suspensa')) {
        setBannedReason(localErr.message);
      }
      return { success: false, error: localErr?.message || 'Falha ao autenticar.' };
    }
  };

  const register = async (userData: RegisterPayload) => {
    // 1. Try server endpoint first
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData),
      });

      const contentType = res.headers.get('content-type');
      if (res.ok && contentType && contentType.includes('application/json')) {
        const data = await res.json();
        setUser(data.user);
        setToken(data.token);
        localStorage.setItem('cr_token', data.token);
        localStorage.setItem('cr_user_cached', JSON.stringify(data.user));
        socketService.identify(data.user);
        setServerMode('connected');
        return { success: true };
      }

      if (contentType && contentType.includes('application/json')) {
        const errData = await res.json();
        return { success: false, error: errData.error || 'Erro ao registrar.' };
      }
    } catch (err) {
      console.log('Server unreachable, registering into local database...');
    }

    // 2. Resilient Client-Side Fallback (for Vercel or offline environments)
    try {
      const localResult = localDb.register(userData);
      setUser(localResult.user);
      setToken(localResult.token);
      localStorage.setItem('cr_token', localResult.token);
      localStorage.setItem('cr_user_cached', JSON.stringify(localResult.user));
      socketService.identify(localResult.user);
      setServerMode('standalone');
      return { success: true };
    } catch (localErr: any) {
      return { success: false, error: localErr?.message || 'Erro ao registrar.' };
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('cr_token');
    localStorage.removeItem('cr_user_cached');
    socketService.clearIdentity();
  };

  const switchUser = (newUser: User) => {
    setUser(newUser);
    setToken(newUser.id);
    localStorage.setItem('cr_token', newUser.id);
    localStorage.setItem('cr_user_cached', JSON.stringify(newUser));
    socketService.identify(newUser);
  };

  const clearBanNotice = () => {
    setBannedReason(null);
  };

  const updateCurrentUser = (updated: Partial<User>) => {
    if (user) {
      const merged = { ...user, ...updated };
      setUser(merged);
      localStorage.setItem('cr_user_cached', JSON.stringify(merged));
    }
  };

  const saveTeacherPaymentInfo = async (data: {
    pix_qr_image?: string;
    bank_details?: string;
  }) => {
    if (!user) return { success: false, error: 'Usuário não autenticado.' };
    try {
      const res = await fetch('/api/users/teacher-payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(data),
      });
      const contentType = res.headers.get('content-type');
      if (res.ok && contentType && contentType.includes('application/json')) {
        const result = await res.json();
        if (result.user) {
          setUser(result.user);
          localStorage.setItem('cr_user_cached', JSON.stringify(result.user));
        } else {
          updateCurrentUser(data);
        }
        return { success: true };
      }
      if (contentType && contentType.includes('application/json')) {
        const err = await res.json();
        return { success: false, error: err.error || 'Erro ao salvar dados.' };
      }
    } catch {
      // Fallback to localDb
    }
    const updated = localDb.updateUserProfile(user.id, data);
    if (updated) {
      setUser(updated);
      localStorage.setItem('cr_user_cached', JSON.stringify(updated));
    } else {
      updateCurrentUser(data);
    }
    return { success: true };
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        bannedReason,
        serverMode,
        login,
        register,
        logout,
        switchUser,
        clearBanNotice,
        updateCurrentUser,
        saveTeacherPaymentInfo,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
