import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api, User, ApiError } from '@/lib/api';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check if user is already authenticated
  const checkAuth = useCallback(async () => {
    try {
      // Try to fetch state - if successful, user is authenticated
      await api.getState();
      // For demo, we'll set a default user since the API doesn't return user info
      setUser({ username: 'operator', role: 'operator', full_name: 'Grid Operator' });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setUser(null);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const login = async (username: string, password: string): Promise<boolean> => {
    try {
      const result = await api.login({ username, password });
      if (result.success) {
        // Set user based on username (role determination from Flask session)
        const role = username === 'admin' ? 'admin' : 'operator';
        const fullName = username === 'admin' ? 'System Administrator' : 'Grid Operator';
        setUser({ username, role, full_name: fullName });
        return true;
      }
      return false;
    } catch (error) {
      // Bubble up connectivity problems so the UI can show a clear message
      if (error instanceof ApiError && error.status === 404) {
        throw error;
      }
      return false;
    }
  };

  const logout = async () => {
    await api.logout();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
