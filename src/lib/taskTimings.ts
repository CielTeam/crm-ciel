import type { Task } from '@/hooks/useTasks';

export function formatDuration(ms: number): string {
  if (ms < 0) return '';
  const totalMinutes = Math.floor(ms / 60000);
  const totalHours = Math.floor(totalMinutes / 60);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function getTimeToStart(task: Task): string | null {
  if (!task.started_at) return null;
  const ms = new Date(task.started_at).getTime() - new Date(task.created_at).getTime();
  return ms > 0 ? `Started after ${formatDuration(ms)}` : null;
}

export function getTimeToComplete(task: Task): string | null {
  if (!task.started_at || !task.completed_at) return null;
  const ms = new Date(task.completed_at).getTime() - new Date(task.started_at).getTime();
  return ms > 0 ? `Completed in ${formatDuration(ms)}` : null;
}

export function getWaitingTime(task: Task): string | null {
  if (task.started_at || task.completed_at) return null;
  const ms = Date.now() - new Date(task.created_at).getTime();
  return ms > 60000 ? `Waiting: ${formatDuration(ms)}` : null;
}
