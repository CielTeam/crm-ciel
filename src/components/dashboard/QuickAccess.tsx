import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar, CheckSquare, MessageSquare, Users, Palmtree } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const quickLinks = [
  { title: 'Calendar', icon: Calendar, path: '/calendar', color: 'text-info' },
  { title: 'Tasks', icon: CheckSquare, path: '/tasks', color: 'text-success' },
  { title: 'Messages', icon: MessageSquare, path: '/messages', color: 'text-primary' },
  { title: 'Leaves', icon: Palmtree, path: '/leaves', color: 'text-warning' },
  { title: 'Directory', icon: Users, path: '/directory', color: 'text-muted-foreground' },
];

interface QuickAccessProps {
  links?: typeof quickLinks;
}

export function QuickAccess({ links = quickLinks }: QuickAccessProps) {
  const navigate = useNavigate();

  return (
    <Card className="border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-foreground">Quick Access</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {links.map((link) => (
            <button
              key={link.path}
              onClick={() => navigate(link.path)}
              className="flex flex-col items-center gap-2 p-4 rounded-lg border bg-background hover:bg-muted transition-colors"
            >
              <link.icon className={`h-5 w-5 ${link.color}`} />
              <span className="text-xs font-medium text-foreground">{link.title}</span>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
