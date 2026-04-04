import { useMemo } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useState } from 'react';
import { TaskCard, type TaskAssignee } from './TaskCard';
import type { Task } from '@/hooks/useTasks';

interface Column {
  id: string;
  label: string;
}

const personalColumns: Column[] = [
  { id: 'todo', label: 'To Do' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'done', label: 'Done' },
];

const assignedColumns: Column[] = [
  { id: 'pending_accept', label: 'Pending' },
  { id: 'accepted', label: 'Accepted' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'submitted', label: 'Submitted' },
  { id: 'approved', label: 'Approved' },
];

interface TaskBoardViewProps {
  tasks: Task[];
  currentUserId: string;
  assigneeMap: Map<string, TaskAssignee>;
  onStatusChange: (id: string, status: string, extra?: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
  onCardClick: (task: Task) => void;
  onTogglePin: (id: string) => void;
  onMarkDone: (id: string) => void;
  onMarkUndone: (id: string) => void;
  tab: string;
}

function SortableTaskCard({
  task,
  currentUserId,
  assigneeMap,
  onStatusChange,
  onDelete,
  onCardClick,
  onTogglePin,
  onMarkDone,
  onMarkUndone,
}: {
  task: Task;
  currentUserId: string;
  assigneeMap: Map<string, TaskAssignee>;
  onStatusChange: (id: string, status: string, extra?: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
  onCardClick: () => void;
  onTogglePin: (id: string) => void;
  onMarkDone: (id: string) => void;
  onMarkUndone: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <TaskCard
        task={task}
        currentUserId={currentUserId}
        assignee={task.assigned_to ? assigneeMap.get(task.assigned_to) ?? null : null}
        creator={task.created_by !== currentUserId ? assigneeMap.get(task.created_by) ?? null : null}
        onStatusChange={onStatusChange}
        onDelete={onDelete}
        onCardClick={onCardClick}
        onTogglePin={onTogglePin}
        onMarkDone={onMarkDone}
        onMarkUndone={onMarkUndone}
      />
    </div>
  );
}

export function TaskBoardView({
  tasks,
  currentUserId,
  assigneeMap,
  onStatusChange,
  onDelete,
  onCardClick,
  onTogglePin,
  onMarkDone,
  onMarkUndone,
  tab,
}: TaskBoardViewProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const isPersonalView = tab === 'my_tasks';
  const columns = isPersonalView ? personalColumns : assignedColumns;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const columnTasks = useMemo(() => {
    const map = new Map<string, Task[]>();
    columns.forEach((col) => map.set(col.id, []));

    tasks.forEach((task) => {
      const colTasks = map.get(task.status);
      if (colTasks) {
        colTasks.push(task);
      } else {
        // Put in first column as fallback
        const fallback = map.get(columns[0].id);
        if (fallback) fallback.push(task);
      }
    });

    // Sort pinned first within each column
    map.forEach((colTasks) => {
      colTasks.sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return a.sort_order - b.sort_order;
      });
    });

    return map;
  }, [tasks, columns]);

  const activeTask = activeId ? tasks.find((t) => t.id === activeId) : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const taskId = active.id as string;
    const overId = over.id as string;

    // Check if dropped on a column
    const targetColumn = columns.find((col) => col.id === overId);
    if (targetColumn) {
      const task = tasks.find((t) => t.id === taskId);
      if (task && task.status !== targetColumn.id) {
        onStatusChange(taskId, targetColumn.id);
      }
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(220px, 1fr))` }}>
        {columns.map((col) => {
          const colTasks = columnTasks.get(col.id) || [];
          return (
            <div
              key={col.id}
              className="bg-muted/30 rounded-lg p-3 min-h-[200px]"
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-foreground">{col.label}</h3>
                <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                  {colTasks.length}
                </span>
              </div>
              <SortableContext items={colTasks.map((t) => t.id)} strategy={verticalListSortingStrategy} id={col.id}>
                <div className="space-y-2">
                  {colTasks.map((task) => (
                    <SortableTaskCard
                      key={task.id}
                      task={task}
                      currentUserId={currentUserId}
                      assigneeMap={assigneeMap}
                      onStatusChange={onStatusChange}
                      onDelete={onDelete}
                      onCardClick={() => onCardClick(task)}
                      onTogglePin={onTogglePin}
                      onMarkDone={onMarkDone}
                      onMarkUndone={onMarkUndone}
                    />
                  ))}
                  {colTasks.length === 0 && (
                    <p className="text-xs text-muted-foreground/50 text-center py-8">No tasks</p>
                  )}
                </div>
              </SortableContext>
            </div>
          );
        })}
      </div>

      <DragOverlay>
        {activeTask && (
          <div className="opacity-80 rotate-2 scale-105">
            <TaskCard
              task={activeTask}
              currentUserId={currentUserId}
              assignee={activeTask.assigned_to ? assigneeMap.get(activeTask.assigned_to) ?? null : null}
              creator={activeTask.created_by !== currentUserId ? assigneeMap.get(activeTask.created_by) ?? null : null}
              onStatusChange={() => {}}
              onDelete={() => {}}
              onCardClick={() => {}}
              onTogglePin={() => {}}
              onMarkDone={() => {}}
              onMarkUndone={() => {}}
            />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
