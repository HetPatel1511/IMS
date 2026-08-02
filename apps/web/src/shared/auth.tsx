import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { api, getAccessToken, setAccessToken } from './api';

export type SessionUser = {
  id: string;
  email: string;
  fullName: string;
  role: string;
};

type AuthContextValue = {
  user: SessionUser | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(() => {
    const raw = localStorage.getItem('ims_user');
    return raw ? (JSON.parse(raw) as SessionUser) : null;
  });
  const [token, setToken] = useState<string | null>(getAccessToken());

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      async login(email, password) {
        const res = await api<{ user: SessionUser; accessToken: string }>('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        });
        setAccessToken(res.data.accessToken);
        localStorage.setItem('ims_user', JSON.stringify(res.data.user));
        setToken(res.data.accessToken);
        setUser(res.data.user);
      },
      async logout() {
        try {
          await api('/auth/logout', { method: 'POST' });
        } finally {
          setAccessToken(null);
          localStorage.removeItem('ims_user');
          setToken(null);
          setUser(null);
        }
      },
    }),
    [user, token],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
