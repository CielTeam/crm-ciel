import { useState, useMemo, useCallback } from 'react';
import { isPast, isToday, format } from 'date-fns';
import { Plus, CheckSquare, Loader2, ArrowUp, ArrowDown, Filter, LayoutList, Columns3, FolderKanban, ArrowLeft, Calendar, AlertCircle, CheckCircle2 } from 'lucide-react';
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
import { SupportTicketsTab } from '@/components/tickets/SupportTicketsTab';
import { PageError } from '@/components/PageError';
import { ProjectCard } from '@/components/projects/ProjectCard';
import { CreateProjectDialog } from '@/components/projects/CreateProjectDialog';
import { SortableTaskList } from '@/components/tasks/SortableTaskList';
import { useTasks, useCreateTask, useUpdateTask, useDeleteTask, useTogglePin, useMarkDone, useMarkUndone, useReorderTasks, type TaskTab, type Task } from '@/hooks/useTasks';
import { useProjectsAnalyticsSummary, useTasksByProject, useProjectAnalytics, useReorderProjectTasks } from '@/hooks/useProjects';
import { useDirectoryData } from '@/hooks/useDirectoryData';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

type StatusFilter = string;
type PriorityFilter = 'all' | 'low' | 'medium' | 'high' | 'urgent';
type SortField = 'manual' | 'created_at' | 'due_date' | 'priority' | 'pinned' | 'updated_at';
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

type ActiveTab = TaskTab | 'support';

export default function TasksPage() {
  const { user, roles } = useAuth();
  const [tab, setTab] = useState<ActiveTab>('my_tasks');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [sheetAction, setSheetAction] = useState<'accept' | 'decline' | 'submit' | 'approve' | 'reject' | null>(null);

  const taskTab: TaskTab = tab === 'support' ? 'my_tasks' : tab;
  const { data: tasks = [], isLoading, error, refetch } = useTasks(taskTab);
  const { data: directoryUsers } = useDirectoryData();
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const togglePin = useTogglePin();
  const markDone = useMarkDone();
  const markUndone = useMarkUndone();
  const reorderTasks = useReorderTasks();
  const reorderProjectTasks = useReorderProjectTasks();

  // Projects scope follows tab semantics
  const projectScope = (tab === 'assigned_by_me' || tab === 'team_tasks') ? 'department' : 'mine';
  const { data: projectsSummary = [] } = useProjectsAnalyticsSummary(projectScope);
  const { data: projectTasks = [] } = useTasksByProject(selectedProjectId);
  const { data: selectedProjectInfo } = useProjectAnalytics(selectedProjectId);

  const canSeeTeamTab = roles.some((r) => [...GLOBAL_ROLES, ...LEAD_ROLES].includes(r));
  const canSeeAssignedByMe = roles.some((r) => [...GLOBAL_ROLES, ...LEAD_ROLES].includes(r));

  const assigneeMap = useMemo(() => {
    const map = new Map<string, TaskAssignee>();
    directoryUsers?.forEach((u) => {
      map.set(u.userId, { displayName: u.displayName, avatarUrl: u.avatarUrl });
    });
    return map;
  }, [directoryUsers]);

  // Generic filter+sort pipeline reused for both unassigned tasks and project drill-in
  const applyFilters = useCallback((source: Task[]): Task[] => {
    let result = source;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((t) =>
        t.title.toLowerCase().includes(q) ||
        (t.description && t.description.toLowerCase().includes(q))
      );
    }

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

    if (priorityFilter !== 'all') result = result.filter((t) => t.priority === priorityFilter);

    if (sortField === 'manual') {
      // Server-defined order: project_sort_order in project context, sort_order otherwise
      result = [...result].sort((a, b) => {
        if (selectedProjectId) {
          return (a.project_sort_order ?? 0) - (b.project_sort_order ?? 0);
        }
        return (a.sort_order ?? 0) - (b.sort_order ?? 0);
      });
      return result;
    }

    result = [...result].sort((a, b) => {
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
  }, [searchQuery, statusFilter, priorityFilter, sortField, sortDir, selectedProjectId]);

  // When no project selected: show tasks where project_id is null
  const unassignedTasks = useMemo(() => tasks.filter((t) => !t.project_id), [tasks]);
  const filteredUnassigned = useMemo(() => applyFilters(unassignedTasks), [unassignedTasks, applyFilters]);
  const filteredProjectTasks = useMemo(() => applyFilters(projectTasks as Task[]), [projectTasks, applyFilters]);

  const statusCounts = useMemo(() => {
    const source = selectedProjectId ? (projectTasks as Task[]) : unassignedTasks;
    const counts: Record<string, number> = { all: source.length, pinned: 0, overdue: 0, pending: 0, in_progress: 0, completed: 0 };
    source.forEach((t) => {
      if (t.pinned) counts.pinned++;
      if (t.due_date && !t.completed_at && isPast(new Date(t.due_date)) && !isToday(new Date(t.due_date))) counts.overdue++;
      if (PENDING_STATUSES.includes(t.status)) counts.pending++;
      if (IN_PROGRESS_STATUSES.includes(t.status)) counts.in_progress++;
      if (DONE_STATUSES.includes(t.status)) counts.completed++;
    });
    return counts;
  }, [selectedProjectId, projectTasks, unassignedTasks]);

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

  const handleReorder = useCallback((orderedIds: string[]) => {
    if (selectedProjectId) {
      reorderProjectTasks.mutate({ project_id: selectedProjectId, task_ids: orderedIds }, {
        onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to reorder'),
      });
    } else {
      reorderTasks.mutate(orderedIds, {
        onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to reorder'),
      });
    }
  }, [selectedProjectId, reorderProjectTasks, reorderTasks]);

  const toggleSortDir = () => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));

  const renderTaskCard = (task: Task) => (
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
  );

  const renderTaskList = (list: Task[], emptyTitle: string, emptyHint: string) => {
    if (error) return <PageError message="Failed to load tasks. Please try again." onRetry={() => refetch()} />;
    if (isLoading) return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );

    if (list.length === 0) return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <CheckSquare className="h-12 w-12 mb-4 opacity-30" />
        <p className="text-base font-medium">{emptyTitle}</p>
        <p className="text-sm mt-1">{emptyHint}</p>
      </div>
    );

    if (viewMode === 'board') {
      return (
        <div className="overflow-x-auto -mx-4 px-4">
          <TaskBoardView
            tasks={list}
            currentUserId={user?.id || ''}
            assigneeMap={assigneeMap}
            onStatusChange={handleStatusChange}
            onDelete={handleDelete}
            onCardClick={(task) => setSelectedTask(task)}
            onTogglePin={handleTogglePin}
            onMarkDone={handleMarkDone}
            onMarkUndone={handleMarkUndone}
            tab={tab as TaskTab}
          />
        </div>
      );
    }

    const dragEnabled = sortField === 'manual' && viewMode === 'list';

    return (
      <SortableTaskList
        items={list}
        enabled={dragEnabled}
        onReorder={handleReorder}
        renderItem={renderTaskCard}
      />
    );
  };

  const renderProjectStrip = () => (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FolderKanban className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Projects</h2>
          <Badge variant="secondary" className="text-[10px]">{projectsSummary.length}</Badge>
        </div>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
        {projectsSummary.map(({ project, analytics }) => (
          <div key={project.id} className="min-w-[280px] max-w-[280px] shrink-0">
            <ProjectCard project={project} analytics={analytics} onClick={() => setSelectedProjectId(project.id)} />
          </div>
        ))}
        <button
          type="button"
          onClick={() => setCreateProjectOpen(true)}
          className="min-w-[200px] shrink-0 border-2 border-dashed border-border hover:border-primary/40 hover:bg-primary/5 rounded-lg flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-primary transition-colors p-6"
        >
          <Plus className="h-6 w-6" />
          <span className="text-sm font-medium">New Project</span>
        </button>
      </div>
    </div>
  );

  const renderProjectDrillIn = () => {
    const project = selectedProjectInfo?.project;
    const analytics = selectedProjectInfo?.analytics;
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <Button variant="ghost" size="sm" onClick={() => setSelectedProjectId(null)}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to all
          </Button>
          {project && (
            <>
              <div className="flex items-center gap-2">
                {project.color && <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: project.color }} />}
                <h2 className="font-semibold text-foreground">{project.name}</h2>
              </div>
              <Badge variant="outline" className="capitalize text-[10px]">{project.status.replace('_', ' ')}</Badge>
              {project.is_personal && <Badge variant="secondary" className="text-[10px]">Personal</Badge>}
              {project.department && !project.is_personal && (
                <Badge variant="secondary" className="text-[10px] capitalize">{project.department}</Badge>
              )}
            </>
          )}
        </div>

        {analytics && (
          <div className="flex items-center gap-4 flex-wrap text-xs border rounded-lg p-3 bg-muted/30">
            <span><span className="text-muted-foreground">Total:</span> <span className="font-semibold text-foreground">{analytics.total}</span></span>
            <span><span className="text-muted-foreground">Active:</span> <span className="font-semibold text-primary">{analytics.in_progress}</span></span>
            <span><span className="text-muted-foreground">Done:</span> <span className="font-semibold text-emerald-600">{analytics.done}</span></span>
            <span><span className="text-muted-foreground">Overdue:</span> <span className={`font-semibold ${analytics.overdue > 0 ? 'text-destructive' : 'text-foreground'}`}>{analytics.overdue}</span></span>
            <span><span className="text-muted-foreground">Completion:</span> <span className="font-semibold text-foreground">{analytics.completion_percent}%</span></span>
            {project?.target_end_date && (
              <span className="flex items-center gap-1 text-muted-foreground">
                <Calendar className="h-3 w-3" /> {format(new Date(project.target_end_date), 'MMM d, yyyy')}
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
          </div>
        )}

        {renderTaskList(filteredProjectTasks, 'No tasks in this project yet', 'Create a task and assign it to this project.')}
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

      <Tabs value={tab} onValueChange={(v) => { setTab(v as ActiveTab); setStatusFilter('all'); setSearchQuery(''); setSelectedProjectId(null); }}>
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
            <TabsTrigger value="support">Support</TabsTrigger>
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

        {tab !== 'support' && (
          <>
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
                    <SelectItem value="manual">Manual (drag)</SelectItem>
                    <SelectItem value="created_at">Date Created</SelectItem>
                    <SelectItem value="due_date">Due Date</SelectItem>
                    <SelectItem value="priority">Priority</SelectItem>
                    <SelectItem value="pinned">Pinned First</SelectItem>
                    <SelectItem value="updated_at">Recently Updated</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleSortDir} disabled={sortField === 'manual'}>
                  {sortDir === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </>
        )}

        {(['my_tasks', 'assigned', 'assigned_by_me', 'team_tasks'] as const).map((tabValue) => (
          <TabsContent key={tabValue} value={tabValue} className="mt-4 space-y-6">
            {selectedProjectId ? (
              renderProjectDrillIn()
            ) : (
              <>
                {renderProjectStrip()}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-foreground">Unassigned tasks</h2>
                    <Badge variant="secondary" className="text-[10px]">{filteredUnassigned.length}</Badge>
                  </div>
                  {renderTaskList(
                    filteredUnassigned,
                    tasks.length === 0 ? 'No tasks yet' : 'No tasks match filters',
                    tasks.length === 0 ? 'Create your first task to get started.' : 'Try adjusting your filters or open a project above.'
                  )}
                </div>
              </>
            )}
          </TabsContent>
        ))}
        <TabsContent value="support" className="mt-4">
          <SupportTicketsTab />
        </TabsContent>
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

      <CreateProjectDialog open={createProjectOpen} onOpenChange={setCreateProjectOpen} />

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
