import React, { createContext, useContext, useState, useEffect } from 'react';
import { api, type User } from '../lib/api-client';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (payload: any) => Promise<any>;
  register: (payload: any) => Promise<any>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  isAdmin: boolean;
  isContestant: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchCurrentUser = async () => {
    const token = localStorage.getItem('olpai_token');
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const u = await api.getMe();
      setUser(u);
    } catch (err) {
      console.error('Failed to fetch user', err);
      localStorage.removeItem('olpai_token');
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCurrentUser();
  }, []);

  const login = async (payload: any) => {
    setLoading(true);
    try {
      const data = await api.login(payload);
      if (data?.token?.access_token) {
        localStorage.setItem('olpai_token', data.token.access_token);
        setUser(data.user);
      }
      return data;
    } catch (err) {
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const register = async (payload: any) => {
    setLoading(true);
    try {
      const res = await api.register(payload);
      return res;
    } catch (err) {
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('olpai_token');
    setUser(null);
  };

  const refreshUser = async () => {
    const u = await api.getMe();
    setUser(u);
  };

  const isAdmin = user?.role === 'admin';
  const isContestant = user?.role === 'contestant';

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        logout,
        refreshUser,
        isAdmin,
        isContestant,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
