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
import { Calendar } from '@/components/ui/calendar';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Check, ChevronsUpDown, User, CalendarIcon, Clock, Timer, FolderKanban } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { useAssignableUsers } from '@/hooks/useTasks';
import { useProjects } from '@/hooks/useProjects';
import { CreateProjectDialog } from '@/components/projects/CreateProjectDialog';

interface AddTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (task: {
    title: string;
    description?: string;
    priority: string;
    due_date?: string | null;
    assigned_to?: string | null;
    assignees?: string[];
    estimated_duration?: string | null;
    project_id?: string | null;
  }) => void;
  isLoading?: boolean;
  /** Hide the project field (lead / account-originated tasks) */
  hideProjectField?: boolean;
}

function formatRole(role: string | null): string {
  if (!role) return '';
  return role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function getInitials(name: string | null): string {
  if (!name) return '?';
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

const PRIORITY_CONFIG = {
  low: { label: 'Low', color: 'bg-muted-foreground/40' },
  medium: { label: 'Medium', color: 'bg-yellow-500' },
  high: { label: 'High', color: 'bg-orange-500' },
  urgent: { label: 'Urgent', color: 'bg-destructive' },
} as const;

export function AddTaskDialog({ open, onOpenChange, onSubmit, isLoading, hideProjectField }: AddTaskDialogProps) {
  const { data: assignableUsers = [] } = useAssignableUsers();
  const { data: projects = [] } = useProjects('mine');
  const [title, setTitle] = useState('');
  const [titleTouched, setTitleTouched] = useState(false);
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  const [dueDate, setDueDate] = useState<Date | undefined>();
  const [dueTime, setDueTime] = useState('');
  const [durationHours, setDurationHours] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('');
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [projectId, setProjectId] = useState<string>('');
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [assignPopoverOpen, setAssignPopoverOpen] = useState(false);
  const [datePopoverOpen, setDatePopoverOpen] = useState(false);

  const reset = () => {
    setTitle('');
    setTitleTouched(false);
    setDescription('');
    setPriority('medium');
    setDueDate(undefined);
    setDueTime('');
    setDurationHours('');
    setDurationMinutes('');
    setAssigneeIds([]);
    setProjectId('');
  };

  const buildDuration = (): string | null => {
    const h = parseInt(durationHours) || 0;
    const m = parseInt(durationMinutes) || 0;
    if (h === 0 && m === 0) return null;
    const parts: string[] = [];
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    return parts.join(' ');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setTitleTouched(true);
      return;
    }

    let dueDateISO: string | null = null;
    if (dueDate) {
      const time = dueTime || '23:59';
      const [hours, minutes] = time.split(':').map(Number);
      const d = new Date(dueDate);
      d.setHours(hours, minutes, 0, 0);
      dueDateISO = d.toISOString();
    }

    onSubmit({
      title: title.trim(),
      description: description.trim() || undefined,
      priority,
      due_date: dueDateISO,
      assigned_to: assignedTo && assignedTo !== 'unassigned' ? assignedTo : null,
      estimated_duration: buildDuration(),
      project_id: !hideProjectField && projectId ? projectId : null,
    });
    reset();
    onOpenChange(false);
  };

  const canAssign = assignableUsers.length > 0;
  const selectedUser = assignableUsers.find((u) => u.user_id === assignedTo);
  const titleInvalid = titleTouched && !title.trim();

  const handleDurationHours = (val: string) => {
    const num = val.replace(/\D/g, '');
    if (num === '' || (parseInt(num) >= 0 && parseInt(num) <= 99)) {
      setDurationHours(num);
    }
  };

  const handleDurationMinutes = (val: string) => {
    const num = val.replace(/\D/g, '');
    if (num === '' || (parseInt(num) >= 0 && parseInt(num) <= 59)) {
      setDurationMinutes(num);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-lg">New Task</DialogTitle>
          <DialogDescription>Create a new task with details below.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 overflow-y-auto flex-1 pr-1">
          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="title" className="text-sm font-medium">
              Title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => setTitleTouched(true)}
              placeholder="What needs to be done?"
              className={cn(titleInvalid && 'border-destructive focus-visible:ring-destructive')}
              required
            />
            {titleInvalid && (
              <p className="text-xs text-destructive">Title is required</p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="desc" className="text-sm font-medium">Description</Label>
            <Textarea
              id="desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add details or context..."
              rows={3}
              className="resize-none"
            />
          </div>

          <Separator />

          {/* Priority & Duration Row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger>
                  <SelectValue>
                    <span className="flex items-center gap-2">
                      <span className={cn('h-2.5 w-2.5 rounded-full', PRIORITY_CONFIG[priority as keyof typeof PRIORITY_CONFIG]?.color)} />
                      {PRIORITY_CONFIG[priority as keyof typeof PRIORITY_CONFIG]?.label}
                    </span>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PRIORITY_CONFIG).map(([value, config]) => (
                    <SelectItem key={value} value={value}>
                      <span className="flex items-center gap-2">
                        <span className={cn('h-2.5 w-2.5 rounded-full', config.color)} />
                        {config.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <Timer className="h-3.5 w-3.5 text-muted-foreground" />
                Estimated Duration
              </Label>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 flex-1">
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={durationHours}
                    onChange={(e) => handleDurationHours(e.target.value)}
                    placeholder="0"
                    className="text-center"
                  />
                  <span className="text-xs text-muted-foreground shrink-0">hrs</span>
                </div>
                <div className="flex items-center gap-1 flex-1">
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={durationMinutes}
                    onChange={(e) => handleDurationMinutes(e.target.value)}
                    placeholder="0"
                    className="text-center"
                  />
                  <span className="text-xs text-muted-foreground shrink-0">min</span>
                </div>
              </div>
            </div>
          </div>

          {/* Due Date & Time */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium flex items-center gap-1.5">
              <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
              Due Date & Time
            </Label>
            <div className="grid grid-cols-2 gap-3">
              <Popover open={datePopoverOpen} onOpenChange={setDatePopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !dueDate && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dueDate ? format(dueDate, 'PPP') : 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dueDate}
                    onSelect={(date) => {
                      setDueDate(date);
                      setDatePopoverOpen(false);
                    }}
                    disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>

              <div className="relative">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  type="time"
                  value={dueTime}
                  onChange={(e) => setDueTime(e.target.value)}
                  className="pl-9"
                  placeholder="23:59"
                />
              </div>
            </div>
            {dueDate && !dueTime && (
              <p className="text-xs text-muted-foreground">Defaults to 11:59 PM if no time set</p>
            )}
          </div>

          {/* Assign To */}
          {canAssign && (
            <>
              <Separator />
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Assign To</Label>
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
            </>
          )}

          {!hideProjectField && (
            <>
              <Separator />
              <div className="space-y-1.5">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <FolderKanban className="h-3.5 w-3.5 text-muted-foreground" />
                  Project <span className="text-xs text-muted-foreground font-normal">(optional)</span>
                </Label>
                <div className="flex gap-2">
                  <Select value={projectId || 'none'} onValueChange={(v) => setProjectId(v === 'none' ? '' : v)}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="No project" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No project</SelectItem>
                      {projects.map(p => (
                        <SelectItem key={p.id} value={p.id}>
                          <span className="flex items-center gap-2">
                            {p.color && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />}
                            {p.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button type="button" variant="outline" size="sm" onClick={() => setCreateProjectOpen(true)}>
                    New
                  </Button>
                </div>
              </div>
            </>
          )}

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={!title.trim() || isLoading}>
              {isLoading ? 'Creating...' : 'Create Task'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
      <CreateProjectDialog
        open={createProjectOpen}
        onOpenChange={setCreateProjectOpen}
        onCreated={(id) => setProjectId(id)}
      />
    </Dialog>
  );
}
