import { useState } from 'react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Wand2, Loader2 } from 'lucide-react';
import { useRecomputeAllLeadScores } from '@/hooks/useAccountsContacts';

interface Props {
  leadCount: number;
}

export function RecomputeScoresButton({ leadCount }: Props) {
  const [open, setOpen] = useState(false);
  const recompute = useRecomputeAllLeadScores();

  const handleConfirm = async () => {
    try {
      await recompute.mutateAsync();
      setOpen(false);
    } catch {
      /* error toast handled in hook */
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Wand2 className="h-3.5 w-3.5" />
          Recompute scores
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Recompute all lead scores?</AlertDialogTitle>
          <AlertDialogDescription>
            This will re-evaluate the score and score band for all {leadCount} visible lead(s) using the current scoring rules. Existing scores will be overwritten.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={recompute.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} disabled={recompute.isPending}>
            {recompute.isPending ? (
              <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Recomputing…</>
            ) : (
              'Recompute now'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
