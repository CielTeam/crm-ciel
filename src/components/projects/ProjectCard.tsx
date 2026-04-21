import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Calendar, AlertCircle, CheckCircle2, Clock } from 'lucide-react';
import { format } from 'date-fns';
import type { Project, ProjectAnalytics } from '@/hooks/useProjects';

interface Props {
  project: Project;
  analytics: ProjectAnalytics;
  onClick?: () => void;
}

const STATUS_TONE: Record<string, string> = {
  active: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30',
  on_hold: 'bg-amber-500/10 text-amber-700 border-amber-500/30',
  completed: 'bg-primary/10 text-primary border-primary/30',
  archived: 'bg-muted text-muted-foreground',
};

export function ProjectCard({ project, analytics, onClick }: Props) {
  return (
    <Card className="cursor-pointer hover:border-primary/40 transition-colors" onClick={onClick}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {project.color && <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: project.color }} />}
            <h3 className="font-semibold text-sm text-foreground truncate">{project.name}</h3>
          </div>
          <Badge variant="outline" className={`text-[10px] capitalize ${STATUS_TONE[project.status] || ''}`}>
            {project.status.replace('_', ' ')}
          </Badge>
        </div>

        {project.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">{project.description}</p>
        )}

        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-medium text-foreground">{analytics.completion_percent}%</span>
          </div>
          <Progress value={analytics.completion_percent} className="h-1.5" />
        </div>

        <div className="grid grid-cols-4 gap-2 text-center">
          <div>
            <p className="text-sm font-semibold text-foreground">{analytics.total}</p>
            <p className="text-[10px] text-muted-foreground">Total</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-primary">{analytics.in_progress}</p>
            <p className="text-[10px] text-muted-foreground">Active</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-emerald-600">{analytics.done}</p>
            <p className="text-[10px] text-muted-foreground">Done</p>
          </div>
          <div>
            <p className={`text-sm font-semibold ${analytics.overdue > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
              {analytics.overdue}
            </p>
            <p className="text-[10px] text-muted-foreground">Overdue</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap text-[11px] text-muted-foreground border-t pt-2">
          {project.target_end_date && (
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {format(new Date(project.target_end_date), 'MMM d')}
            </span>
          )}
          {analytics.remaining_minutes > 0 && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              ~{Math.round(analytics.remaining_minutes / 60)}h left
            </span>
          )}
          {analytics.on_track === false && (
            <Badge variant="outline" className="text-[10px] bg-destructive/10 text-destructive border-destructive/30">
              <AlertCircle className="h-2.5 w-2.5 mr-0.5" /> At risk
            </Badge>
          )}
          {analytics.on_track === true && analytics.total > 0 && analytics.completion_percent < 100 && (
            <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
              <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" /> On track
            </Badge>
          )}
          {project.is_personal && <Badge variant="secondary" className="text-[10px]">Personal</Badge>}
          {project.department && !project.is_personal && (
            <Badge variant="secondary" className="text-[10px] capitalize">{project.department}</Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
