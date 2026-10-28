import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, setSessionExpiredHandler, tokenStore } from "./api.js";
import { clearMemoryDrafts, setDraftScope } from "./hooks.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(tokenStore.get()));

  // Saved form drafts are kept per user. Set before children render so their first read uses the right scope.
  setDraftScope(user?.id);

  const logout = useCallback(() => {
    tokenStore.clear();
    clearMemoryDrafts();
    setUser(null);
  }, []);

  useEffect(() => {
    setSessionExpiredHandler(logout);
  }, [logout]);

  // Restore the session from a saved token.
  useEffect(() => {
    if (!tokenStore.get()) return;
    api
      .me()
      .then(setUser)
      .catch(logout)
      .finally(() => setLoading(false));
  }, [logout]);

  const authenticate = useCallback(async (mode, email, password, name) => {
    const result = mode === "register" ? await api.register(email, password, name) : await api.login(email, password);
    tokenStore.set(result.token);
    setUser(result.user);
  }, []);

  /** Replaces the signed-in user's details after a profile change. */
  const updateUser = useCallback((next) => setUser((current) => ({ ...current, ...next })), []);

  const value = useMemo(() => ({ user, loading, authenticate, logout, updateUser }), [user, loading, authenticate, logout, updateUser]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
