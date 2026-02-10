import { useState } from 'react';
import { ChevronDown, UserX, AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { UnmatchedRow } from './UnmatchedRow';
import { cn } from '@/lib/utils';
import type { UnmatchedShift, EditValues } from '@/types/schedule';

interface UnmatchedBannerProps {
  unmatchedShifts: UnmatchedShift[];
  editingIndex: number | null;
  onEditShift: (index: number) => void;
  onCancelEdit: (index: number) => void;
  onUpdateShift: (index: number, values: EditValues) => void;
}

export function UnmatchedBanner({
  unmatchedShifts,
  editingIndex,
  onEditShift,
  onCancelEdit,
  onUpdateShift,
}: UnmatchedBannerProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (unmatchedShifts.length === 0) {
    return null;
  }

  const shiftWord = unmatchedShifts.length === 1 ? 'person' : 'people';
  const verbWord = unmatchedShifts.length === 1 ? 'needs' : 'need';

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="mb-6">
      <Alert variant="warning" className="rounded-2xl border-2 shadow-md animate-bounce-in">
        <CollapsibleTrigger className="flex items-center justify-between w-full text-left cursor-pointer group">
          <AlertDescription className="flex items-center gap-3 flex-1">
            <div className="flex-shrink-0 h-10 w-10 rounded-full bg-warning-100 flex items-center justify-center group-hover:bg-warning-200 transition-colors">
              <UserX className="h-5 w-5 text-warning-700" />
            </div>
            <div>
              <div className="font-semibold text-base flex items-center gap-2">
                {unmatchedShifts.length} {shiftWord} {verbWord} a team assignment
              </div>
              <div className="text-sm text-muted-foreground mt-0.5">
                These shifts are scheduled but aren't linked to any team yet.
              </div>
            </div>
          </AlertDescription>
          <div className="flex items-center gap-2 ml-4">
            <span className="text-sm font-medium text-warning-700 hidden sm:inline">
              {isOpen ? 'Hide' : 'Review'}
            </span>
            <ChevronDown
              className={cn(
                'h-5 w-5 text-warning-700 transition-transform duration-300',
                isOpen && 'transform rotate-180'
              )}
            />
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent className="mt-6 animate-bounce-in">
          <div className="flex items-start gap-2 mb-4 p-3 bg-warning-50 rounded-xl border border-warning-200">
            <AlertTriangle className="h-5 w-5 text-warning-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-warning-800">
              <strong className="font-semibold">What this means:</strong> These shifts exist in Sling but are not linked to any team assignment in Caspio.
            </div>
          </div>

          <div className="rounded-xl border-2 bg-white overflow-hidden shadow-sm">
            <Table>
              <TableHeader className="bg-muted/60">
                <TableRow>
                  <TableHead className="font-semibold text-xs text-muted-foreground">
                    Person
                  </TableHead>
                  <TableHead className="font-semibold text-xs text-muted-foreground">
                    Start Time
                  </TableHead>
                  <TableHead className="font-semibold text-xs text-muted-foreground">
                    End Time
                  </TableHead>
                  <TableHead className="font-semibold text-xs text-muted-foreground">
                    Status
                  </TableHead>
                  <TableHead className="font-semibold text-xs text-muted-foreground">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {unmatchedShifts.map((shift, index) => (
                  <UnmatchedRow
                    key={shift.id}
                    shift={shift}
                    editing={editingIndex === index}
                    onEdit={() => onEditShift(index)}
                    onCancel={() => onCancelEdit(index)}
                    onUpdate={(values) => onUpdateShift(index, values)}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        </CollapsibleContent>
      </Alert>
    </Collapsible>
  );
}
