import { useMemo } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { format } from 'date-fns';
import { Calendar, Clock, MapPin, Trash2, Link2, Bell, Users } from 'lucide-react';
import { useCalendarEventDetails, useDeleteEvent, useRespondEvent, useDeleteReminder } from '@/hooks/useCalendarData';
import { EventResponseChip } from './EventResponseChip';
import { ReminderEditor, type ReminderEntry } from './ReminderEditor';
import { useAuth } from '@/contexts/AuthContext';
import { useDirectoryData } from '@/hooks/useDirectoryData';
import { toast } from 'sonner';

interface Props {
  eventId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EventDetailSheet({ eventId, open, onOpenChange }: Props) {
  const { user } = useAuth();
  const { data, isLoading } = useCalendarEventDetails(eventId);
  const { data: directory = [] } = useDirectoryData();
  const del = useDeleteEvent();
  const respond = useRespondEvent();
  const delReminder = useDeleteReminder(eventId || undefined);

  const userMap = useMemo(() => new Map(directory.map(u => [u.userId, u])), [directory]);

  if (!eventId) return null;

  const ev = data?.event;
  const isOrganizer = ev ? (ev.owner_user_id === user?.id || ev.created_by === user?.id) : false;
  const myParticipation = data?.participants?.find(p => p.user_id === user?.id);

  const handleDelete = async () => {
    if (!eventId) return;
    if (!confirm('Delete this event? Participants will be notified.')) return;
    try {
      await del.mutateAsync(eventId);
      toast.success('Event deleted');
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const handleRespond = async (response: 'accepted' | 'declined' | 'tentative') => {
    if (!eventId) return;
    try {
      await respond.mutateAsync({ event_id: eventId, response });
      toast.success(`Response: ${response}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        {isLoading || !ev ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
        ) : (
          <>
            <SheetHeader>
              <SheetTitle className="text-lg">{ev.title}</SheetTitle>
              <SheetDescription className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="capitalize">{ev.event_type}</Badge>
                <Badge variant="secondary" className="capitalize">{ev.visibility.replace('_', ' ')}</Badge>
                {myParticipation && !isOrganizer && <EventResponseChip response={myParticipation.response} />}
              </SheetDescription>
            </SheetHeader>

            <Tabs defaultValue="details" className="mt-4">
              <TabsList className="w-full grid grid-cols-4">
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="participants">People</TabsTrigger>
                <TabsTrigger value="reminders">Alerts</TabsTrigger>
                <TabsTrigger value="linked">Linked</TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="space-y-3 mt-4">
                <div className="flex items-start gap-2 text-sm">
                  <Calendar className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                  <div>
                    <p className="font-medium">{format(new Date(ev.start_time), 'EEEE, MMM d, yyyy')}</p>
                    <p className="text-muted-foreground text-xs">
                      {ev.all_day ? 'All day' : `${format(new Date(ev.start_time), 'h:mm a')} – ${format(new Date(ev.end_time), 'h:mm a')}`}
                    </p>
                  </div>
                </div>
                {ev.location && (
                  <div className="flex items-start gap-2 text-sm">
                    <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                    <p>{ev.location}</p>
                  </div>
                )}
                {ev.description && (
                  <>
                    <Separator />
                    <p className="text-sm whitespace-pre-wrap text-foreground/90">{ev.description}</p>
                  </>
                )}

                {!isOrganizer && myParticipation && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1.5">Your response</p>
                      <div className="flex gap-1.5">
                        <Button size="sm" variant={myParticipation.response === 'accepted' ? 'default' : 'outline'} onClick={() => handleRespond('accepted')}>Accept</Button>
                        <Button size="sm" variant={myParticipation.response === 'tentative' ? 'default' : 'outline'} onClick={() => handleRespond('tentative')}>Maybe</Button>
                        <Button size="sm" variant={myParticipation.response === 'declined' ? 'destructive' : 'outline'} onClick={() => handleRespond('declined')}>Decline</Button>
                      </div>
                    </div>
                  </>
                )}

                {isOrganizer && (
                  <>
                    <Separator />
                    <Button variant="destructive" size="sm" onClick={handleDelete} disabled={del.isPending}>
                      <Trash2 className="h-3 w-3 mr-1.5" /> Delete event
                    </Button>
                  </>
                )}
              </TabsContent>

              <TabsContent value="participants" className="mt-4">
                {(data?.participants || []).length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center flex flex-col items-center gap-2">
                    <Users className="h-8 w-8 opacity-40" />
                    No participants
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {data!.participants.map(p => {
                      const u = userMap.get(p.user_id);
                      return (
                        <li key={p.id} className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-md border bg-card">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{u?.displayName || p.user_id}</p>
                            <p className="text-xs text-muted-foreground truncate">{u?.email || ''}</p>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {p.is_organizer && <Badge variant="outline" className="text-[10px]">Organizer</Badge>}
                            <EventResponseChip response={p.response} />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </TabsContent>

              <TabsContent value="reminders" className="mt-4 space-y-2">
                {(data?.reminders || []).length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center flex flex-col items-center gap-2">
                    <Bell className="h-8 w-8 opacity-40" />
                    No reminders set for you
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {data!.reminders.map(r => (
                      <li key={r.id} className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md border">
                        <div className="text-xs">
                          <span className="font-medium">
                            {r.offset_minutes >= 1440 ? `${r.offset_minutes/1440}d` : r.offset_minutes >= 60 ? `${r.offset_minutes/60}h` : `${r.offset_minutes}m`} before
                          </span>
                          <span className="text-muted-foreground ml-1">· {r.channel.replace('_', ' ')}</span>
                          <Badge variant="outline" className="ml-2 text-[10px] capitalize">{r.status}</Badge>
                        </div>
                        {r.status === 'pending' && (
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => delReminder.mutate(r.id)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>

              <TabsContent value="linked" className="mt-4 space-y-2">
                {!ev.account_id && !ev.ticket_id && !ev.task_id && (
                  <p className="text-sm text-muted-foreground py-6 text-center flex flex-col items-center gap-2">
                    <Link2 className="h-8 w-8 opacity-40" />
                    No linked records
                  </p>
                )}
                {ev.account_id && (
                  <Badge variant="outline" className="gap-1"><Link2 className="h-3 w-3" /> Account: {ev.account_id.slice(0, 8)}…</Badge>
                )}
                {ev.ticket_id && (
                  <Badge variant="outline" className="gap-1"><Link2 className="h-3 w-3" /> Ticket: {ev.ticket_id.slice(0, 8)}…</Badge>
                )}
                {ev.task_id && (
                  <Badge variant="outline" className="gap-1"><Link2 className="h-3 w-3" /> Task: {ev.task_id.slice(0, 8)}…</Badge>
                )}
              </TabsContent>
            </Tabs>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
