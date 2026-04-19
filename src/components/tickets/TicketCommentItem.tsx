import { format } from 'date-fns';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Trash2, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useRedactComment, type TicketComment } from '@/hooks/useTickets';
import { useAuth } from '@/contexts/AuthContext';
import { ADMIN_ROLES } from '@/types/roles';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

interface Props { comment: TicketComment; ticketId: string; }

export function TicketCommentItem({ comment, ticketId }: Props) {
  const { user, roles } = useAuth();
  const redact = useRedactComment();
  const [reason, setReason] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const isAuthor = user?.id === comment.author_id;
  const isAdmin = roles.some((r) => ADMIN_ROLES.includes(r));
  const canRedact = !comment.is_redacted && (isAuthor || isAdmin);

  const handleRedact = () => {
    redact.mutate(
      { comment_id: comment.id, ticket_id: ticketId, reason: reason.trim() || undefined },
      {
        onSuccess: () => { toast.success('Comment removed'); setConfirmOpen(false); setReason(''); },
        onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to remove comment'),
      }
    );
  };

  const initials = (comment.author_name || '??').split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase();

  if (comment.is_redacted) {
    return (
      <div className="flex gap-3 py-3 border-b border-border last:border-0">
        <Avatar className="h-8 w-8 shrink-0 opacity-50">
          <AvatarFallback className="text-xs">{initials}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-sm font-medium text-muted-foreground line-through">{comment.author_name}</span>
            <span className="text-xs text-muted-foreground">{format(new Date(comment.created_at), 'MMM d, yyyy · HH:mm')}</span>
          </div>
          <p className="text-sm text-muted-foreground italic mt-1">
            [Comment removed{comment.redactor_name ? ` by ${comment.redactor_name}` : ''}{comment.redacted_at ? ` on ${format(new Date(comment.redacted_at), 'MMM d, yyyy')}` : ''}]
          </p>
          {comment.redaction_reason && (
            <p className="text-xs text-muted-foreground mt-1">Reason: {comment.redaction_reason}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3 py-3 border-b border-border last:border-0">
      <Avatar className="h-8 w-8 shrink-0">
        {comment.author_avatar && <AvatarImage src={comment.author_avatar} alt={comment.author_name} />}
        <AvatarFallback className="text-xs">{initials}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-sm font-medium text-foreground">{comment.author_name}</span>
            <span className="text-xs text-muted-foreground">{format(new Date(comment.created_at), 'MMM d, yyyy · HH:mm')}</span>
          </div>
          {canRedact && (
            <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remove this comment?</AlertDialogTitle>
                  <AlertDialogDescription>
                    The comment will be replaced with a placeholder visible to everyone. The original is kept for audit purposes.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Reason (optional)"
                  rows={3}
                />
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleRedact} disabled={redact.isPending}>
                    {redact.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Remove
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
        <p className="text-sm text-foreground whitespace-pre-wrap mt-1">{comment.content}</p>
      </div>
    </div>
  );
}
