import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, CheckSquare, AlertTriangle, Palmtree } from 'lucide-react';

interface Department {
  id: string;
  name: string;
  department: string;
  memberCount: number;
  openTasks: number;
  overdueTasks: number;
  pendingLeaves: number;
}

export function DepartmentScorecard({ departments }: { departments: Department[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {departments.map((dept) => (
        <Card key={dept.id} className="border">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-foreground">{dept.name}</h4>
              <Badge variant="outline" className="text-[10px] capitalize">{dept.department}</Badge>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center gap-2">
                <Users className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{dept.memberCount} members</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckSquare className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs text-muted-foreground">{dept.openTasks} open tasks</span>
              </div>
              <div className="flex items-center gap-2">
                <AlertTriangle className={`h-3.5 w-3.5 ${dept.overdueTasks > 0 ? 'text-destructive' : 'text-muted-foreground'}`} />
                <span className={`text-xs ${dept.overdueTasks > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {dept.overdueTasks} overdue
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Palmtree className={`h-3.5 w-3.5 ${dept.pendingLeaves > 0 ? 'text-warning' : 'text-muted-foreground'}`} />
                <span className="text-xs text-muted-foreground">{dept.pendingLeaves} pending leaves</span>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
