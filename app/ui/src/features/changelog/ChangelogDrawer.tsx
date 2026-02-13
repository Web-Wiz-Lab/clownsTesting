import * as React from 'react';
import { useCallback, useRef } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { useChangelog } from '@/hooks/use-changelog';
import {
  Megaphone,
  Radio,
  Calendar,
  RefreshCw,
  Inbox,
  XCircle,
} from 'lucide-react';
import type { ChangelogDay } from '@/types/activity';

// ---------------------------------------------------------------------------
// Date formatter -- friendly long format
// ---------------------------------------------------------------------------
const dateFormatter = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

function formatDate(dateString: string): string {
  // Parse with explicit time to avoid timezone shifting
  const date = new Date(dateString + 'T00:00:00');
  return dateFormatter.format(date);
}

// ---------------------------------------------------------------------------
// Investigating banner
// ---------------------------------------------------------------------------
export function InvestigatingBanner() {
  return (
    <div
      className={cn(
        'animate-bounce-in rounded-2xl border border-warning-300 p-4',
        'bg-warning-50 shadow-sm',
      )}
    >
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-warning-200 p-2 shrink-0">
          <Radio className="h-4 w-4 text-warning-700" />
        </div>
        <div className="space-y-1 min-w-0">
          <p className="text-sm font-semibold text-warning-800">
            We are looking into something
          </p>
          <p className="text-sm text-warning-700 leading-relaxed">
            Investigating an isolated incident that prevented a team from being
            updated. System remains operational.
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single day card
// ---------------------------------------------------------------------------
export function ChangelogDayCard({ day, index }: { day: ChangelogDay; index: number }) {
  return (
    <div
      className="animate-bounce-in rounded-2xl bg-white/80 border border-border/50 p-5 shadow-sm hover:shadow-md transition-shadow"
      style={{ animationDelay: `${Math.min(index * 80, 400)}ms` }}
    >
      {/* Date heading */}
      <div className="flex items-center gap-2 mb-3">
        <Calendar className="h-4 w-4 text-primary shrink-0" />
        <h3 className="text-sm font-display font-semibold text-foreground">
          {formatDate(day.date)}
        </h3>
      </div>

      {/* Entries */}
      <ul className="space-y-2 pl-1">
        {day.entries.map((entry, entryIndex) => (
          <li
            key={`${day.date}-${entryIndex}`}
            className="flex items-start gap-2.5 text-sm text-foreground leading-relaxed"
          >
            <span className="mt-2 h-1.5 w-1.5 rounded-full bg-primary/60 shrink-0" />
            <span>{entry}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center animate-bounce-in">
      <div className="rounded-full bg-muted p-4 mb-5">
        <Inbox className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-display font-semibold text-foreground mb-2">
        No updates yet
      </h3>
      <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
        When there are system updates or changes, they will appear here.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------
function ErrorState({
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
function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4">
      <Spinner size="lg" className="text-primary" />
      <p className="text-sm text-muted-foreground">Loading updates...</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Default trigger button
// ---------------------------------------------------------------------------
export const ChangelogTriggerButton = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<typeof Button> & { investigating?: boolean }
>(({ investigating, ...rest }, ref) => (
  <Button ref={ref} variant="ghost" size="sm" className="relative gap-1.5" {...rest}>
    <Megaphone className="h-4 w-4" />
    {"What's New"}
    {investigating && (
      <span
        className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5"
        aria-label="New notification"
      >
        <span className="absolute inline-flex h-full w-full animate-pulse rounded-full bg-destructive opacity-75" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-destructive" />
      </span>
    )}
  </Button>
));
ChangelogTriggerButton.displayName = 'ChangelogTriggerButton';

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export interface ChangelogDrawerProps {
  investigating?: boolean;
  onDismissInvestigating?: () => void;
  trigger?: React.ReactNode;
}

export function ChangelogDrawer({
  investigating: investigatingProp,
  onDismissInvestigating,
  trigger,
}: ChangelogDrawerProps) {
  const {
    days,
    loading,
    error,
    fetchChangelog,
    dismissInvestigating,
  } = useChangelog();

  // Track whether the investigating banner should show for this open session.
  // It shows when the drawer opens with investigating=true, then gets cleared.
  const showBannerRef = useRef(false);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        // Capture whether to show the investigating banner before dismissing
        showBannerRef.current = investigatingProp === true;

        fetchChangelog();

        // Dismiss the investigating flag
        if (investigatingProp) {
          dismissInvestigating();
          onDismissInvestigating?.();
        }
      } else {
        // Reset when closing
        showBannerRef.current = false;
      }
    },
    [fetchChangelog, investigatingProp, dismissInvestigating, onDismissInvestigating],
  );

  const showDays = !loading && !error && days.length > 0;
  const showEmpty = !loading && !error && days.length === 0 && !showBannerRef.current;

  return (
    <Sheet onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        {trigger ?? (
          <ChangelogTriggerButton investigating={investigatingProp} />
        )}
      </SheetTrigger>

      <SheetContent side="right" className="flex flex-col gap-0 p-0">
        {/* Header */}
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border/50">
          <SheetTitle className="font-display text-xl">
            System Change Log
          </SheetTitle>
          <SheetDescription>
            The latest updates and improvements to the system.
          </SheetDescription>
        </SheetHeader>

        {/* Scrollable body */}
        <ScrollArea className="flex-1">
          <div className="px-6 py-4 space-y-3">
            {/* Loading */}
            {loading && <LoadingState />}

            {/* Error */}
            {error && (
              <ErrorState message={error} onRetry={fetchChangelog} />
            )}

            {/* Investigating banner -- visible for the session where it was active */}
            {showBannerRef.current && !loading && !error && (
              <InvestigatingBanner />
            )}

            {/* Empty state */}
            {showEmpty && <EmptyState />}

            {/* Changelog day cards */}
            {showDays &&
              days.map((day, index) => (
                <ChangelogDayCard key={day.date} day={day} index={index} />
              ))}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
