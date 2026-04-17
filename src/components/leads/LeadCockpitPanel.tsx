import { useState } from 'react';
import { differenceInDays, format } from 'date-fns';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent } from '@/components/ui/card';
import {
  AlertTriangle, CalendarClock, Copy, DollarSign, Package, Target,
  TrendingUp, User as UserIcon, Clock, ListTodo, MapPin,
} from 'lucide-react';
import { useUpdateLead, type Lead, type LeadService, LEAD_STAGES } from '@/hooks/useLeads';
import { useDirectoryData } from '@/hooks/useDirectoryData';

const SCORE_COLORS = {
  hot: 'bg-destructive/10 text-destructive border-destructive/30',
  warm: 'bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/30',
  cold: 'bg-[hsl(var(--info))]/10 text-[hsl(var(--info))] border-[hsl(var(--info))]/30',
};

interface Props {
  lead: Lead;
  services: LeadService[];
  duplicateCount?: number;
}

function StatRow({ icon: Icon, label, value, valueClass }: { icon: React.ElementType; label: string; value: React.ReactNode; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </span>
      <span className={`font-medium ${valueClass || 'text-foreground'}`}>{value}</span>
    </div>
  );
}

export function LeadCockpitPanel({ lead, services, duplicateCount = 0 }: Props) {
  const { data: profiles } = useDirectoryData();
  const updateLead = useUpdateLead();
  const [followUpOpen, setFollowUpOpen] = useState(false);

  const ownerProfile = profiles?.find(p => p.userId === lead.assigned_to);
  const stageConfig = LEAD_STAGES.find(s => s.value === lead.stage);
  const band = (lead.score_band || 'cold') as 'hot' | 'warm' | 'cold';

  const followUpDate = lead.next_follow_up_at ? new Date(lead.next_follow_up_at) : null;
  const isOverdue = followUpDate && followUpDate < new Date();
  const lastContact = lead.last_contacted_at ? new Date(lead.last_contacted_at) : null;
  const daysSinceContact = lastContact ? Math.floor((Date.now() - lastContact.getTime()) / 86400000) : null;

  const atRisk = services.filter(s => {
    const d = differenceInDays(new Date(s.expiry_date), new Date());
    return d >= 0 && d <= 30;
  }).length;

  // Risk flags
  const flags: { label: string; tone: 'warn' | 'danger' | 'info' }[] = [];
  if (daysSinceContact !== null && daysSinceContact > 14) flags.push({ label: `${daysSinceContact}d no activity`, tone: 'warn' });
  if (lastContact === null) flags.push({ label: 'Never contacted', tone: 'warn' });
  if (isOverdue) flags.push({ label: 'Follow-up overdue', tone: 'danger' });
  if (duplicateCount > 0) flags.push({ label: `${duplicateCount} possible duplicate`, tone: 'info' });
  if (!lead.next_follow_up_at && lead.stage !== 'won' && lead.stage !== 'lost') flags.push({ label: 'No next step', tone: 'warn' });

  const handleScheduleFollowUp = (date: Date | undefined) => {
    if (!date) return;
    updateLead.mutate({ id: lead.id, next_follow_up_at: date.toISOString() }, {
      onSuccess: () => setFollowUpOpen(false),
    });
  };

  return (
    <Card className="border sticky top-4">
      <CardContent className="pt-4 pb-4 space-y-4">
        {/* Owner */}
        <div className="flex items-center gap-2.5">
          <Avatar className="h-9 w-9">
            <AvatarFallback className="text-xs bg-muted">
              {(ownerProfile?.displayName || lead.assigned_to || 'UN').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Owner</p>
            <p className="text-sm font-medium text-foreground truncate">
              {ownerProfile?.displayName || (lead.assigned_to ? lead.assigned_to.slice(0, 12) : 'Unassigned')}
            </p>
          </div>
        </div>

        {/* Stage + score */}
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline" className={stageConfig?.color || ''}>{stageConfig?.label || lead.stage}</Badge>
          <Badge variant="outline" className={`capitalize ${SCORE_COLORS[band]}`}>
            {band} · {lead.score ?? 0}
          </Badge>
        </div>

        <Separator />

        {/* Quick stats */}
        <div className="space-y-2">
          <StatRow
            icon={DollarSign}
            label="Value"
            value={lead.estimated_value ? `${lead.currency} ${Number(lead.estimated_value).toLocaleString()}` : '—'}
          />
          <StatRow
            icon={TrendingUp}
            label="Forecast"
            value={lead.weighted_forecast ? `${lead.currency} ${Number(lead.weighted_forecast).toLocaleString()}` : '—'}
          />
          <StatRow
            icon={Target}
            label="Probability"
            value={`${lead.probability_percent}%`}
          />
          <StatRow
            icon={CalendarClock}
            label="Close date"
            value={lead.expected_close_date ? format(new Date(lead.expected_close_date), 'MMM d, yyyy') : '—'}
          />
        </div>

        <Separator />

        {/* Activity */}
        <div className="space-y-2">
          <StatRow
            icon={Clock}
            label="Last contact"
            value={lastContact ? `${daysSinceContact}d ago` : 'Never'}
            valueClass={daysSinceContact !== null && daysSinceContact > 14 ? 'text-[hsl(var(--warning))]' : 'text-foreground'}
          />
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <CalendarClock className="h-3.5 w-3.5" /> Next follow-up
            </span>
            <Popover open={followUpOpen} onOpenChange={setFollowUpOpen}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className={`h-6 px-1.5 text-xs ${isOverdue ? 'text-destructive' : 'text-foreground'}`}>
                  {followUpDate ? format(followUpDate, 'MMM d') : 'Set'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="single"
                  selected={followUpDate || undefined}
                  onSelect={handleScheduleFollowUp}
                  initialFocus
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>
          <StatRow icon={ListTodo} label="Open tasks" value={0} />
          <StatRow
            icon={Package}
            label="Services"
            value={
              <span className="flex items-center gap-1">
                {services.length}
                {atRisk > 0 && <span className="text-destructive">({atRisk} at risk)</span>}
              </span>
            }
          />
        </div>

        {/* Location */}
        {(lead.city || lead.state_province || lead.country_name || lead.country) && (
          <>
            <Separator />
            <div className="flex items-start gap-1.5 text-xs">
              <MapPin className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
              <span className="text-foreground">
                {[lead.city, lead.state_province, lead.country_name || lead.country].filter(Boolean).join(', ')}
              </span>
            </div>
          </>
        )}

        {/* Risk flags */}
        {flags.length > 0 && (
          <>
            <Separator />
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Risk flags</p>
              <div className="flex flex-wrap gap-1">
                {flags.map((f, i) => (
                  <Badge
                    key={i}
                    variant="outline"
                    className={
                      f.tone === 'danger' ? 'bg-destructive/10 text-destructive border-destructive/30 text-[10px]'
                      : f.tone === 'warn' ? 'bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/30 text-[10px]'
                      : 'bg-[hsl(var(--info))]/10 text-[hsl(var(--info))] border-[hsl(var(--info))]/30 text-[10px]'
                    }
                  >
                    <AlertTriangle className="h-2.5 w-2.5 mr-1" /> {f.label}
                  </Badge>
                ))}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
