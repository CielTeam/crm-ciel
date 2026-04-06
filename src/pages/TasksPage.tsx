import { useState, useMemo, useCallback } from 'react';
import { isPast, isToday } from 'date-fns';
import { Plus, CheckSquare, Loader2, ArrowUp, ArrowDown, Filter, LayoutList, Columns3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { TaskCard, type TaskAssignee } from '@/components/tasks/TaskCard';
import { TaskBoardView } from '@/components/tasks/TaskBoardView';
import { TaskDetailSheet } from '@/components/tasks/TaskDetailSheet';
import { TaskSearchBar } from '@/components/tasks/TaskSearchBar';
import { AddTaskDialog } from '@/components/tasks/AddTaskDialog';
import { AcceptDeclineDialog } from '@/components/tasks/AcceptDeclineDialog';
import { SubmitTaskDialog } from '@/components/tasks/SubmitTaskDialog';
import { ReviewTaskDialog } from '@/components/tasks/ReviewTaskDialog';
import { PageError } from '@/components/PageError';
import { useTasks, useCreateTask, useUpdateTask, useDeleteTask, useTogglePin, useMarkDone, useMarkUndone, type TaskTab, type Task } from '@/hooks/useTasks';
import { useDirectoryData } from '@/hooks/useDirectoryData';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

type StatusFilter = string;
type PriorityFilter = 'all' | 'low' | 'medium' | 'high' | 'urgent';
type SortField = 'created_at' | 'due_date' | 'priority' | 'pinned' | 'updated_at';
type SortDir = 'asc' | 'desc';
type ViewMode = 'list' | 'board';

const GLOBAL_ROLES = ['chairman', 'vice_president', 'hr', 'head_of_operations'];
const LEAD_ROLES = ['head_of_accounting', 'head_of_marketing', 'sales_lead', 'technical_lead', 'team_development_lead'];

const statusFilters = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'pinned', label: 'Pinned' },
];

const priorityOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

const DONE_STATUSES = ['done', 'approved'];
const PENDING_STATUSES = ['pending_accept', 'accepted', 'todo'];
const IN_PROGRESS_STATUSES = ['in_progress', 'submitted'];

export default function TasksPage() {
  const { user, roles } = useAuth();
  const [tab, setTab] = useState<TaskTab>('my_tasks');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [sheetAction, setSheetAction] = useState<'accept' | 'decline' | 'submit' | 'approve' | 'reject' | null>(null);

  const { data: tasks = [], isLoading, error, refetch } = useTasks(tab);
  const { data: directoryUsers } = useDirectoryData();
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const togglePin = useTogglePin();
  const markDone = useMarkDone();
  const markUndone = useMarkUndone();

  const canSeeTeamTab = roles.some((r) => [...GLOBAL_ROLES, ...LEAD_ROLES].includes(r));
  const canSeeAssignedByMe = roles.some((r) => [...GLOBAL_ROLES, ...LEAD_ROLES].includes(r));

  const assigneeMap = useMemo(() => {
    const map = new Map<string, TaskAssignee>();
    directoryUsers?.forEach((u) => {
      map.set(u.userId, { displayName: u.displayName, avatarUrl: u.avatarUrl });
    });
    return map;
  }, [directoryUsers]);

  const filtered = useMemo(() => {
    let result = tasks;

    // Search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((t) =>
        t.title.toLowerCase().includes(q) ||
        (t.description && t.description.toLowerCase().includes(q))
      );
    }

    // Status group filter
    if (statusFilter === 'pending') {
      result = result.filter((t) => PENDING_STATUSES.includes(t.status));
    } else if (statusFilter === 'in_progress') {
      result = result.filter((t) => IN_PROGRESS_STATUSES.includes(t.status));
    } else if (statusFilter === 'completed') {
      result = result.filter((t) => DONE_STATUSES.includes(t.status));
    } else if (statusFilter === 'overdue') {
      result = result.filter((t) => t.due_date && !t.completed_at && isPast(new Date(t.due_date)) && !isToday(new Date(t.due_date)));
    } else if (statusFilter === 'pinned') {
      result = result.filter((t) => t.pinned);
    }

    // Priority filter
    if (priorityFilter !== 'all') result = result.filter((t) => t.priority === priorityFilter);

    // Sorting
    result = [...result].sort((a, b) => {
      // Pinned first always when sort is 'pinned'
      if (sortField === 'pinned') {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }

      let cmp = 0;
      if (sortField === 'created_at') {
        cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      } else if (sortField === 'due_date') {
        const da = a.due_date ? new Date(a.due_date).getTime() : Infinity;
        const db = b.due_date ? new Date(b.due_date).getTime() : Infinity;
        cmp = da - db;
      } else if (sortField === 'priority') {
        cmp = (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2);
      } else if (sortField === 'updated_at') {
        cmp = new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [tasks, statusFilter, priorityFilter, sortField, sortDir, searchQuery]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: tasks.length, pinned: 0, overdue: 0, pending: 0, in_progress: 0, completed: 0 };
    tasks.forEach((t) => {
      if (t.pinned) counts.pinned++;
      if (t.due_date && !t.completed_at && isPast(new Date(t.due_date)) && !isToday(new Date(t.due_date))) counts.overdue++;
      if (PENDING_STATUSES.includes(t.status)) counts.pending++;
      if (IN_PROGRESS_STATUSES.includes(t.status)) counts.in_progress++;
      if (DONE_STATUSES.includes(t.status)) counts.completed++;
    });
    return counts;
  }, [tasks]);

  const handleStatusChange = useCallback((id: string, status: string, extra?: Record<string, unknown>) => {
    updateTask.mutate({ id, status, ...extra }, {
      onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to update task'),
    });
  }, [updateTask]);

  const handleDelete = useCallback((id: string) => {
    deleteTask.mutate(id, {
      onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to delete task'),
    });
  }, [deleteTask]);

  const handleTogglePin = useCallback((id: string) => {
    togglePin.mutate(id, {
      onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to toggle pin'),
    });
  }, [togglePin]);

  const handleMarkDone = useCallback((id: string) => {
    markDone.mutate({ id }, {
      onSuccess: () => toast.success('Task marked as done'),
      onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to mark done'),
    });
  }, [markDone]);

  const handleMarkUndone = useCallback((id: string) => {
    markUndone.mutate(id, {
      onSuccess: () => toast.success('Task marked as not done'),
      onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to mark undone'),
    });
  }, [markUndone]);

  const toggleSortDir = () => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));

  const renderTaskList = () => {
    if (error) return <PageError message="Failed to load tasks. Please try again." onRetry={() => refetch()} />;
    if (isLoading) return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );

    if (filtered.length === 0) return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <CheckSquare className="h-12 w-12 mb-4 opacity-30" />
        <p className="text-lg font-medium">
          {tasks.length === 0 ? 'No tasks yet' : 'No tasks match filters'}
        </p>
        <p className="text-sm mt-1">
          {tasks.length === 0 ? 'Create your first task to get started.' : 'Try adjusting your filters.'}
        </p>
      </div>
    );

    if (viewMode === 'board') {
      return (
        <div className="overflow-x-auto -mx-4 px-4">
          <TaskBoardView
            tasks={filtered}
            currentUserId={user?.id || ''}
            assigneeMap={assigneeMap}
            onStatusChange={handleStatusChange}
            onDelete={handleDelete}
            onCardClick={(task) => setSelectedTask(task)}
            onTogglePin={handleTogglePin}
            onMarkDone={handleMarkDone}
            onMarkUndone={handleMarkUndone}
            tab={tab}
          />
        </div>
      );
    }

    return (
      <div className="grid gap-3">
        {filtered.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            currentUserId={user?.id || ''}
            assignee={task.assigned_to ? assigneeMap.get(task.assigned_to) ?? null : null}
            creator={task.created_by !== user?.id ? assigneeMap.get(task.created_by) ?? null : null}
            onStatusChange={handleStatusChange}
            onDelete={handleDelete}
            onCardClick={() => setSelectedTask(task)}
            onTogglePin={handleTogglePin}
            onMarkDone={handleMarkDone}
            onMarkUndone={handleMarkUndone}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-foreground">Tasks</h1>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> New Task
        </Button>
      </div>

      {/* Search bar */}
      <TaskSearchBar value={searchQuery} onChange={setSearchQuery} />

      <Tabs value={tab} onValueChange={(v) => { setTab(v as TaskTab); setStatusFilter('all'); setSearchQuery(''); }}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <TabsList>
            <TabsTrigger value="my_tasks">My Tasks</TabsTrigger>
            <TabsTrigger value="assigned">Assigned to Me</TabsTrigger>
            {canSeeAssignedByMe && (
              <TabsTrigger value="assigned_by_me">Assigned by Me</TabsTrigger>
            )}
            {canSeeTeamTab && (
              <TabsTrigger value="team_tasks">Team Tasks</TabsTrigger>
            )}
          </TabsList>

          <div className="flex items-center gap-1">
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="icon"
              className="h-8 w-8"
              onClick={() => setViewMode('list')}
            >
              <LayoutList className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'board' ? 'default' : 'ghost'}
              size="icon"
              className="h-8 w-8"
              onClick={() => setViewMode('board')}
            >
              <Columns3 className="h-4 w-4" />
            </Button>
          </div>
        </div>

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
              <SelectTrigger className="h-8 w-[140px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="created_at">Date Created</SelectItem>
                <SelectItem value="due_date">Due Date</SelectItem>
                <SelectItem value="priority">Priority</SelectItem>
                <SelectItem value="pinned">Pinned First</SelectItem>
                <SelectItem value="updated_at">Recently Updated</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleSortDir}>
              {sortDir === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {['my_tasks', 'assigned', 'assigned_by_me', 'team_tasks'].map((tabValue) => (
          <TabsContent key={tabValue} value={tabValue} className="mt-4">
            {renderTaskList()}
          </TabsContent>
        ))}
      </Tabs>

      <AddTaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={(payload) => {
          createTask.mutate(payload, {
            onSuccess: () => toast.success('Task created successfully'),
            onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to create task'),
          });
        }}
        isLoading={createTask.isPending}
      />

      <TaskDetailSheet
        task={selectedTask}
        open={!!selectedTask}
        onOpenChange={(open) => { if (!open) setSelectedTask(null); }}
        assignee={selectedTask?.assigned_to ? assigneeMap.get(selectedTask.assigned_to) ?? null : null}
        creator={selectedTask ? assigneeMap.get(selectedTask.created_by) ?? null : null}
        currentUserId={user?.id || ''}
        onStatusChange={(id, status, extra) => {
          handleStatusChange(id, status, extra);
          setSelectedTask(null);
        }}
        onActionClick={(action) => setSheetAction(action)}
        onTogglePin={handleTogglePin}
        onMarkDone={handleMarkDone}
        onMarkUndone={handleMarkUndone}
      />

      {/* Sheet-triggered dialogs */}
      {selectedTask && sheetAction && (sheetAction === 'accept' || sheetAction === 'decline') && (
        <AcceptDeclineDialog
          open
          onOpenChange={() => setSheetAction(null)}
          mode={sheetAction}
          taskTitle={selectedTask.title}
          onConfirm={(reason) => {
            handleStatusChange(selectedTask.id, sheetAction === 'accept' ? 'accepted' : 'declined', sheetAction === 'decline' ? { decline_reason: reason } : undefined);
            setSheetAction(null);
            setSelectedTask(null);
          }}
        />
      )}

      {selectedTask && sheetAction === 'submit' && (
        <SubmitTaskDialog
          open
          onOpenChange={() => setSheetAction(null)}
          taskTitle={selectedTask.title}
          onConfirm={(data) => {
            handleStatusChange(selectedTask.id, 'submitted', data);
            setSheetAction(null);
            setSelectedTask(null);
          }}
        />
      )}

      {selectedTask && sheetAction && (sheetAction === 'approve' || sheetAction === 'reject') && (
        <ReviewTaskDialog
          open
          onOpenChange={() => setSheetAction(null)}
          mode={sheetAction}
          taskTitle={selectedTask.title}
          onConfirm={(feedback) => {
            handleStatusChange(selectedTask.id, sheetAction === 'approve' ? 'approved' : 'rejected', { feedback });
            setSheetAction(null);
            setSelectedTask(null);
          }}
        />
      )}
    </div>
  );
}
