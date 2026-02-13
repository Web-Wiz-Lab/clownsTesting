import * as React from 'react';
import { useState, useCallback } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { useActivity } from '@/hooks/use-activity';
import {
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Inbox,
} from 'lucide-react';
import type { ActivityEntry, ActivityGroup } from '@/types/activity';

// ---------------------------------------------------------------------------
// Timestamp formatter -- Eastern Time, friendly format
// ---------------------------------------------------------------------------
const timestampFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

function formatTimestamp(iso: string): string {
  try {
    const date = new Date(iso);
    if (isNaN(date.getTime())) return iso || 'Unknown time';
    return timestampFormatter.format(date);
  } catch {
    return iso || 'Unknown time';
  }
}

// ---------------------------------------------------------------------------
// Outcome helpers
// ---------------------------------------------------------------------------
type Outcome = ActivityEntry['outcome'];

const OUTCOME_CONFIG: Record<
  Outcome,
  {
    label: string;
    variant: 'success' | 'destructive' | 'warning';
    dotClass: string;
    Icon: typeof CheckCircle;
  }
> = {
  success: {
    label: 'Success',
    variant: 'success',
    dotClass: 'bg-success-400',
    Icon: CheckCircle,
  },
  failure: {
    label: 'Failed',
    variant: 'destructive',
    dotClass: 'bg-destructive',
    Icon: XCircle,
  },
  partial: {
    label: 'Partial',
    variant: 'warning',
    dotClass: 'bg-warning-500',
    Icon: AlertTriangle,
  },
};

function OutcomeBadge({ outcome }: { outcome: Outcome }) {
  const config = OUTCOME_CONFIG[outcome];
  return (
    <Badge variant={config.variant} className="flex items-center gap-1.5">
      <span className={cn('h-2 w-2 rounded-full', config.dotClass)} />
      {config.label}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Group status badge (for bulk entry sub-rows)
// ---------------------------------------------------------------------------
function GroupStatusDot({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const isSuccess = normalized === 'success';
  const isFailed = normalized === 'failed' || normalized === 'failure';

  return (
    <span
      className={cn(
        'inline-block h-2 w-2 rounded-full',
        isSuccess && 'bg-success-400',
        isFailed && 'bg-destructive',
        !isSuccess && !isFailed && 'bg-warning-500',
      )}
    />
  );
}

// ---------------------------------------------------------------------------
// Single entry card
// ---------------------------------------------------------------------------
function SingleEntryCard({ entry }: { entry: ActivityEntry }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground">
          {formatTimestamp(entry.timestamp)}
        </span>
        <OutcomeBadge outcome={entry.outcome} />
      </div>
      <p className="text-sm text-foreground leading-relaxed">{entry.summary}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bulk entry card (with collapsible group details)
// ---------------------------------------------------------------------------
function BulkEntryCard({ entry }: { entry: ActivityEntry }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground">
          {formatTimestamp(entry.timestamp)}
        </span>
        <OutcomeBadge outcome={entry.outcome} />
      </div>
      <p className="text-sm text-foreground leading-relaxed">{entry.summary}</p>

      {entry.groups.length > 0 && (
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className={cn(
                'flex items-center gap-1.5 text-xs font-medium text-muted-foreground',
                'hover:text-foreground transition-colors rounded-lg px-2 py-1 -ml-2',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              )}
            >
              {open ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
              {entry.groups.length} team {entry.groups.length === 1 ? 'result' : 'results'}
            </button>
          </CollapsibleTrigger>

          <CollapsibleContent>
            <ul className="mt-2 space-y-1.5 pl-2 border-l-2 border-border">
              {entry.groups.map((group: ActivityGroup) => (
                <li
                  key={group.groupId}
                  className="flex items-center gap-2 text-xs text-muted-foreground py-1 pl-3"
                >
                  <GroupStatusDot status={group.status} />
                  <span className="font-medium text-foreground">
                    {group.groupId}
                  </span>
                  <span
                    className={cn(
                      group.status.toLowerCase() === 'success' && 'text-success-600',
                      (group.status.toLowerCase() === 'failed' ||
                        group.status.toLowerCase() === 'failure') &&
                        'text-destructive',
                      group.status.toLowerCase() !== 'success' &&
                        group.status.toLowerCase() !== 'failed' &&
                        group.status.toLowerCase() !== 'failure' &&
                        'text-warning-600',
                    )}
                  >
                    {group.status}
                  </span>
                </li>
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Entry wrapper
// ---------------------------------------------------------------------------
export function ActivityEntryCard({
  entry,
  index,
}: {
  entry: ActivityEntry;
  index: number;
}) {
  return (
    <div
      className="animate-bounce-in rounded-2xl bg-white/80 border border-border/50 p-4 shadow-sm hover:shadow-md transition-shadow"
      style={{ animationDelay: `${Math.min(index * 60, 300)}ms` }}
    >
      {entry.type === 'bulk' ? (
        <BulkEntryCard entry={entry} />
      ) : (
        <SingleEntryCard entry={entry} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------
export function ActivityEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center animate-bounce-in">
      <div className="rounded-full bg-muted p-4 mb-5">
        <Inbox className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-display font-semibold text-foreground mb-2">
        No activity yet
      </h3>
      <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
        Once you start making schedule changes, your recent activity will show up here.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------
export function ActivityErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center animate-bounce-in">
      <div className="rounded-full bg-destructive/10 p-4 mb-5">
        <XCircle className="h-8 w-8 text-destructive" />
      </div>
      <h3 className="text-lg font-display font-semibold text-foreground mb-2">
        Something went wrong
      </h3>
      <p className="text-sm text-muted-foreground max-w-xs mb-5 leading-relaxed">
        {message}
      </p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RefreshCw className="h-4 w-4" />
        Try again
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------
export function ActivityLoadingState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4">
      <Spinner size="lg" className="text-primary" />
      <p className="text-sm text-muted-foreground">Loading activity...</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Default trigger button
// ---------------------------------------------------------------------------
export const ActivityTriggerButton = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<typeof Button>
>((props, ref) => (
  <Button ref={ref} variant="ghost" size="sm" className="gap-1.5" {...props}>
    <Clock className="h-4 w-4" />
    Activity
  </Button>
));
ActivityTriggerButton.displayName = 'ActivityTriggerButton';

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export interface ActivityDrawerProps {
  trigger?: React.ReactNode;
}

export function ActivityDrawer({ trigger }: ActivityDrawerProps) {
  const { entries, loading, loadingMore, error, nextCursor, fetchActivity, fetchMore } =
    useActivity();

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        fetchActivity();
      }
    },
    [fetchActivity],
  );

  const showEntries = !loading && !error && entries.length > 0;
  const showEmpty = !loading && !error && entries.length === 0;

  return (
    <Sheet onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        {trigger ?? <ActivityTriggerButton />}
      </SheetTrigger>

      <SheetContent side="right" className="flex flex-col gap-0 p-0">
        {/* Header */}
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border/50">
          <SheetTitle className="font-display text-xl">
            Recent Activity
          </SheetTitle>
          <SheetDescription>
            A quick look at your latest schedule changes.
          </SheetDescription>
        </SheetHeader>

        {/* Scrollable body */}
        <ScrollArea className="flex-1">
          <div className="px-6 py-4">
            {loading && <ActivityLoadingState />}

            {error && (
              <ActivityErrorState message={error} onRetry={fetchActivity} />
            )}

            {showEmpty && <ActivityEmptyState />}

            {showEntries && (
              <div className="space-y-3">
                {entries.map((entry, index) => (
                  <ActivityEntryCard
                    key={entry.id}
                    entry={entry}
                    index={index}
                  />
                ))}

                {/* Load more */}
                {nextCursor !== null && (
                  <div className="flex justify-center pt-2 pb-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={fetchMore}
                      disabled={loadingMore}
                      className="gap-2"
                    >
                      {loadingMore ? (
                        <>
                          <Spinner size="sm" />
                          Loading...
                        </>
                      ) : (
                        'Load more'
                      )}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
