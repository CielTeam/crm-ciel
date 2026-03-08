import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Shield, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';

export default function LoginPage() {
  const { isAuthenticated, isLoading, login } = useAuth();

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
                  Sign in securely with your passkey to access your dashboard.
                </p>
              </div>

              <Button
                onClick={login}
                className="w-full h-11 gradient-primary shadow-primary hover:opacity-90 transition-opacity text-primary-foreground font-medium"
              >
                Sign in with Passkey
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>

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
