import { Card, CardContent } from '@/components/ui/card';
import { useLeadStats } from '@/hooks/useLeads';
import { Target, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export function LeadStatsCards() {
  const { data: stats, isLoading } = useLeadStats();

  const cards = [
    { label: 'Total Leads', value: stats?.total ?? 0, icon: Target, color: 'text-primary' },
    { label: 'Active', value: stats?.active ?? 0, icon: CheckCircle2, color: 'text-[hsl(var(--success))]' },
    { label: 'Expiring in 30d', value: stats?.expiring_30 ?? 0, icon: AlertTriangle, color: 'text-[hsl(var(--warning))]' },
    { label: 'Lost', value: stats?.lost ?? 0, icon: XCircle, color: 'text-destructive' },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((c) => (
        <Card key={c.label} className="border">
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <c.icon className={`h-8 w-8 ${c.color}`} />
            <div>
              {isLoading ? <Skeleton className="h-6 w-12" /> : <p className="text-2xl font-bold text-foreground">{c.value}</p>}
              <p className="text-xs text-muted-foreground">{c.label}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
