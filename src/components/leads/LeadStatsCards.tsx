import { Card, CardContent } from '@/components/ui/card';
import { useLeadStats } from '@/hooks/useLeads';
import { Target, CheckCircle2, AlertTriangle, ShieldCheck, Package, Clock, DollarSign, TrendingUp } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export function LeadStatsCards() {
  const { data: stats, isLoading } = useLeadStats();

  const row1 = [
    { label: 'Total Leads', value: stats?.total ?? 0, icon: Target, color: 'text-primary' },
    { label: 'Active Pipeline', value: (stats?.total ?? 0) - (stats?.won ?? 0) - (stats?.lost ?? 0), icon: ShieldCheck, color: 'text-[hsl(var(--info))]' },
    { label: 'Qualified', value: stats?.qualified ?? 0, icon: CheckCircle2, color: 'text-[hsl(var(--warning))]' },
    { label: 'Won', value: stats?.won ?? 0, icon: CheckCircle2, color: 'text-[hsl(var(--success))]' },
  ];

  const row2 = [
    { label: 'Pipeline Value', value: stats?.pipeline_value ? `$${Number(stats.pipeline_value).toLocaleString()}` : '$0', icon: DollarSign, color: 'text-primary', isText: true },
    { label: 'Weighted Forecast', value: stats?.weighted_forecast ? `$${Number(stats.weighted_forecast).toLocaleString()}` : '$0', icon: TrendingUp, color: 'text-[hsl(var(--success))]', isText: true },
    { label: 'Overdue Follow-ups', value: stats?.overdue_follow_ups ?? 0, icon: AlertTriangle, color: 'text-destructive' },
    { label: 'Expiring 7d', value: stats?.expiring_7 ?? 0, icon: Clock, color: 'text-destructive' },
  ];

  const renderCard = (c: typeof row1[0] & { isText?: boolean }) => (
    <Card key={c.label} className="border">
      <CardContent className="pt-4 pb-4 flex items-center gap-3">
        <c.icon className={`h-7 w-7 shrink-0 ${c.color}`} />
        <div className="min-w-0">
          {isLoading ? <Skeleton className="h-6 w-12" /> : (
            <p className="text-2xl font-bold text-foreground">{c.isText ? c.value : c.value}</p>
          )}
          <p className="text-xs text-muted-foreground truncate">{c.label}</p>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {row1.map(renderCard)}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {row2.map(renderCard)}
      </div>
    </div>
  );
}
