import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Bell, BellOff, Plus, Trash2 } from 'lucide-react';

export interface ReminderEntry {
  channel: 'in_app' | 'browser_push' | 'email';
  offset_minutes: number;
}

interface Props {
  reminders: ReminderEntry[];
  onChange: (next: ReminderEntry[]) => void;
}

const PRESETS = [
  { label: '5 min before', value: 5 },
  { label: '15 min before', value: 15 },
  { label: '30 min before', value: 30 },
  { label: '1 hour before', value: 60 },
  { label: '2 hours before', value: 120 },
  { label: '1 day before', value: 1440 },
];

export function ReminderEditor({ reminders, onChange }: Props) {
  const [newOffset, setNewOffset] = useState<number>(15);
  const [newChannel, setNewChannel] = useState<ReminderEntry['channel']>('in_app');

  const add = () => {
    if (reminders.some(r => r.offset_minutes === newOffset && r.channel === newChannel)) return;
    onChange([...reminders, { channel: newChannel, offset_minutes: newOffset }].sort((a, b) => b.offset_minutes - a.offset_minutes));
  };

  const remove = (i: number) => onChange(reminders.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-2">
      {reminders.length === 0 ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground border border-dashed rounded-md px-3 py-2">
          <BellOff className="h-3 w-3" />
          No reminders set
        </div>
      ) : (
        <ul className="space-y-1.5">
          {reminders.map((r, i) => (
            <li key={`${r.channel}-${r.offset_minutes}-${i}`} className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md border bg-muted/30">
              <div className="flex items-center gap-2 text-xs">
                <Bell className="h-3 w-3 text-muted-foreground" />
                <span className="font-medium">
                  {r.offset_minutes === 0 ? 'At start' : `${r.offset_minutes >= 1440 ? `${r.offset_minutes/1440}d` : r.offset_minutes >= 60 ? `${r.offset_minutes/60}h` : `${r.offset_minutes}m`} before`}
                </span>
                <span className="text-muted-foreground">· {r.channel.replace('_', ' ')}</span>
              </div>
              <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => remove(i)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-end gap-1.5">
        <div className="flex-1">
          <Select value={String(newOffset)} onValueChange={v => setNewOffset(Number(v))}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PRESETS.map(p => <SelectItem key={p.value} value={String(p.value)}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="w-32">
          <Select value={newChannel} onValueChange={v => setNewChannel(v as ReminderEntry['channel'])}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="in_app">In-app</SelectItem>
              <SelectItem value="browser_push">Browser</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button type="button" variant="outline" size="sm" className="h-8" onClick={add}>
          <Plus className="h-3 w-3 mr-1" /> Add
        </Button>
      </div>
    </div>
  );
}
