import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

import {
  authApi,
  clearAccessToken,
  getAccessToken,
  setAccessToken,
  subscribeToAuthFailures,
} from '../services/api';

const AuthContext = createContext(null);

async function loadCurrentUser() {
  if (typeof authApi.me !== 'function') {
    return null;
  }
  try {
    const response = await authApi.me();
    return response.data;
  } catch (error) {
    console.error('Failed to load current user:', error);
    return null;
  }
}

export function AuthProvider({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(Boolean(getAccessToken()));
  const [isReady, setIsReady] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const unsubscribe = subscribeToAuthFailures(() => {
      clearAccessToken();
      setIsAuthenticated(false);
      setUser(null);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    let isMounted = true;

    authApi.refresh()
      .then(async (response) => {
        if (!isMounted) {
          return;
        }
        setAccessToken(response.data.access_token);
        const currentUser = await loadCurrentUser();
        if (!isMounted) {
          return;
        }
        setUser(currentUser);
        setIsAuthenticated(true);
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }
        clearAccessToken();
        setIsAuthenticated(false);
        setUser(null);
      })
      .finally(() => {
        if (isMounted) {
          setIsReady(true);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const login = async (credentials) => {
    const response = await authApi.login(credentials);
    setAccessToken(response.data.access_token);
    const currentUser = await loadCurrentUser();
    setUser(currentUser);
    setIsAuthenticated(true);
    return response;
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } finally {
      clearAccessToken();
      setIsAuthenticated(false);
      setUser(null);
    }
  };

  const value = useMemo(
    () => ({
      isAuthenticated,
      isReady,
      user,
      isAdmin: user?.role === 'admin',
      login,
      logout,
      register: authApi.register,
    }),
    [isAuthenticated, isReady, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
