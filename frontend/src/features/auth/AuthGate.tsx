import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from "react";
import { api, ApiError } from "@/lib/api";
import { signOut } from "@/lib/nativeSession";
import { IS_NATIVE } from "@/platform";
import { t } from "@/lib/i18n";
import type { AuthMe, AuthUser } from "@/lib/types";
import { Spinner } from "@/components/ui/primitives";
import { LoginPage } from "./LoginPage";

type AuthState = AuthMe;
export const ME_KEY = ["auth", "me"];

interface AuthCtx {
  user: AuthUser | null;
  username: string | null;
  logout: () => Promise<void>;
  /** Replace the cached account (after email/password changes). */
  setUser: (u: AuthUser) => void;
}
const Ctx = createContext<AuthCtx>({ user: null, username: null, logout: async () => {}, setUser: () => {} });
export const useAuth = () => useContext(Ctx);

/** Shows the login page until the server confirms a session; any 401 later sends you back to it. */
export function AuthGate({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ME_KEY, queryFn: () => api.get<AuthState>("/auth/me"), staleTime: 60_000, retry: 1 });

  // A session that expires (or is revoked) mid-use surfaces as a 401 on some query.
  useEffect(() => qc.getQueryCache().subscribe((e) => {
    const err = e.query.state.error;
    if (e.type === "updated" && err instanceof ApiError && err.status === 401 && e.query.queryKey[0] !== "auth") {
      qc.setQueryData<AuthState>(ME_KEY, (s) => (s ? { ...s, authenticated: false, user: null } : s));
    }
  }), [qc]);

  const logout = useCallback(async () => {
    if (IS_NATIVE) await signOut();
    else await api.post("/auth/logout").catch(() => undefined);
    // Flip the session first and keep the auth query: qc.clear() would orphan this gate's
    // observer, so it kept rendering the app. Then drop everything else (private data).
    const prev = qc.getQueryData<AuthState>(ME_KEY);
    await qc.cancelQueries();
    qc.setQueryData<AuthState>(ME_KEY, { authenticated: false, user: null, registration_open: prev?.registration_open ?? false, auth_enabled: true });
    qc.removeQueries({ predicate: (q) => q.queryKey[0] !== "auth" });
  }, [qc]);
  const setUser = useCallback((u: AuthUser) => qc.setQueryData<AuthState>(ME_KEY, (s) => (s ? { ...s, user: u } : s)), [qc]);
  const user = data?.user ?? null;
  const value = useMemo(() => ({ user, username: user?.username ?? null, logout, setUser }), [user, logout, setUser]);

  if (isLoading) return <div className="fixed inset-0 grid place-items-center"><Spinner /></div>;
  if (error && !data) {
    return (
      <div className="fixed inset-0 grid place-items-center p-6 text-center text-sm text-ink-2">
        <div>
          <p className="mb-3">{t("Can't reach the server.")}</p>
          <button className="text-accent underline" onClick={() => refetch()}>{t("Retry")}</button>
        </div>
      </div>
    );
  }
  const signedIn = !!data?.authenticated;
  return (
    <AnimatePresence mode="wait" initial={false}>
      {signedIn ? (
        <motion.div key="app" initial={{ opacity: 0, scale: 1.015 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}>
          <Ctx.Provider value={value}>{children}</Ctx.Provider>
        </motion.div>
      ) : (
        <motion.div key="login" exit={{ opacity: 0, scale: 0.98, filter: "blur(8px)" }} transition={{ duration: 0.3 }}>
          <LoginPage registrationOpen={!!data?.registration_open}
            onSignedIn={(u) => {
              qc.removeQueries({ predicate: (q) => q.queryKey[0] !== "auth" }); // never show a previous account's cache
              qc.setQueryData<AuthState>(ME_KEY, (s) => ({ registration_open: s?.registration_open ?? false, auth_enabled: true, authenticated: true, user: u }));
            }} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
