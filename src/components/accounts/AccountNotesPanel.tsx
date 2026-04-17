import { useState, useEffect } from 'react';
import { useAccountNotes, useAddAccountNote } from '@/hooks/useAccountsContacts';
import { useDirectoryData } from '@/hooks/useDirectoryData';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, Phone, Mail, Users, StickyNote, Clock } from 'lucide-react';

const NOTE_TYPES = [
  { value: 'general', label: 'General Note', icon: StickyNote },
  { value: 'call_log', label: 'Call Log', icon: Phone },
  { value: 'email_log', label: 'Email Log', icon: Mail },
  { value: 'meeting_log', label: 'Meeting Log', icon: Users },
  { value: 'follow_up', label: 'Follow-up', icon: Clock },
];

interface Props {
  accountId: string;
  prefillNoteType?: string | null;
  onPrefillConsumed?: () => void;
}

export function AccountNotesPanel({ accountId, prefillNoteType, onPrefillConsumed }: Props) {
  const { data: notes, isLoading } = useAccountNotes(accountId);
  const { data: profiles } = useDirectoryData();
  const addNote = useAddAccountNote();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    note_type: 'general', content: '', outcome: '', next_step: '', contact_date: '', duration_minutes: '',
  });

  useEffect(() => {
    if (prefillNoteType) {
      setForm(f => ({ ...f, note_type: prefillNoteType }));
      setShowForm(true);
      onPrefillConsumed?.();
    }
  }, [prefillNoteType, onPrefillConsumed]);

  const getAuthorName = (id: string) => profiles?.find(p => p.userId === id)?.displayName || id.slice(0, 8);
  const getInitials = (id: string) => getAuthorName(id).split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  const handleSubmit = () => {
    if (!form.content.trim()) return;
    addNote.mutate({
      account_id: accountId,
      note_type: form.note_type,
      content: form.content,
      outcome: form.outcome || undefined,
      next_step: form.next_step || undefined,
      contact_date: form.contact_date || undefined,
      duration_minutes: form.duration_minutes ? Number(form.duration_minutes) : undefined,
    }, {
      onSuccess: () => {
        setForm({ note_type: 'general', content: '', outcome: '', next_step: '', contact_date: '', duration_minutes: '' });
        setShowForm(false);
      },
    });
  };

  const showExtras = ['call_log', 'email_log', 'meeting_log'].includes(form.note_type);

  return (
    <div className="space-y-4">
      {!showForm ? (
        <Button variant="outline" size="sm" onClick={() => setShowForm(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add Note
        </Button>
      ) : (
        <Card className="border">
          <CardContent className="pt-4 space-y-3">
            <div>
              <Label className="text-xs">Type</Label>
              <Select value={form.note_type} onValueChange={(v) => setForm(f => ({ ...f, note_type: v }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {NOTE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Content *</Label>
              <Textarea value={form.content} onChange={(e) => setForm(f => ({ ...f, content: e.target.value }))} rows={3} className="text-sm" />
            </div>
            {showExtras && (
              <div className="grid grid-cols-3 gap-3">
                <div><Label className="text-xs">Contact Date</Label><Input type="datetime-local" className="h-8 text-xs" value={form.contact_date} onChange={(e) => setForm(f => ({ ...f, contact_date: e.target.value }))} /></div>
                <div><Label className="text-xs">Duration (min)</Label><Input type="number" className="h-8 text-xs" value={form.duration_minutes} onChange={(e) => setForm(f => ({ ...f, duration_minutes: e.target.value }))} /></div>
                <div><Label className="text-xs">Next Step</Label><Input className="h-8 text-xs" value={form.next_step} onChange={(e) => setForm(f => ({ ...f, next_step: e.target.value }))} /></div>
              </div>
            )}
            {showExtras && (
              <div>
                <Label className="text-xs">Outcome</Label>
                <Input className="h-8 text-xs" value={form.outcome} onChange={(e) => setForm(f => ({ ...f, outcome: e.target.value }))} />
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button size="sm" onClick={handleSubmit} disabled={addNote.isPending || !form.content.trim()}>
                {addNote.isPending ? 'Saving...' : 'Save Note'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-3">{[1, 2].map(i => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : (!notes || notes.length === 0) ? (
        <div className="text-center py-8 text-muted-foreground text-sm">No notes yet.</div>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => {
            const cfg = NOTE_TYPES.find(t => t.value === note.note_type);
            const Icon = cfg?.icon || StickyNote;
            return (
              <Card key={note.id} className="border">
                <CardContent className="pt-3 pb-3">
                  <div className="flex items-start gap-3">
                    <Avatar className="h-7 w-7 flex-shrink-0">
                      <AvatarFallback className="text-[10px] bg-muted">{getInitials(note.author_id)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">{cfg?.label || note.note_type}</Badge>
                        <span className="text-xs text-muted-foreground ml-auto">{format(new Date(note.created_at), 'MMM d, yyyy HH:mm')}</span>
                      </div>
                      <p className="text-sm text-foreground whitespace-pre-wrap">{note.content}</p>
                      {(note.outcome || note.next_step || note.duration_minutes) && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {note.outcome && <Badge variant="secondary" className="text-[10px]">{note.outcome}</Badge>}
                          {note.next_step && <Badge variant="outline" className="text-[10px]">Next: {note.next_step}</Badge>}
                          {note.duration_minutes && <Badge variant="outline" className="text-[10px]">{note.duration_minutes} min</Badge>}
                        </div>
                      )}
                      <span className="text-xs text-muted-foreground mt-1 block">{getAuthorName(note.author_id)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
