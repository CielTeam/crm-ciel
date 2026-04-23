import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import type { AppRole } from '@/types/roles';
import { supabase } from '@/integrations/supabase/client';

const AUTH0_AUDIENCE = 'https://crm-ciel.lovable.app/api';

interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  teamId?: string;
}

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  isInitializing: boolean;
  authError: Error | null;
  user: UserProfile | null;
  roles: AppRole[];
  primaryRole: AppRole | null;
  login: (loginHint?: string) => void;
  logout: () => void;
  getToken: () => Promise<string>;
  refreshProfile: () => Promise<void>;
}

interface SyncProfileResponse {
  profile?: {
    user_id: string;
    email?: string | null;
    display_name?: string | null;
    avatar_url?: string | null;
    team_id?: string | null;
  };
  roles?: AppRole[];
}

const AuthContext = createContext<AuthState | undefined>(undefined);

const SYNC_TIMEOUT_MS = 10_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error(`Request timed out after ${ms}ms`));
    }, ms);

    promise
      .then((value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      })
      .catch((error: unknown) => {
        window.clearTimeout(timeoutId);
        reject(error);
      });
  });
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const {
    isAuthenticated: auth0IsAuth,
    isLoading: auth0Loading,
    user: auth0User,
    loginWithRedirect,
    logout: auth0Logout,
    error: auth0Error,
    getAccessTokenSilently,
  } = useAuth0();

  const [roles, setRoles] = useState<AppRole[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [syncLoading, setSyncLoading] = useState(false);

  const getToken = useCallback(async (): Promise<string> => {
    return getAccessTokenSilently({
      authorizationParams: { audience: AUTH0_AUDIENCE },
    });
  }, [getAccessTokenSilently]);

  const syncProfile = useCallback(
    async (email: string, name: string, avatar?: string) => {
      setSyncLoading(true);

      try {
        // Get a proper JWT token first
        const token = await getAccessTokenSilently({
          authorizationParams: { audience: AUTH0_AUDIENCE },
        });

        const { data, error } = await withTimeout(
          supabase.functions.invoke<SyncProfileResponse>('sync-profile', {
            body: {
              email,
              display_name: name,
              avatar_url: avatar,
            },
            headers: { Authorization: `Bearer ${token}` },
          }),
          SYNC_TIMEOUT_MS
        );

        if (error) {
          console.error('Sync profile error:', error);
          return;
        }

        const syncedProfile = data?.profile;

        if (syncedProfile) {
          setProfile({
            id: syncedProfile.user_id,
            email: syncedProfile.email ?? email,
            displayName: syncedProfile.display_name ?? name,
            avatarUrl: syncedProfile.avatar_url ?? avatar,
            teamId: syncedProfile.team_id ?? undefined,
          });
        }

        setRoles(data?.roles ?? []);
      } catch (err: unknown) {
        console.error('Failed to sync profile:', err);
      } finally {
        setSyncLoading(false);
      }
    },
    [getAccessTokenSilently]
  );

  useEffect(() => {
    if (auth0Loading) return;

    if (auth0IsAuth && auth0User) {
      const email = auth0User.email ?? '';
      const name = auth0User.name ?? email ?? 'User';
      const avatar = auth0User.picture;

      void syncProfile(email, name, avatar);
      return;
    }

    setRoles([]);
    setProfile(null);
  }, [auth0IsAuth, auth0Loading, auth0User, syncProfile]);

  const login = useCallback(
    (loginHint?: string) => {
      void loginWithRedirect({
        authorizationParams: loginHint
          ? { login_hint: loginHint }
          : undefined,
      });
    },
    [loginWithRedirect]
  );

  const logout = useCallback(() => {
    void auth0Logout({
      logoutParams: { returnTo: window.location.origin },
    });
  }, [auth0Logout]);

  const refreshProfile = useCallback(async () => {
    if (!auth0IsAuth || !auth0User) return;
    const email = auth0User.email ?? '';
    const name = auth0User.name ?? email ?? 'User';
    const avatar = auth0User.picture;
    await syncProfile(email, name, avatar);
  }, [auth0IsAuth, auth0User, syncProfile]);

  const primaryRole = roles.length > 0 ? roles[0] : null;

  const value = useMemo<AuthState>(
    () => ({
      isAuthenticated: auth0IsAuth,
      isLoading: auth0Loading || syncLoading,
      isInitializing: auth0Loading,
      authError: auth0Error ?? null,
      user: profile,
      roles,
      primaryRole,
      login,
      logout,
      getToken,
      refreshProfile,
    }),
    [
      auth0IsAuth,
      auth0Loading,
      syncLoading,
      auth0Error,
      profile,
      roles,
      primaryRole,
      login,
      logout,
      getToken,
      refreshProfile,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);

  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return ctx;
}
