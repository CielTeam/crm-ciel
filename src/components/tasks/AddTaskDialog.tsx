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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Check, ChevronsUpDown, User } from 'lucide-react';
import { cn } from '@/lib/utils';
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

function formatRole(role: string | null): string {
  if (!role) return '';
  return role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function getInitials(name: string | null): string {
  if (!name) return '?';
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
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
  const [assignPopoverOpen, setAssignPopoverOpen] = useState(false);

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
  const selectedUser = assignableUsers.find((u) => u.user_id === assignedTo);

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
              <Popover open={assignPopoverOpen} onOpenChange={setAssignPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={assignPopoverOpen}
                    className="w-full justify-between font-normal"
                  >
                    {selectedUser ? (
                      <span className="flex items-center gap-2 truncate">
                        <Avatar className="h-5 w-5">
                          <AvatarImage src={selectedUser.avatar_url || undefined} />
                          <AvatarFallback className="text-[10px]">
                            {getInitials(selectedUser.display_name)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="truncate">{selectedUser.display_name}</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <User className="h-4 w-4" />
                        Select user...
                      </span>
                    )}
                    <ChevronsUpDown className="ml-auto h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search by name or email..." />
                    <CommandList>
                      <CommandEmpty>No users found.</CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          value="__personal__"
                          onSelect={() => {
                            setAssignedTo('');
                            setAssignPopoverOpen(false);
                          }}
                        >
                          <User className="mr-2 h-4 w-4 text-muted-foreground" />
                          <span>Personal task (no assignment)</span>
                          <Check className={cn('ml-auto h-4 w-4', !assignedTo ? 'opacity-100' : 'opacity-0')} />
                        </CommandItem>
                        {assignableUsers.map((user) => (
                          <CommandItem
                            key={user.user_id}
                            value={`${user.display_name || ''} ${user.email || ''}`}
                            onSelect={() => {
                              setAssignedTo(user.user_id);
                              setAssignPopoverOpen(false);
                            }}
                          >
                            <Avatar className="mr-2 h-6 w-6">
                              <AvatarImage src={user.avatar_url || undefined} />
                              <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                                {getInitials(user.display_name)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex flex-col min-w-0 flex-1">
                              <span className="truncate text-sm font-medium">{user.display_name || user.user_id}</span>
                              <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                            </div>
                            {user.role && (
                              <Badge variant="secondary" className="ml-2 text-[10px] shrink-0">
                                {formatRole(user.role)}
                              </Badge>
                            )}
                            <Check className={cn('ml-2 h-4 w-4 shrink-0', assignedTo === user.user_id ? 'opacity-100' : 'opacity-0')} />
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
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
