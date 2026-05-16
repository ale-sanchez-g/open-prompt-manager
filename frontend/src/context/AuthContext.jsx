import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

import {
  authApi,
  clearAccessToken,
  getAccessToken,
  setAccessToken,
  subscribeToAuthFailures,
} from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(Boolean(getAccessToken()));
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeToAuthFailures(() => {
      clearAccessToken();
      setIsAuthenticated(false);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    let isMounted = true;

    authApi.refresh()
      .then((response) => {
        if (!isMounted) {
          return;
        }
        setAccessToken(response.data.access_token);
        setIsAuthenticated(true);
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }
        clearAccessToken();
        setIsAuthenticated(false);
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
    setIsAuthenticated(true);
    return response;
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } finally {
      clearAccessToken();
      setIsAuthenticated(false);
    }
  };

  const value = useMemo(
    () => ({
      isAuthenticated,
      isReady,
      login,
      logout,
      register: authApi.register,
    }),
    [isAuthenticated, isReady],
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
