import { Button } from '@/components/ui/button';
import { Edit3, Save, X, Layers } from 'lucide-react';

interface BulkControlsProps {
  bulkEditMode: boolean;
  hasTeams: boolean;
  onEditAll: () => void;
  onUpdateAll: () => void;
  onCancelAll: () => void;
}

export function BulkControls({
  bulkEditMode,
  hasTeams,
  onEditAll,
  onUpdateAll,
  onCancelAll,
}: BulkControlsProps) {
  if (!hasTeams) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {!bulkEditMode ? (
        <Button
          variant="secondary"
          onClick={onEditAll}
          size="lg"
          className="font-semibold bg-secondary hover:bg-secondary/80 text-secondary-foreground shadow-sm hover:shadow-md transition-all hover:scale-105 active:scale-95"
        >
          <Layers className="mr-2 h-5 w-5" />
          Edit All Teams
        </Button>
      ) : (
        <div className="flex flex-wrap gap-2 p-3 bg-accent/30 rounded-2xl border-2 border-accent animate-bounce-in">
          <div className="flex items-center gap-2 px-3 py-1 text-sm font-medium text-accent-foreground">
            <Edit3 className="h-4 w-4" />
            Editing all teams
          </div>
          <div className="flex gap-2">
            <Button
              onClick={onUpdateAll}
              size="lg"
              className="font-semibold bg-success-500 hover:bg-success-600 text-white shadow-sm hover:shadow-md transition-all hover:scale-105 active:scale-95"
            >
              <Save className="mr-2 h-5 w-5" />
              Save Changes
            </Button>
            <Button
              variant="outline"
              onClick={onCancelAll}
              size="lg"
              className="font-semibold border-2 hover:bg-muted transition-all"
            >
              <X className="mr-2 h-5 w-5" />
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
