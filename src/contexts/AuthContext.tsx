import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import type { AppRole } from '@/types/roles';
import { supabase } from '@/integrations/supabase/client';

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
  user: UserProfile | null;
  roles: AppRole[];
  primaryRole: AppRole | null;
  login: (loginHint?: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

const SYNC_TIMEOUT_MS = 10_000;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const {
    isAuthenticated: auth0IsAuth,
    isLoading: auth0Loading,
    user: auth0User,
    loginWithRedirect,
    logout: auth0Logout,
  } = useAuth0();

  const [roles, setRoles] = useState<AppRole[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [syncLoading, setSyncLoading] = useState(false);

  const syncProfile = useCallback(async (userId: string, email: string, name: string, avatar?: string) => {
    setSyncLoading(true);

    const fallbackProfile: UserProfile = { id: userId, email, displayName: name, avatarUrl: avatar };

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);

      const { data, error } = await supabase.functions.invoke('sync-profile', {
        body: {
          user_id: userId,
          email,
          display_name: name,
          avatar_url: avatar,
        },
      });

      clearTimeout(timeout);

      if (error) {
        console.error('Sync profile error:', error);
        setProfile(fallbackProfile);
        setRoles([]);
        return;
      }

      const p = data.profile;
      setProfile({
        id: p.user_id,
        email: p.email || email,
        displayName: p.display_name || name,
        avatarUrl: p.avatar_url || avatar,
        teamId: p.team_id,
      });
      setRoles((data.roles || []) as AppRole[]);
    } catch (err) {
      console.error('Failed to sync profile (timeout or network):', err);
      setProfile(fallbackProfile);
      setRoles([]);
    } finally {
      setSyncLoading(false);
    }
  }, []);

  useEffect(() => {
    console.log('[Auth] State:', { auth0Loading, auth0IsAuth, auth0User: auth0User?.email });
    if (auth0IsAuth && auth0User) {
      const userId = auth0User.sub || '';
      console.log('[Auth] Authenticated, syncing profile for:', userId);
      syncProfile(userId, auth0User.email || '', auth0User.name || '', auth0User.picture);
    } else if (!auth0Loading) {
      console.log('[Auth] Not authenticated, clearing state');
      setRoles([]);
      setProfile(null);
    }
  }, [auth0IsAuth, auth0User, auth0Loading, syncProfile]);

  const login = (loginHint?: string) =>
    loginWithRedirect({
      authorizationParams: {
        login_hint: loginHint,
      },
    });

  const logout = () => auth0Logout({ logoutParams: { returnTo: window.location.origin } });

  const primaryRole = roles.length > 0 ? roles[0] : null;

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated: auth0IsAuth,
        isLoading: auth0Loading || syncLoading,
        isInitializing: auth0Loading,
        user: profile,
        roles,
        primaryRole,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
