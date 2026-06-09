import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { User, UserRole } from '@/types';

// ── Auth contract ──────────────────────────────────────────────────────────
// Gate-only stage: identity + role come from Supabase Auth (user_metadata).
// App data still lives in localStorage; the seed personas remain as a demo
// backdrop showing edits flowing through the pipeline.
//
// `role` is the EFFECTIVE role — for an admin using the "view as" switcher it
// reflects the impersonated role, so every role-gated screen honours it for
// free. `realRole` is the account's actual assigned role; the switcher itself
// is gated on `canViewAs` (realRole === 'admin') so an admin can always get
// back even while previewing another role.

const VALID_ROLES: UserRole[] = [
  'risk_analyst', 'tester', 'admin', 'risk_lead', 'testing_lead', 'it_team',
];

interface AuthContextValue {
  currentUser: User | null; // .role is the effective (view-as aware) role
  role: UserRole | null; // effective role
  realRole: UserRole | null; // actual assigned role
  isAuthenticated: boolean;
  loading: boolean;
  needsPasswordChange: boolean;
  signInWithPassword: (email: string, password: string) => Promise<string | null>;
  updatePassword: (newPassword: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  // Admin-only demo affordance — preview the platform as another role.
  canViewAs: boolean;
  viewAsRole: UserRole | null; // null = viewing as self
  setViewAsRole: (role: UserRole | null) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface MappedUser {
  base: User;
  realRole: UserRole;
  needsPasswordChange: boolean;
}

function mapSessionToUser(session: Session | null): MappedUser | null {
  const u = session?.user;
  if (!u) return null;

  const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
  const appMeta = (u.app_metadata ?? {}) as Record<string, unknown>;
  // Prefer app_metadata.role (admin-set, not user-editable — the eventual home
  // for roles) but fall back to user_metadata.role for the dashboard-edited
  // gate-only stage.
  const rawRole =
    (typeof appMeta.role === 'string' && appMeta.role) ||
    (typeof meta.role === 'string' && meta.role) ||
    '';
  // Default unknown/missing roles to the least-privileged role.
  const realRole: UserRole = (VALID_ROLES as string[]).includes(rawRole)
    ? (rawRole as UserRole)
    : 'risk_analyst';

  const email = u.email ?? '';
  const name =
    (typeof meta.name === 'string' && meta.name.trim()) ||
    email.split('@')[0] ||
    'User';
  const avatar_seed =
    (typeof meta.avatar_seed === 'string' && meta.avatar_seed) || email || u.id;

  return {
    base: { id: u.id, name, email, role: realRole, avatar_seed },
    realRole,
    needsPasswordChange: meta.password_set !== true,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewAsRole, setViewAsRoleState] = useState<UserRole | null>(null);

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const mapped = useMemo(() => mapSessionToUser(session), [session]);
  const realRole = mapped?.realRole ?? null;
  const canViewAs = realRole === 'admin';

  // Only admins may impersonate; ignore any stale override otherwise.
  const effectiveViewAs = canViewAs ? viewAsRole : null;
  const effectiveRole: UserRole | null = effectiveViewAs ?? realRole;

  const currentUser: User | null = useMemo(() => {
    if (!mapped) return null;
    return { ...mapped.base, role: effectiveRole ?? mapped.base.role };
  }, [mapped, effectiveRole]);

  const setViewAsRole = useCallback((role: UserRole | null) => {
    setViewAsRoleState(role);
  }, []);

  const signInWithPassword = useCallback(
    async (email: string, password: string): Promise<string | null> => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return error ? error.message : null;
    },
    []
  );

  const updatePassword = useCallback(
    async (newPassword: string): Promise<string | null> => {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
        data: { password_set: true },
      });
      return error ? error.message : null;
    },
    []
  );

  const signOut = useCallback(async (): Promise<void> => {
    setViewAsRoleState(null);
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      currentUser,
      role: effectiveRole,
      realRole,
      isAuthenticated: session !== null,
      loading,
      needsPasswordChange: mapped?.needsPasswordChange ?? false,
      signInWithPassword,
      updatePassword,
      signOut,
      canViewAs,
      viewAsRole: effectiveViewAs,
      setViewAsRole,
    }),
    [
      currentUser, effectiveRole, realRole, session, loading, mapped,
      signInWithPassword, updatePassword, signOut, canViewAs, effectiveViewAs,
      setViewAsRole,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
