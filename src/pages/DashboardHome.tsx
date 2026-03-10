import { useAuth } from '@/contexts/AuthContext';
import { ROLE_LABELS, EXECUTIVE_ROLES, LEAD_ROLES } from '@/types/roles';
import { useDashboardStats } from '@/hooks/useDashboardStats';
import { ExecutiveDashboard } from '@/components/dashboard/ExecutiveDashboard';
import { HRDashboard } from '@/components/dashboard/HRDashboard';
import { LeadDashboard } from '@/components/dashboard/LeadDashboard';
import { DriverDashboard } from '@/components/dashboard/DriverDashboard';
import { EmployeeDashboard } from '@/components/dashboard/EmployeeDashboard';
import { Skeleton } from '@/components/ui/skeleton';
import type { AppRole } from '@/types/roles';

function getDashboardTier(role: AppRole | null): string {
  if (!role) return 'employee';
  if (EXECUTIVE_ROLES.includes(role)) return 'executive';
  if (role === 'hr') return 'hr';
  if (LEAD_ROLES.includes(role)) return 'lead';
  if (role === 'driver') return 'driver';
  return 'employee';
}

export default function DashboardHome() {
  const { user, primaryRole } = useAuth();
  const { data: stats, isLoading } = useDashboardStats();
  const tier = getDashboardTier(primaryRole);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          Welcome back, {user?.displayName?.split(' ')[0] || 'User'}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {primaryRole ? ROLE_LABELS[primaryRole] : 'No role'} Dashboard • {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {isLoading || !stats ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-20 rounded-lg" />
            ))}
          </div>
          <Skeleton className="h-40 rounded-lg" />
        </div>
      ) : (
        <>
          {tier === 'executive' && <ExecutiveDashboard stats={stats} />}
          {tier === 'hr' && <HRDashboard stats={stats} />}
          {tier === 'lead' && <LeadDashboard stats={stats} />}
          {tier === 'driver' && <DriverDashboard stats={stats} />}
          {tier === 'employee' && <EmployeeDashboard stats={stats} />}
        </>
      )}
    </div>
  );
}
