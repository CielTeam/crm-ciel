import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';

export interface SoundPreferences {
  messages: boolean;
  tasks: boolean;
  notifications: boolean;
}

const DEFAULTS: SoundPreferences = { messages: true, tasks: true, notifications: true };

function getStorageKey(userId: string) {
  return `sound-prefs-${userId}`;
}

function load(userId: string): SoundPreferences {
  try {
    const raw = localStorage.getItem(getStorageKey(userId));
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function useSoundPreferences() {
  const { user } = useAuth();
  const userId = user?.id ?? '';
  const [prefs, setPrefs] = useState<SoundPreferences>(() => userId ? load(userId) : { ...DEFAULTS });

  useEffect(() => {
    if (userId) setPrefs(load(userId));
  }, [userId]);

  const toggle = useCallback(
    (key: keyof SoundPreferences) => {
      if (!userId) return;
      setPrefs((prev) => {
        const next = { ...prev, [key]: !prev[key] };
        localStorage.setItem(getStorageKey(userId), JSON.stringify(next));
        return next;
      });
    },
    [userId],
  );

  return { ...prefs, toggle };
}

/** Standalone read for use outside React components / in effects */
export function readSoundPreferences(userId: string): SoundPreferences {
  return load(userId);
}
