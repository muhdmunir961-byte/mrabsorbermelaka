import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { z } from 'zod';
import { Role } from '@mr/shared';
import { ApiError, api } from './api';

const SessionUserSchema = z.object({
  employeeId: z.uuid(),
  role: Role,
  fullName: z.string().min(1),
});

export type SessionUser = z.infer<typeof SessionUserSchema>;

interface SessionValue {
  user: SessionUser | null;
  loading: boolean;
  signIn: (user: SessionUser) => void;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    api('/auth/me', SessionUserSchema)
      .then((me) => {
        if (active) setUser(me);
      })
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 401) return;
        // A network failure leaves the user signed out rather than pretending.
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const signIn = useCallback((next: SessionUser) => setUser(next), []);

  const signOut = useCallback(async () => {
    await api('/auth/logout', z.void(), { method: 'POST' }).catch(() => undefined);
    setUser(null);
  }, []);

  const value = useMemo<SessionValue>(
    () => ({ user, loading, signIn, signOut }),
    [user, loading, signIn, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
}
