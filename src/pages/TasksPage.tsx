import { useState } from 'react';
import { Plus, CheckSquare, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { TaskCard } from '@/components/tasks/TaskCard';
import { AddTaskDialog } from '@/components/tasks/AddTaskDialog';
import { PageError } from '@/components/PageError';
import { useTasks, useCreateTask, useUpdateTask, useDeleteTask } from '@/hooks/useTasks';
import { toast } from 'sonner';

type StatusFilter = 'all' | 'todo' | 'in_progress' | 'done';

const statusFilters: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'todo', label: 'To Do' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'done', label: 'Done' },
];

export default function TasksPage() {
  const [tab, setTab] = useState<'my_tasks' | 'assigned'>('my_tasks');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: tasks = [], isLoading, error, refetch } = useTasks(tab);
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();

  const filtered = statusFilter === 'all' ? tasks : tasks.filter((t) => t.status === statusFilter);

  const counts = {
    all: tasks.length,
    todo: tasks.filter((t) => t.status === 'todo').length,
    in_progress: tasks.filter((t) => t.status === 'in_progress').length,
    done: tasks.filter((t) => t.status === 'done').length,
  };

  const handleStatusChange = (id: string, status: string) => {
    updateTask.mutate({ id, status }, {
      onError: () => toast.error('Failed to update task'),
    });
  };

  const handleDelete = (id: string) => {
    deleteTask.mutate(id, {
      onError: () => toast.error('Failed to delete task'),
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Tasks</h1>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> New Task
        </Button>
      </div>

      <Tabs value={tab} onValueChange={(v) => { setTab(v as typeof tab); setStatusFilter('all'); }}>
        <TabsList>
          <TabsTrigger value="my_tasks">My Tasks</TabsTrigger>
          <TabsTrigger value="assigned">Assigned to Me</TabsTrigger>
        </TabsList>

        <div className="flex gap-2 mt-4 flex-wrap">
          {statusFilters.map((f) => (
            <Button
              key={f.value}
              variant={statusFilter === f.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStatusFilter(f.value)}
            >
              {f.label}
              <Badge variant="secondary" className="ml-1.5 h-5 min-w-[20px] px-1.5 text-xs">
                {counts[f.value]}
              </Badge>
            </Button>
          ))}
        </div>

        <TabsContent value={tab} className="mt-4">
          {error ? (
            <PageError message="Failed to load tasks. Please try again." onRetry={() => refetch()} />
          ) : isLoading ? (
            <div className="flex items-center justify-center py-20 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <CheckSquare className="h-12 w-12 mb-4 opacity-30" />
              <p className="text-lg font-medium">No tasks yet</p>
              <p className="text-sm mt-1">Create your first task to get started.</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {filtered.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onStatusChange={handleStatusChange}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <AddTaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={(payload) => {
          createTask.mutate(payload, {
            onError: () => toast.error('Failed to create task'),
          });
        }}
        isLoading={createTask.isPending}
      />
    </div>
  );
}
