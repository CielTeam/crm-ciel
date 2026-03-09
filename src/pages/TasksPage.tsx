import { useState, useMemo } from 'react';
import { Plus, CheckSquare, Loader2, ArrowUpDown, ArrowUp, ArrowDown, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { TaskCard, type TaskAssignee } from '@/components/tasks/TaskCard';
import { AddTaskDialog } from '@/components/tasks/AddTaskDialog';
import { PageError } from '@/components/PageError';
import { useTasks, useCreateTask, useUpdateTask, useDeleteTask } from '@/hooks/useTasks';
import { useDirectoryData } from '@/hooks/useDirectoryData';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type StatusFilter = 'all' | 'todo' | 'in_progress' | 'done';
type PriorityFilter = 'all' | 'low' | 'medium' | 'high' | 'urgent';
type SortField = 'created_at' | 'due_date' | 'priority';
type SortDir = 'asc' | 'desc';

const statusFilters: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'todo', label: 'To Do' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'done', label: 'Done' },
];

const priorityOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

export default function TasksPage() {
  const [tab, setTab] = useState<'my_tasks' | 'assigned'>('my_tasks');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: tasks = [], isLoading, error, refetch } = useTasks(tab);
  const { data: directoryUsers } = useDirectoryData();
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();

  const assigneeMap = useMemo(() => {
    const map = new Map<string, TaskAssignee>();
    directoryUsers?.forEach((u) => {
      map.set(u.userId, { displayName: u.displayName, avatarUrl: u.avatarUrl });
    });
    return map;
  }, [directoryUsers]);

  // Unique assignees present in current tasks for the filter dropdown
  const taskAssignees = useMemo(() => {
    const ids = new Set<string>();
    tasks.forEach((t) => { if (t.assigned_to) ids.add(t.assigned_to); });
    return [...ids].map((id) => ({
      id,
      name: assigneeMap.get(id)?.displayName || id,
    })).sort((a, b) => a.name.localeCompare(b.name));
  }, [tasks, assigneeMap]);

  const filtered = useMemo(() => {
    let result = tasks;
    if (statusFilter !== 'all') result = result.filter((t) => t.status === statusFilter);
    if (priorityFilter !== 'all') result = result.filter((t) => t.priority === priorityFilter);
    if (assigneeFilter !== 'all') result = result.filter((t) => t.assigned_to === assigneeFilter);

    result = [...result].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'created_at') {
        cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      } else if (sortField === 'due_date') {
        const da = a.due_date ? new Date(a.due_date).getTime() : Infinity;
        const db = b.due_date ? new Date(b.due_date).getTime() : Infinity;
        cmp = da - db;
      } else if (sortField === 'priority') {
        cmp = (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2);
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [tasks, statusFilter, priorityFilter, assigneeFilter, sortField, sortDir]);

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

  const activeFilterCount = [priorityFilter !== 'all', assigneeFilter !== 'all'].filter(Boolean).length;

  const toggleSortDir = () => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));

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

        {/* Status filter chips */}
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

        {/* Advanced filters & sorting */}
        <div className="flex items-center gap-3 mt-3 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Filter className="h-3.5 w-3.5" />
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="h-4 min-w-[16px] px-1 text-[10px]">{activeFilterCount}</Badge>
            )}
          </div>

          <Select value={priorityFilter} onValueChange={(v) => setPriorityFilter(v as PriorityFilter)}>
            <SelectTrigger className="h-8 w-[120px] text-xs">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priorities</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>

          {taskAssignees.length > 0 && (
            <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
              <SelectTrigger className="h-8 w-[150px] text-xs">
                <SelectValue placeholder="Assignee" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Assignees</SelectItem>
                {taskAssignees.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <div className="ml-auto flex items-center gap-1.5">
            <Select value={sortField} onValueChange={(v) => setSortField(v as SortField)}>
              <SelectTrigger className="h-8 w-[120px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="created_at">Date Created</SelectItem>
                <SelectItem value="due_date">Due Date</SelectItem>
                <SelectItem value="priority">Priority</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleSortDir}>
              {sortDir === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
            </Button>
          </div>
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
              <p className="text-lg font-medium">
                {tasks.length === 0 ? 'No tasks yet' : 'No tasks match filters'}
              </p>
              <p className="text-sm mt-1">
                {tasks.length === 0
                  ? 'Create your first task to get started.'
                  : 'Try adjusting your filters.'}
              </p>
            </div>
          ) : (
            <div className="grid gap-3">
              {filtered.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  assignee={task.assigned_to ? assigneeMap.get(task.assigned_to) || null : null}
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
