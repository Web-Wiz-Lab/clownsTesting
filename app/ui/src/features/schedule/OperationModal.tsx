import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { CheckCircle2, XCircle } from 'lucide-react';
import { BulkUpdateProgress } from './BulkUpdateProgress';

interface OperationModalProps {
  open: boolean;
  message: string;
  type: 'loading' | 'success' | 'error';
  onClose?: () => void;
  /** Bulk update mode — replaces static spinner with BulkUpdateProgress */
  bulk?: {
    teamNames: string[];
    failedTeams: string[];
    apiDone: boolean;
    onDismiss: () => void;
  };
}

export function OperationModal({ open, message, type, onClose, bulk }: OperationModalProps) {
  if (bulk) {
    return (
      <Dialog open={open} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md rounded-2xl [&>button]:hidden">
          <DialogTitle className="sr-only">
            Updating {bulk.teamNames.length} Teams
          </DialogTitle>
          <DialogDescription className="sr-only">
            Bulk update progress. Status messages are shown below.
          </DialogDescription>
          <BulkUpdateProgress
            teamNames={bulk.teamNames}
            failedTeams={bulk.failedTeams}
            apiDone={bulk.apiDone}
            onDismiss={bulk.onDismiss}
          />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose?.(); }}>
      <DialogContent className="sm:max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-center">{message}</DialogTitle>
        </DialogHeader>
        <div className="flex justify-center py-6">
          {type === 'loading' && <Spinner size="lg" />}
          {type === 'success' && <CheckCircle2 className="h-16 w-16 text-success-600" />}
          {type === 'error' && <XCircle className="h-16 w-16 text-destructive" />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
