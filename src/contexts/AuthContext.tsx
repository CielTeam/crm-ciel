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
  user: UserProfile | null;
  roles: AppRole[];
  primaryRole: AppRole | null;
  login: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

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
    try {
      const { data, error } = await supabase.functions.invoke('sync-profile', {
        body: {
          user_id: userId,
          email,
          display_name: name,
          avatar_url: avatar,
        },
      });

      if (error) {
        console.error('Sync profile error:', error);
        // Fallback to Auth0 data
        setProfile({ id: userId, email, displayName: name, avatarUrl: avatar });
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
      console.error('Failed to sync profile:', err);
      setProfile({ id: userId, email, displayName: name, avatarUrl: avatar });
      setRoles([]);
    } finally {
      setSyncLoading(false);
    }
  }, []);

  useEffect(() => {
    if (auth0IsAuth && auth0User) {
      const userId = auth0User.sub || '';
      syncProfile(userId, auth0User.email || '', auth0User.name || '', auth0User.picture);
    } else if (!auth0Loading) {
      setRoles([]);
      setProfile(null);
    }
  }, [auth0IsAuth, auth0User, auth0Loading, syncProfile]);

  const login = () => loginWithRedirect();
  const logout = () => auth0Logout({ logoutParams: { returnTo: window.location.origin } });

  const isLoading = auth0Loading || syncLoading;
  const primaryRole = roles.length > 0 ? roles[0] : null;

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated: auth0IsAuth && !isLoading,
        isLoading,
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
