import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import type { AppRole } from '@/types/roles';
import { supabase } from '@/lib/supabase';

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
    getAccessTokenSilently,
  } = useAuth0();

  const [roles, setRoles] = useState<AppRole[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [roleLoading, setRoleLoading] = useState(false);

  const fetchUserRoles = useCallback(async (userId: string) => {
    setRoleLoading(true);
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId);

      if (error) {
        console.error('Error fetching roles:', error);
        setRoles([]);
      } else {
        setRoles((data || []).map((r) => r.role as AppRole));
      }
    } catch (err) {
      console.error('Failed to fetch roles:', err);
      setRoles([]);
    } finally {
      setRoleLoading(false);
    }
  }, []);

  const fetchProfile = useCallback(async (userId: string, email: string, name: string, avatar?: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (data && !error) {
        setProfile({
          id: data.user_id,
          email: data.email || email,
          displayName: data.display_name || name,
          avatarUrl: data.avatar_url || avatar,
          teamId: data.team_id,
        });
      } else {
        // Fallback to Auth0 data
        setProfile({
          id: userId,
          email,
          displayName: name,
          avatarUrl: avatar,
        });
      }
    } catch {
      setProfile({
        id: userId,
        email,
        displayName: name,
        avatarUrl: avatar,
      });
    }
  }, []);

  useEffect(() => {
    if (auth0IsAuth && auth0User) {
      const userId = auth0User.sub || '';
      fetchUserRoles(userId);
      fetchProfile(userId, auth0User.email || '', auth0User.name || '', auth0User.picture);
    } else if (!auth0Loading) {
      setRoles([]);
      setProfile(null);
    }
  }, [auth0IsAuth, auth0User, auth0Loading, fetchUserRoles, fetchProfile]);

  const login = () => loginWithRedirect();
  const logout = () => auth0Logout({ logoutParams: { returnTo: window.location.origin } });

  const isLoading = auth0Loading || roleLoading;
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
