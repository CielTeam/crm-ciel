import { useState } from 'react';
import { format } from 'date-fns';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Loader2, MessageSquare, Activity, Paperclip, ListTodo, Send, Plus } from 'lucide-react';
import {
  useTicket, useTicketComments, useAddTicketComment, useTicketActivity,
  useTicketLinkedTasks, type Ticket,
} from '@/hooks/useTickets';
import { TicketStatusBadge, TicketPriorityBadge } from './TicketStatusBadge';
import { TicketStatusDropdown } from './TicketStatusDropdown';
import { TicketCommentItem } from './TicketCommentItem';
import { useAuth } from '@/contexts/AuthContext';
import { useDirectoryData } from '@/hooks/useDirectoryData';
import { useAccountsWithContacts } from '@/hooks/useAccountsContacts';
import { ADMIN_ROLES } from '@/types/roles';
import { toast } from 'sonner';
import { DocumentsTab } from '@/components/shared/DocumentsTab';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

interface Props {
  ticketId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function TicketDetailSheet({ ticketId, open, onOpenChange }: Props) {
  const { user, roles, getToken } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: ticket, isLoading } = useTicket(ticketId);
  const { data: comments } = useTicketComments(ticketId);
  const { data: activity } = useTicketActivity(ticketId);
  const { data: linkedTasks } = useTicketLinkedTasks(ticketId);
  const { data: directory } = useDirectoryData();
  const { data: accounts } = useAccountsWithContacts();
  const addComment = useAddTicketComment();

  const [tab, setTab] = useState('details');
  const [newComment, setNewComment] = useState('');
  const [creatingTask, setCreatingTask] = useState(false);

  const isAdmin = roles.some((r) => ADMIN_ROLES.includes(r));

  const dirMap = new Map(directory?.map((u) => [u.userId, u]) ?? []);
  const accountMap = new Map(accounts?.map((a) => [a.id, a]) ?? []);

  const renderUser = (uid: string | null) => {
    if (!uid) return <span className="text-muted-foreground text-sm">—</span>;
    const u = dirMap.get(uid);
    if (!u) return <span className="text-sm">{uid}</span>;
    return (
      <div className="flex items-center gap-2">
        <Avatar className="h-6 w-6">
          {u.avatarUrl && <AvatarImage src={u.avatarUrl} />}
          <AvatarFallback className="text-xs">{u.displayName.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <span className="text-sm">{u.displayName}</span>
      </div>
    );
  };

  const handleAddComment = () => {
    if (!ticketId || !newComment.trim()) return;
    addComment.mutate({ ticket_id: ticketId, content: newComment.trim() }, {
      onSuccess: () => { setNewComment(''); },
      onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to add comment'),
    });
  };

  const handleCreateTask = async () => {
    if (!ticket) return;
    setCreatingTask(true);
    try {
      const token = await getToken();
      const { data, error } = await supabase.functions.invoke('tasks', {
        body: { action: 'create_from_ticket', ticket_id: ticket.id },
        headers: { Authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success('Task created from ticket');
      qc.invalidateQueries({ queryKey: ['ticket-linked-tasks', ticket.id] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create task');
    } finally {
      setCreatingTask(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl p-0 flex flex-col">
        {isLoading || !ticket ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <SheetHeader className="p-6 pb-4 border-b border-border">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <SheetTitle className="text-lg leading-tight">{ticket.title}</SheetTitle>
                  <SheetDescription className="mt-1 text-xs">
                    Opened {format(new Date(ticket.opened_at), 'MMM d, yyyy · HH:mm')}
                  </SheetDescription>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap mt-2">
                <TicketStatusDropdown ticketId={ticket.id} status={ticket.status} canUnarchive={isAdmin} />
                <TicketPriorityBadge priority={ticket.priority} />
                <Badge variant="outline" className="text-xs capitalize">{ticket.ticket_type.replace('_', ' ')}</Badge>
                <Badge variant="outline" className="text-xs capitalize">{ticket.source_channel}</Badge>
              </div>
            </SheetHeader>

            <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col overflow-hidden">
              <TabsList className="mx-6 mt-3 w-fit">
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="comments" className="gap-1">
                  <MessageSquare className="h-3.5 w-3.5" /> Comments
                  {comments && comments.length > 0 && <span className="text-xs">({comments.length})</span>}
                </TabsTrigger>
                <TabsTrigger value="activity" className="gap-1">
                  <Activity className="h-3.5 w-3.5" /> Activity
                </TabsTrigger>
                <TabsTrigger value="attachments" className="gap-1">
                  <Paperclip className="h-3.5 w-3.5" /> Files
                </TabsTrigger>
                <TabsTrigger value="tasks" className="gap-1">
                  <ListTodo className="h-3.5 w-3.5" /> Tasks
                  {linkedTasks && linkedTasks.length > 0 && <span className="text-xs">({linkedTasks.length})</span>}
                </TabsTrigger>
              </TabsList>

              <ScrollArea className="flex-1">
                <TabsContent value="details" className="px-6 py-4 m-0 space-y-4">
                  {ticket.description && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Description</p>
                      <p className="text-sm whitespace-pre-wrap">{ticket.description}</p>
                    </div>
                  )}
                  <Separator />
                  <DetailRow label="Account" value={ticket.account_id ? accountMap.get(ticket.account_id)?.name ?? '—' : '—'} />
                  <DetailRow label="Contact">
                    {ticket.contact_id ? (() => {
                      const acct = ticket.account_id ? accountMap.get(ticket.account_id) : null;
                      const contact = acct?.contacts.find((c) => c.id === ticket.contact_id);
                      return contact ? <span className="text-sm">{contact.first_name} {contact.last_name}</span> : <span className="text-sm text-muted-foreground">—</span>;
                    })() : <span className="text-sm text-muted-foreground">—</span>}
                  </DetailRow>
                  <DetailRow label="Created by">{renderUser(ticket.created_by)}</DetailRow>
                  <DetailRow label="Assigned to">{renderUser(ticket.assigned_to)}</DetailRow>
                  <DetailRow label="Technical owner">{renderUser(ticket.technical_owner_id)}</DetailRow>
                  {ticket.support_duration_estimate_hours !== null && (
                    <DetailRow label="Estimated effort" value={`${ticket.support_duration_estimate_hours}h`} />
                  )}
                  {ticket.support_duration_actual_hours !== null && (
                    <DetailRow label="Actual effort" value={`${ticket.support_duration_actual_hours}h`} />
                  )}
                  {ticket.resolution_summary && (
                    <>
                      <Separator />
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Resolution</p>
                        <p className="text-sm whitespace-pre-wrap">{ticket.resolution_summary}</p>
                      </div>
                    </>
                  )}
                  {ticket.closed_at && (
                    <DetailRow label="Closed at" value={format(new Date(ticket.closed_at), 'MMM d, yyyy · HH:mm')} />
                  )}
                </TabsContent>

                <TabsContent value="comments" className="px-6 py-4 m-0 flex flex-col">
                  <div className="flex-1">
                    {(comments?.length ?? 0) === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">No comments yet.</p>
                    ) : (
                      comments?.map((c) => <TicketCommentItem key={c.id} comment={c} ticketId={ticket.id} />)
                    )}
                  </div>
                  <div className="mt-4 pt-4 border-t border-border space-y-2">
                    <Textarea
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder="Add a comment..."
                      rows={3}
                    />
                    <div className="flex justify-end">
                      <Button size="sm" onClick={handleAddComment} disabled={!newComment.trim() || addComment.isPending}>
                        {addComment.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1" />}
                        Comment
                      </Button>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="activity" className="px-6 py-4 m-0">
                  {(activity?.length ?? 0) === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">No activity yet.</p>
                  ) : (
                    <ol className="space-y-3 border-l-2 border-border ml-2">
                      {activity?.map((a) => (
                        <li key={a.id} className="ml-4 relative">
                          <span className="absolute -left-[22px] top-1 h-3 w-3 rounded-full bg-primary border-2 border-background" />
                          <div className="text-sm">
                            <span className="font-medium">{a.actor_name}</span>
                            <span className="text-muted-foreground"> · {a.title}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">{format(new Date(a.created_at), 'MMM d, yyyy · HH:mm')}</p>
                        </li>
                      ))}
                    </ol>
                  )}
                </TabsContent>

                <TabsContent value="attachments" className="px-6 py-4 m-0">
                  <DocumentsTab entityType="ticket" entityId={ticket.id} />
                </TabsContent>

                <TabsContent value="tasks" className="px-6 py-4 m-0 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">Tasks linked to this ticket</p>
                    <Button size="sm" onClick={handleCreateTask} disabled={creatingTask}>
                      {creatingTask ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
                      Create task from ticket
                    </Button>
                  </div>
                  {(linkedTasks?.length ?? 0) === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">No linked tasks yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {linkedTasks?.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => { onOpenChange(false); navigate('/tasks'); }}
                          className="w-full text-left p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium truncate">{t.title}</span>
                            <Badge variant="outline" className="text-xs capitalize shrink-0">{t.status.replace('_', ' ')}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {format(new Date(t.created_at), 'MMM d, yyyy')}
                            {t.assigned_to && ` · assigned to ${dirMap.get(t.assigned_to)?.displayName ?? t.assigned_to}`}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </ScrollArea>
            </Tabs>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function DetailRow({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      {children ?? <span className="text-sm">{value || '—'}</span>}
    </div>
  );
}
