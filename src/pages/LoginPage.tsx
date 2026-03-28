import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Shield, ArrowRight, Mail, AlertCircle, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';

const RATE_LIMIT_KEY = 'login_rate_limit';
const MAX_ATTEMPTS = 3;
const COOLDOWN_MS = 5 * 60 * 1000;

interface RateLimitState {
  count: number;
  lockedUntil: number | null;
}

function getRateLimit(): RateLimitState {
  try {
    const raw = localStorage.getItem(RATE_LIMIT_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { count: 0, lockedUntil: null };
}

function setRateLimit(state: RateLimitState) {
  localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(state));
}

function clearRateLimit() {
  localStorage.removeItem(RATE_LIMIT_KEY);
}

export default function LoginPage() {
  const { isAuthenticated, isLoading, login, authError } = useAuth();

  const [email, setEmail] = useState('');
  const [emailVerified, setEmailVerified] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');

  const [rateLimit, setRateLimitState] = useState<RateLimitState>(() => getRateLimit());
  const [remainingSeconds, setRemainingSeconds] = useState(0);

  const isLocked = rateLimit.lockedUntil !== null && rateLimit.lockedUntil > Date.now();

  // ✅ countdown (stable)
  useEffect(() => {
    if (!rateLimit.lockedUntil) return;

    const interval = setInterval(() => {
      const diff = Math.max(0, Math.ceil((rateLimit.lockedUntil! - Date.now()) / 1000));
      setRemainingSeconds(diff);

      if (diff <= 0) {
        const cleared = { count: 0, lockedUntil: null };
        clearRateLimit();
        setRateLimitState(cleared);
        setError('');
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [rateLimit.lockedUntil]);

  const formatTime = useCallback((s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }, []);

  if (isAuthenticated) return <Navigate to="/dashboard" replace />;

  if (isLoading && !authError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const recordFailure = () => {
    setRateLimitState(prev => {
      const newCount = prev.count + 1;

      const newState: RateLimitState = {
        count: newCount,
        lockedUntil:
          newCount >= MAX_ATTEMPTS ? Date.now() + COOLDOWN_MS : prev.lockedUntil,
      };

      setRateLimit(newState);

      if (newCount < MAX_ATTEMPTS) {
        setError('Something went wrong. Please try again.');
      } else {
        setError('');
      }

      return newState;
    });
  };

  const handleVerifyEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocked) return;

    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;

    setVerifying(true);
    setError('');

    try {
      const { data, error: fnError } = await supabase.functions.invoke('verify-email', {
        body: { email: trimmed },
      });

      if (fnError || !data) {
        recordFailure();
        return;
      }

      if (data.exists) {
        setEmailVerified(true);
        clearRateLimit();
        setRateLimitState({ count: 0, lockedUntil: null });
      } else {
        setError('No account found for this email. Contact your administrator.');
        recordFailure();
      }
    } catch {
      setError('Unexpected error. Please try again.');
      recordFailure();
    } finally {
      setVerifying(false);
    }
  };

  const handleLogin = () => {
    login(email.trim().toLowerCase());
  };

  return (
    <div className="min-h-screen flex bg-background">
      <div className="flex-1 flex items-center justify-center p-8">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="w-full max-w-md"
        >
          <Card className="border-0 shadow-lg">
            <CardContent className="p-8 space-y-4">

              <h2 className="text-xl font-bold text-center">Login</h2>

              {!emailVerified ? (
                <form onSubmit={handleVerifyEmail} className="space-y-4">
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setError('');
                    }}
                    disabled={isLocked}
                    placeholder="Email"
                  />

                  {isLocked && (
                    <p className="text-sm text-destructive">
                      Try again in {formatTime(remainingSeconds)}
                    </p>
                  )}

                  {error && <p className="text-sm text-destructive">{error}</p>}

                  <Button disabled={verifying || isLocked}>
                    {verifying ? <Loader2 className="animate-spin" /> : 'Verify Email'}
                  </Button>
                </form>
              ) : (
                <Button onClick={handleLogin}>Login with Passkey</Button>
              )}

            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}