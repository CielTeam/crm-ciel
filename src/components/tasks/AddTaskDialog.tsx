import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useAssignableUsers } from '@/hooks/useTasks';

interface AddTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (task: {
    title: string;
    description?: string;
    priority: string;
    due_date?: string | null;
    assigned_to?: string | null;
    estimated_duration?: string | null;
  }) => void;
  isLoading?: boolean;
}

export function AddTaskDialog({ open, onOpenChange, onSubmit, isLoading }: AddTaskDialogProps) {
  const { data: assignableUsers = [] } = useAssignableUsers();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [estimatedDuration, setEstimatedDuration] = useState('');

  const reset = () => {
    setTitle('');
    setDescription('');
    setPriority('medium');
    setDueDate('');
    setDueTime('');
    setAssignedTo('');
    setEstimatedDuration('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    let dueDateISO: string | null = null;
    if (dueDate) {
      const time = dueTime || '23:59';
      dueDateISO = new Date(`${dueDate}T${time}`).toISOString();
    }

    onSubmit({
      title: title.trim(),
      description: description.trim() || undefined,
      priority,
      due_date: dueDateISO,
      assigned_to: assignedTo && assignedTo !== 'unassigned' ? assignedTo : null,
      estimated_duration: estimatedDuration.trim() || null,
    });
    reset();
    onOpenChange(false);
  };

  const canAssign = assignableUsers.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Task</DialogTitle>
          <DialogDescription>Create a new task with details below.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Task title" required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="desc">Description</Label>
            <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" rows={3} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Estimated Duration</Label>
              <Input
                value={estimatedDuration}
                onChange={(e) => setEstimatedDuration(e.target.value)}
                placeholder="e.g. 2 hours"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="due">Due Date</Label>
              <Input id="due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="due-time">Due Time</Label>
              <Input id="due-time" type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} />
            </div>
          </div>

          {canAssign && (
            <div className="space-y-2">
              <Label>Assign To</Label>
              <Select value={assignedTo} onValueChange={setAssignedTo}>
                <SelectTrigger>
                  <SelectValue placeholder="Personal task (no assignment)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Personal task</SelectItem>
                  {assignableUsers.map((user) => (
                    <SelectItem key={user.user_id} value={user.user_id}>
                      {user.display_name || user.user_id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={!title.trim() || isLoading}>
              {isLoading ? 'Creating...' : 'Create Task'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
