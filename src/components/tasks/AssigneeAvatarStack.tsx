import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { TaskAssigneeMember } from '@/hooks/useTasks';

function initials(name: string | null | undefined): string {
  if (!name) return '?';
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

interface Props {
  assignees: TaskAssigneeMember[];
  size?: 'sm' | 'md';
  max?: number;
  className?: string;
}

export function AssigneeAvatarStack({ assignees, size = 'sm', max = 3, className }: Props) {
  if (!assignees || assignees.length === 0) return null;

  const sized = size === 'md' ? 'h-7 w-7 text-[11px]' : 'h-5 w-5 text-[10px]';
  const visible = assignees.slice(0, max);
  const remaining = assignees.length - visible.length;

  return (
    <TooltipProvider delayDuration={200}>
      <div className={cn('flex items-center', className)}>
        {visible.map((a, idx) => (
          <Tooltip key={a.user_id}>
            <TooltipTrigger asChild>
              <Avatar
                className={cn(
                  sized,
                  'border-2 border-background ring-0',
                  idx > 0 && '-ml-2'
                )}
              >
                <AvatarImage src={a.avatar_url || undefined} alt={a.display_name || ''} />
                <AvatarFallback className="bg-primary/10 text-primary">
                  {initials(a.display_name)}
                </AvatarFallback>
              </Avatar>
            </TooltipTrigger>
            <TooltipContent side="top">
              <div className="flex items-center gap-1.5">
                <span>{a.display_name || 'Unknown'}</span>
                {a.is_primary && (
                  <Badge variant="secondary" className="h-4 px-1 text-[9px]">
                    Primary
                  </Badge>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
        ))}
        {remaining > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className={cn(
                  sized,
                  '-ml-2 inline-flex items-center justify-center rounded-full bg-muted text-muted-foreground border-2 border-background font-medium'
                )}
              >
                +{remaining}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">
              <div className="flex flex-col gap-0.5">
                {assignees.slice(max).map((a) => (
                  <span key={a.user_id} className="text-xs">
                    {a.display_name || 'Unknown'}
                  </span>
                ))}
              </div>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
}
