import { Card, CardContent } from '@/components/ui/card';
import { useLeadStats } from '@/hooks/useLeads';
import { Target, CheckCircle2, AlertTriangle, XCircle, ShieldCheck, Package, Clock } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export function LeadStatsCards() {
  const { data: stats, isLoading } = useLeadStats();

  const cards = [
    { label: 'Total Leads', value: stats?.total ?? 0, icon: Target, color: 'text-primary' },
    { label: 'Active Clients', value: stats?.active ?? 0, icon: CheckCircle2, color: 'text-[hsl(var(--success))]' },
    { label: 'Potential', value: stats?.potential ?? 0, icon: ShieldCheck, color: 'text-[hsl(var(--info))]' },
    { label: 'Active Services', value: stats?.total_services ?? 0, icon: Package, color: 'text-primary' },
    { label: 'Expiring 30d', value: stats?.expiring_30 ?? 0, icon: AlertTriangle, color: 'text-[hsl(var(--warning))]' },
    { label: 'Expiring 7d', value: stats?.expiring_7 ?? 0, icon: Clock, color: 'text-destructive' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {cards.map((c) => (
        <Card key={c.label} className="border">
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <c.icon className={`h-7 w-7 shrink-0 ${c.color}`} />
            <div className="min-w-0">
              {isLoading ? <Skeleton className="h-6 w-12" /> : <p className="text-2xl font-bold text-foreground">{c.value}</p>}
              <p className="text-xs text-muted-foreground truncate">{c.label}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
