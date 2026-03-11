import { useState, useMemo } from 'react';
import { Plus, CheckSquare, Loader2, ArrowUp, ArrowDown, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { TaskCard, type TaskAssignee } from '@/components/tasks/TaskCard';
import { TaskDetailSheet } from '@/components/tasks/TaskDetailSheet';
import { AddTaskDialog } from '@/components/tasks/AddTaskDialog';
import { AcceptDeclineDialog } from '@/components/tasks/AcceptDeclineDialog';
import { SubmitTaskDialog } from '@/components/tasks/SubmitTaskDialog';
import { ReviewTaskDialog } from '@/components/tasks/ReviewTaskDialog';
import { PageError } from '@/components/PageError';
import { useTasks, useCreateTask, useUpdateTask, useDeleteTask, type TaskTab, type Task } from '@/hooks/useTasks';
import { useDirectoryData } from '@/hooks/useDirectoryData';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

type StatusFilter = string;
type PriorityFilter = 'all' | 'low' | 'medium' | 'high' | 'urgent';
type SortField = 'created_at' | 'due_date' | 'priority';
type SortDir = 'asc' | 'desc';

const GLOBAL_ROLES = ['chairman', 'vice_president', 'hr', 'head_of_operations'];
const LEAD_ROLES = ['head_of_accounting', 'head_of_marketing', 'sales_lead', 'technical_lead', 'team_development_lead'];

const personalStatusFilters = [
  { value: 'all', label: 'All' },
  { value: 'todo', label: 'To Do' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'done', label: 'Done' },
];

const assignedStatusFilters = [
  { value: 'all', label: 'All' },
  { value: 'pending_accept', label: 'Pending' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'declined', label: 'Declined' },
];

const priorityOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

export default function TasksPage() {
  const { user, roles } = useAuth();
  const [tab, setTab] = useState<TaskTab>('my_tasks');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [sheetAction, setSheetAction] = useState<'accept' | 'decline' | 'submit' | 'approve' | 'reject' | null>(null);

  const { data: tasks = [], isLoading, error, refetch } = useTasks(tab);
  const { data: directoryUsers } = useDirectoryData();
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();

  const canSeeTeamTab = roles.some((r) => [...GLOBAL_ROLES, ...LEAD_ROLES].includes(r));

  const assigneeMap = useMemo(() => {
    const map = new Map<string, TaskAssignee>();
    directoryUsers?.forEach((u) => {
      map.set(u.userId, { displayName: u.displayName, avatarUrl: u.avatarUrl });
    });
    return map;
  }, [directoryUsers]);

  const currentStatusFilters = tab === 'my_tasks' ? personalStatusFilters : assignedStatusFilters;

  const filtered = useMemo(() => {
    let result = tasks;
    if (statusFilter !== 'all') result = result.filter((t) => t.status === statusFilter);
    if (priorityFilter !== 'all') result = result.filter((t) => t.priority === priorityFilter);

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
  }, [tasks, statusFilter, priorityFilter, sortField, sortDir]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: tasks.length };
    tasks.forEach((t) => {
      counts[t.status] = (counts[t.status] || 0) + 1;
    });
    return counts;
  }, [tasks]);

  const handleStatusChange = (id: string, status: string, extra?: Record<string, unknown>) => {
    updateTask.mutate({ id, status, ...extra }, {
      onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to update task'),
    });
  };

  const handleDelete = (id: string) => {
    deleteTask.mutate(id, {
      onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to delete task'),
    });
  };

  const toggleSortDir = () => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Tasks</h1>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> New Task
        </Button>
      </div>

      <Tabs value={tab} onValueChange={(v) => { setTab(v as TaskTab); setStatusFilter('all'); }}>
        <TabsList>
          <TabsTrigger value="my_tasks">My Tasks</TabsTrigger>
          <TabsTrigger value="assigned">Assigned to Me</TabsTrigger>
          {canSeeTeamTab && (
            <TabsTrigger value="team_tasks">Team Tasks</TabsTrigger>
          )}
        </TabsList>

        {/* Status filter chips */}
        <div className="flex gap-2 mt-4 flex-wrap">
          {currentStatusFilters.map((f) => (
            <Button
              key={f.value}
              variant={statusFilter === f.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStatusFilter(f.value)}
            >
              {f.label}
              <Badge variant="secondary" className="ml-1.5 h-5 min-w-[20px] px-1.5 text-xs">
                {statusCounts[f.value] || 0}
              </Badge>
            </Button>
          ))}
        </div>

        {/* Filters & sorting */}
        <div className="flex items-center gap-3 mt-3 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Filter className="h-3.5 w-3.5" />
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

        {['my_tasks', 'assigned', 'team_tasks'].map((tabValue) => (
          <TabsContent key={tabValue} value={tabValue} className="mt-4">
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
                  {tasks.length === 0 ? 'Create your first task to get started.' : 'Try adjusting your filters.'}
                </p>
              </div>
            ) : (
              <div className="grid gap-3">
                {filtered.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    currentUserId={user?.id || ''}
                    assignee={task.assigned_to ? assigneeMap.get(task.assigned_to) || null : null}
                    creator={task.created_by !== user?.id ? assigneeMap.get(task.created_by) || null : null}
                    onStatusChange={handleStatusChange}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>

      <AddTaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={(payload) => {
          createTask.mutate(payload, {
            onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to create task'),
          });
        }}
        isLoading={createTask.isPending}
      />
    </div>
  );
}
