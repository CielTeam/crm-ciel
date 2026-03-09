import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Leave } from '@/hooks/useLeaves';
import { useAuth } from '@/contexts/AuthContext';
import { useCancelLeave, useReviewLeave } from '@/hooks/useLeaves';
import { LEAD_ROLES, EXECUTIVE_ROLES } from '@/types/roles';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface Props {
  leave: Leave;
  showReviewActions?: boolean;
  userName?: string;
}

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'secondary',
  approved: 'default',
  rejected: 'destructive',
  cancelled: 'outline',
};

const typeLabels: Record<string, string> = {
  annual: 'Annual',
  sick: 'Sick',
  personal: 'Personal',
  unpaid: 'Unpaid',
};

export function LeaveCard({ leave, showReviewActions, userName }: Props) {
  const { user, roles } = useAuth();
  const cancelLeave = useCancelLeave();
  const reviewLeave = useReviewLeave();

  const isOwn = leave.user_id === user?.id;
  const canReview = showReviewActions && leave.status === 'pending' && !isOwn &&
    roles.some(r => [...LEAD_ROLES, ...EXECUTIVE_ROLES, 'hr'].includes(r));

  const handleCancel = async () => {
    try {
      await cancelLeave.mutateAsync(leave.id);
      toast.success('Leave cancelled');
    } catch (err: any) {
      toast.error(err.message || 'Failed to cancel');
    }
  };

  const handleReview = async (decision: 'approved' | 'rejected') => {
    try {
      await reviewLeave.mutateAsync({ leave_id: leave.id, decision });
      toast.success(`Leave ${decision}`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to review');
    }
  };

  return (
    <Card className="border">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            {userName && <p className="text-sm font-semibold text-foreground">{userName}</p>}
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant={statusVariant[leave.status] || 'secondary'}>
                {leave.status.charAt(0).toUpperCase() + leave.status.slice(1)}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {typeLabels[leave.leave_type] || leave.leave_type}
              </span>
            </div>
            <p className="text-sm text-foreground">
              {format(new Date(leave.start_date), 'MMM d, yyyy')} — {format(new Date(leave.end_date), 'MMM d, yyyy')}
            </p>
            {leave.reason && <p className="text-xs text-muted-foreground">{leave.reason}</p>}
            {leave.reviewer_note && (
              <p className="text-xs text-muted-foreground italic">Review note: {leave.reviewer_note}</p>
            )}
          </div>
          <div className="flex gap-2 shrink-0">
            {isOwn && leave.status === 'pending' && (
              <Button size="sm" variant="outline" onClick={handleCancel} disabled={cancelLeave.isPending}>
                Cancel
              </Button>
            )}
            {canReview && (
              <>
                <Button size="sm" variant="outline" onClick={() => handleReview('rejected')} disabled={reviewLeave.isPending}>
                  Reject
                </Button>
                <Button size="sm" onClick={() => handleReview('approved')} disabled={reviewLeave.isPending}>
                  Approve
                </Button>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
