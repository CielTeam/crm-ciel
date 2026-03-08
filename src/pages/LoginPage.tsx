import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Shield, ArrowRight, Mail, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';

export default function LoginPage() {
  const { isAuthenticated, isLoading, login } = useAuth();
  const [email, setEmail] = useState('');
  const [emailVerified, setEmailVerified] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleVerifyEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;

    setVerifying(true);
    setError('');

    try {
      const { data, error: fnError } = await supabase.functions.invoke('verify-email', {
        body: { email: trimmed },
      });

      if (fnError) {
        setError('Something went wrong. Please try again.');
        return;
      }

      if (data?.exists) {
        setEmailVerified(true);
      } else {
        setError('No account found for this email. Contact your administrator.');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setVerifying(false);
    }
  };

  const handleLogin = () => {
    login(email.trim().toLowerCase());
  };

  return (
    <div className="min-h-screen flex bg-background">
      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:w-1/2 gradient-primary relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_hsl(217_91%_60%_/_0.3),_transparent_70%)]" />
        <div className="relative z-10 flex flex-col justify-between p-12 text-primary-foreground">
          <div>
            <div className="h-10 w-10 rounded-xl bg-primary-foreground/20 backdrop-blur-sm flex items-center justify-center">
              <span className="text-lg font-bold">C</span>
            </div>
          </div>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
          >
            <h1 className="text-4xl font-bold leading-tight mb-4">
              CIEL Internal<br />CRM Platform
            </h1>
            <p className="text-primary-foreground/70 text-lg max-w-md">
              Enterprise resource management with role-based access, 
              integrated scheduling, and full auditability.
            </p>
          </motion.div>
          <p className="text-primary-foreground/40 text-xs">
            © {new Date().getFullYear()} CIEL. All rights reserved.
          </p>
        </div>
      </div>

      {/* Right panel — login */}
      <div className="flex-1 flex items-center justify-center p-8">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-md"
        >
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="h-9 w-9 rounded-lg gradient-primary flex items-center justify-center">
              <span className="text-sm font-bold text-primary-foreground">C</span>
            </div>
            <span className="text-xl font-bold text-foreground">CIEL CRM</span>
          </div>

          <Card className="border-0 shadow-lg">
            <CardContent className="p-8">
              <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-primary/10 mb-4">
                  <Shield className="h-6 w-6 text-primary" />
                </div>
                <h2 className="text-2xl font-bold text-foreground mb-2">Welcome back</h2>
                <p className="text-sm text-muted-foreground">
                  {emailVerified
                    ? 'Your email has been verified. Sign in with your passkey.'
                    : 'Enter your email to verify your account.'}
                </p>
              </div>

              <AnimatePresence mode="wait">
                {!emailVerified ? (
                  <motion.form
                    key="email-step"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    transition={{ duration: 0.2 }}
                    onSubmit={handleVerifyEmail}
                    className="space-y-4"
                  >
                    <div className="space-y-2">
                      <Label htmlFor="email" className="text-foreground">Email address</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="email"
                          type="email"
                          placeholder="you@company.com"
                          value={email}
                          onChange={(e) => { setEmail(e.target.value); setError(''); }}
                          className="pl-10"
                          required
                          autoFocus
                        />
                      </div>
                    </div>

                    {error && (
                      <motion.div
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-center gap-2 text-sm text-destructive"
                      >
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        <span>{error}</span>
                      </motion.div>
                    )}

                    <Button
                      type="submit"
                      disabled={verifying || !email.trim()}
                      className="w-full h-11 gradient-primary shadow-primary hover:opacity-90 transition-opacity text-primary-foreground font-medium"
                    >
                      {verifying ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          Continue
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </>
                      )}
                    </Button>
                  </motion.form>
                ) : (
                  <motion.div
                    key="passkey-step"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-4"
                  >
                    <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted text-sm text-foreground">
                      <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="truncate">{email.trim().toLowerCase()}</span>
                      <button
                        type="button"
                        onClick={() => { setEmailVerified(false); setError(''); }}
                        className="ml-auto text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Change
                      </button>
                    </div>

                    <Button
                      onClick={handleLogin}
                      className="w-full h-11 gradient-primary shadow-primary hover:opacity-90 transition-opacity text-primary-foreground font-medium"
                    >
                      Sign in with Passkey
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>

              <p className="text-center text-[11px] text-muted-foreground mt-6">
                Authentication powered by Auth0 WebAuthn.
                <br />
                Contact your administrator if you need access.
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
