import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useDirectoryData } from '@/hooks/useDirectoryData';
import { useCreateEvent } from '@/hooks/useCalendarData';
import { ReminderEditor, type ReminderEntry } from './ReminderEditor';
import { toast } from 'sonner';
import { X, Users } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate?: Date;
}

function toLocalInput(d: Date) {
  const tz = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 16);
}

export function AddEventDialog({ open, onOpenChange, defaultDate }: Props) {
  const { user } = useAuth();
  const { data: directory = [] } = useDirectoryData();
  const create = useCreateEvent();

  const initialStart = defaultDate ? new Date(defaultDate.setHours(9, 0, 0, 0)) : new Date(Date.now() + 60 * 60_000);
  const initialEnd = new Date(initialStart.getTime() + 60 * 60_000);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [eventType, setEventType] = useState<string>('meeting');
  const [start, setStart] = useState(toLocalInput(initialStart));
  const [end, setEnd] = useState(toLocalInput(initialEnd));
  const [allDay, setAllDay] = useState(false);
  const [location, setLocation] = useState('');
  const [visibility, setVisibility] = useState<string>('private');
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [participantSearch, setParticipantSearch] = useState('');
  const [reminders, setReminders] = useState<ReminderEntry[]>([
    { channel: 'in_app', offset_minutes: 60 },
    { channel: 'in_app', offset_minutes: 15 },
  ]);

  const reset = () => {
    setTitle(''); setDescription(''); setEventType('meeting'); setLocation('');
    setVisibility('private'); setParticipantIds([]); setAllDay(false);
    setReminders([{ channel: 'in_app', offset_minutes: 60 }, { channel: 'in_app', offset_minutes: 15 }]);
  };

  const handleSubmit = async () => {
    if (!title.trim()) { toast.error('Title is required'); return; }
    if (new Date(end) <= new Date(start)) { toast.error('End must be after start'); return; }
    try {
      await create.mutateAsync({
        title: title.trim(),
        description: description.trim() || undefined,
        event_type: eventType,
        start_time: new Date(start).toISOString(),
        end_time: new Date(end).toISOString(),
        all_day: allDay,
        location: location.trim() || undefined,
        visibility,
        participants: participantIds,
        reminders,
      });
      toast.success('Event created');
      reset();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create event');
    }
  };

  const filteredDirectory = directory
    .filter(u => u.userId !== user?.id && !participantIds.includes(u.userId))
    .filter(u => {
      const q = participantSearch.toLowerCase().trim();
      if (!q) return true;
      return u.displayName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    })
    .slice(0, 50);

  const selectedUsers = directory.filter(u => participantIds.includes(u.userId));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New event</DialogTitle>
          <DialogDescription>Schedule a meeting, deadline, or personal block.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="title">Title *</Label>
            <Input id="title" value={title} onChange={e => setTitle(e.target.value)} maxLength={255} placeholder="e.g. Quarterly review" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={eventType} onValueChange={setEventType}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="meeting">Meeting</SelectItem>
                  <SelectItem value="deadline">Deadline</SelectItem>
                  <SelectItem value="reminder">Reminder</SelectItem>
                  <SelectItem value="personal">Personal</SelectItem>
                  <SelectItem value="block">Time block</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Visibility</Label>
              <Select value={visibility} onValueChange={setVisibility}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">Private</SelectItem>
                  <SelectItem value="participants">Participants only</SelectItem>
                  <SelectItem value="department">Department</SelectItem>
                  <SelectItem value="management_chain">Management chain</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="start">Start *</Label>
              <Input id="start" type="datetime-local" value={start} onChange={e => setStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="end">End *</Label>
              <Input id="end" type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch id="allday" checked={allDay} onCheckedChange={setAllDay} />
            <Label htmlFor="allday" className="text-sm cursor-pointer">All-day event</Label>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="location">Location</Label>
            <Input id="location" value={location} onChange={e => setLocation(e.target.value)} maxLength={500} placeholder="e.g. Conf room A or Zoom link" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="desc">Description</Label>
            <Textarea id="desc" value={description} onChange={e => setDescription(e.target.value)} maxLength={5000} rows={3} placeholder="Optional details…" />
          </div>

          <div className="space-y-1.5">
            <Label>Participants</Label>
            {selectedUsers.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {selectedUsers.map(u => (
                  <Badge key={u.userId} variant="secondary" className="gap-1 pr-1">
                    {u.displayName}
                    <button type="button" onClick={() => setParticipantIds(ids => ids.filter(id => id !== u.userId))} className="hover:bg-muted-foreground/20 rounded-full p-0.5">
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            <Popover>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" size="sm" className="w-full justify-start gap-2">
                  <Users className="h-3 w-3" /> Add participants
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[320px] p-0" align="start">
                <div className="p-2 border-b">
                  <Input placeholder="Search by name or email…" value={participantSearch} onChange={e => setParticipantSearch(e.target.value)} className="h-8 text-xs" />
                </div>
                <ScrollArea className="h-[240px]">
                  <div className="p-1">
                    {filteredDirectory.length === 0 && <p className="text-xs text-muted-foreground p-3 text-center">No matches</p>}
                    {filteredDirectory.map(u => (
                      <button
                        key={u.userId}
                        type="button"
                        onClick={() => { setParticipantIds(ids => [...ids, u.userId]); setParticipantSearch(''); }}
                        className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-muted rounded-sm text-left"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{u.displayName}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{u.email}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-1.5">
            <Label>Reminders</Label>
            <ReminderEditor reminders={reminders} onChange={setReminders} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={create.isPending}>
            {create.isPending ? 'Creating…' : 'Create event'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
