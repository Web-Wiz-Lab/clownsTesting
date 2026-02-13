import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { CheckCircle2, XCircle } from 'lucide-react';

interface OperationModalProps {
  open: boolean;
  message: string;
  type: 'loading' | 'success' | 'error';
  onClose?: () => void;
}

export function OperationModal({ open, message, type, onClose }: OperationModalProps) {
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
