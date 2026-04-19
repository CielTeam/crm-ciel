import { cn } from '@/lib/utils';
import { Check, X, HelpCircle, Clock } from 'lucide-react';

interface Props {
  response: string;
  size?: 'sm' | 'md';
}

const config: Record<string, { label: string; icon: typeof Check; classes: string }> = {
  accepted: { label: 'Accepted', icon: Check, classes: 'bg-success/15 text-success border-success/30' },
  declined: { label: 'Declined', icon: X, classes: 'bg-destructive/15 text-destructive border-destructive/30' },
  tentative: { label: 'Maybe', icon: HelpCircle, classes: 'bg-warning/15 text-warning border-warning/30' },
  pending: { label: 'Pending', icon: Clock, classes: 'bg-muted text-muted-foreground border-border' },
};

export function EventResponseChip({ response, size = 'sm' }: Props) {
  const c = config[response] || config.pending;
  const Icon = c.icon;
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-full border font-medium',
      size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs',
      c.classes,
    )}>
      <Icon className={size === 'sm' ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
      {c.label}
    </span>
  );
}
