import { useState } from 'react';

// Real production components -- activity
import {
  ActivityEntryCard,
  ActivityEmptyState,
  ActivityErrorState,
  ActivityLoadingState,
} from '@/features/activity/ActivityDrawer';

// Real production components -- changelog
import {
  InvestigatingBanner,
  ChangelogDayCard,
  ChangelogTriggerButton,
} from '@/features/changelog/ChangelogDrawer';

// Real production components -- schedule
import { OperationModal } from '@/features/schedule/OperationModal';

// shadcn/ui
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

// Types
import type { ActivityEntry } from '@/types/activity';
import type { ChangelogDay } from '@/types/activity';

// Icons
import {
  AlertCircle,
  Sparkles,
  Clock,
  Megaphone,
  ChevronDown,
  ChevronRight,
  Inbox,
} from 'lucide-react';

// Shared no-op callback
const noop = () => {};

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_SINGLE_SUCCESS: ActivityEntry = {
  id: 'mock-1',
  timestamp: '2026-02-13T18:22:47.568Z',
  outcome: 'success',
  type: 'single',
  summary: 'Team 25 shifts updated for August 3, 2026',
  scheduleDate: '2026-08-03',
  requestId: '28779d6c-1c1b-4588-a9a0-4ced6237545f',
  groups: [{ groupId: 'Team 25', status: 'success' }],
};

const MOCK_SINGLE_FAILURE: ActivityEntry = {
  id: 'mock-2',
  timestamp: '2026-02-13T17:15:00.000Z',
  outcome: 'failure',
  type: 'single',
  summary: 'Team 10 shifts update failed',
  scheduleDate: null,
  requestId: 'fail-req-001',
  groups: [{ groupId: 'Team 10', status: 'failed' }],
};

const MOCK_BULK_PARTIAL: ActivityEntry = {
  id: 'mock-3',
  timestamp: '2026-02-12T21:35:46.000Z',
  outcome: 'partial',
  type: 'bulk',
  summary: 'Bulk edit 4 teams for February 14, 2026',
  scheduleDate: '2026-02-14',
  requestId: 'bd35292f-bulk-001',
  groups: [
    { groupId: 'Team 1', status: 'success' },
    { groupId: 'Team 2', status: 'success' },
    { groupId: 'Team 3', status: 'failed' },
    { groupId: 'Team 4', status: 'success' },
  ],
};

const MOCK_MULTIPLE: ActivityEntry[] = [
  MOCK_SINGLE_SUCCESS,
  MOCK_BULK_PARTIAL,
  MOCK_SINGLE_FAILURE,
  {
    ...MOCK_SINGLE_SUCCESS,
    id: 'mock-4',
    timestamp: '2026-02-12T14:00:00.000Z',
    summary: 'Team 5 shifts updated for February 14, 2026',
  },
  {
    ...MOCK_SINGLE_SUCCESS,
    id: 'mock-5',
    timestamp: '2026-02-11T10:30:00.000Z',
    summary: 'Team 8 shifts updated for February 12, 2026',
  },
  {
    ...MOCK_BULK_PARTIAL,
    id: 'mock-6',
    timestamp: '2026-02-10T09:00:00.000Z',
    summary: 'Bulk edit 3 teams for February 11, 2026',
    groups: [
      { groupId: 'Team 12', status: 'success' },
      { groupId: 'Team 13', status: 'failed' },
      { groupId: 'Team 14', status: 'success' },
    ],
  },
];

const MOCK_CHANGELOG_DAYS: ChangelogDay[] = [
  {
    date: '2026-02-13',
    entries: [
      'Improved how the system tracks and logs scheduling changes for faster issue resolution.',
      'Optimized large schedule saves to be more reliable.',
      'Added a new activity tracking system to record all scheduling changes.',
    ],
  },
  {
    date: '2026-02-12',
    entries: [
      'Scheduling saves now process faster with improved performance.',
      'Added safeguards to preserve your edits when a save partially succeeds.',
    ],
  },
];

// ---------------------------------------------------------------------------
// State keys
// ---------------------------------------------------------------------------

type ActivityState =
  | 'activity-empty'
  | 'activity-single-success'
  | 'activity-single-failure'
  | 'activity-bulk-partial'
  | 'activity-multiple'
  | 'activity-loading'
  | 'activity-error';

type ChangelogState =
  | 'changelog-normal'
  | 'changelog-investigating'
  | 'changelog-cleared'
  | 'changelog-empty';

type AlertModalState =
  | 'alert-success'
  | 'alert-error'
  | 'alert-partial-rollback'
  | 'alert-partial-no-rollback'
  | 'modal-loading'
  | 'modal-success'
  | 'modal-error';

type PreviewState = ActivityState | ChangelogState | AlertModalState;

// ---------------------------------------------------------------------------
// Control panel option definitions
// ---------------------------------------------------------------------------

interface ControlOption<T extends string> {
  key: T;
  label: string;
}

const ACTIVITY_OPTIONS: ControlOption<ActivityState>[] = [
  { key: 'activity-empty', label: 'Empty state' },
  { key: 'activity-single-success', label: 'Single success' },
  { key: 'activity-single-failure', label: 'Single failure' },
  { key: 'activity-bulk-partial', label: 'Bulk partial' },
  { key: 'activity-multiple', label: 'Multiple entries' },
  { key: 'activity-loading', label: 'Loading' },
  { key: 'activity-error', label: 'Error' },
];

const CHANGELOG_OPTIONS: ControlOption<ChangelogState>[] = [
  { key: 'changelog-normal', label: 'Normal' },
  { key: 'changelog-investigating', label: 'Investigating' },
  { key: 'changelog-cleared', label: 'Cleared' },
  { key: 'changelog-empty', label: 'Empty' },
];

const ALERT_MODAL_OPTIONS: ControlOption<AlertModalState>[] = [
  { key: 'alert-success', label: 'Success alert' },
  { key: 'alert-error', label: 'Error alert' },
  { key: 'alert-partial-rollback', label: 'Partial (rollback)' },
  { key: 'alert-partial-no-rollback', label: 'Partial (no rollback)' },
  { key: 'modal-loading', label: 'Modal: loading' },
  { key: 'modal-success', label: 'Modal: success' },
  { key: 'modal-error', label: 'Modal: error' },
];

// ---------------------------------------------------------------------------
// Collapsible section component
// ---------------------------------------------------------------------------

function ControlSection<T extends string>({
  title,
  icon,
  options,
  activeKey,
  onSelect,
  defaultOpen,
}: {
  title: string;
  icon: React.ReactNode;
  options: ControlOption<T>[];
  activeKey: PreviewState | null;
  onSelect: (key: T) => void;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen ?? true);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left font-display font-semibold text-sm text-foreground hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {open ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          {icon}
          {title}
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="flex flex-col gap-1 px-2 pb-3 pt-1">
          {options.map((option) => {
            const isActive = activeKey === option.key;
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => onSelect(option.key)}
                className={
                  isActive
                    ? 'flex items-center rounded-lg px-3 py-1.5 text-xs font-medium text-primary-foreground bg-primary shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                    : 'flex items-center rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 border border-transparent hover:border-border/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                }
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ---------------------------------------------------------------------------
// Preview renderer
// ---------------------------------------------------------------------------

function PreviewContent({ activeState, onClearState }: { activeState: PreviewState | null; onClearState: () => void }) {
  if (activeState === null) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-6">
        <div className="rounded-full bg-muted p-4 mb-5">
          <Sparkles className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-display font-semibold text-foreground mb-2">
          Select a state to preview
        </h3>
        <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">
          Use the control panel on the left to pick a component state. The real
          production component will render here with mock data.
        </p>
      </div>
    );
  }

  // -- Activity states -------------------------------------------------------

  if (activeState === 'activity-empty') {
    return <ActivityEmptyState />;
  }

  if (activeState === 'activity-single-success') {
    return (
      <div className="max-w-md mx-auto">
        <ActivityEntryCard entry={MOCK_SINGLE_SUCCESS} index={0} />
      </div>
    );
  }

  if (activeState === 'activity-single-failure') {
    return (
      <div className="max-w-md mx-auto">
        <ActivityEntryCard entry={MOCK_SINGLE_FAILURE} index={0} />
      </div>
    );
  }

  if (activeState === 'activity-bulk-partial') {
    return (
      <div className="max-w-md mx-auto">
        <ActivityEntryCard entry={MOCK_BULK_PARTIAL} index={0} />
      </div>
    );
  }

  if (activeState === 'activity-multiple') {
    return (
      <div className="max-w-md mx-auto space-y-3">
        {MOCK_MULTIPLE.map((entry, index) => (
          <ActivityEntryCard key={entry.id} entry={entry} index={index} />
        ))}
        <div className="flex justify-center pt-2 pb-4">
          <Button variant="outline" size="sm" disabled>
            Load more
          </Button>
        </div>
      </div>
    );
  }

  if (activeState === 'activity-loading') {
    return <ActivityLoadingState />;
  }

  if (activeState === 'activity-error') {
    return (
      <ActivityErrorState
        message="Could not load recent activity. Try again in a moment."
        onRetry={noop}
      />
    );
  }

  // -- Changelog states ------------------------------------------------------

  if (activeState === 'changelog-normal') {
    return (
      <div className="max-w-md mx-auto space-y-3">
        {MOCK_CHANGELOG_DAYS.map((day, index) => (
          <ChangelogDayCard key={day.date} day={day} index={index} />
        ))}
      </div>
    );
  }

  if (activeState === 'changelog-investigating') {
    return (
      <div className="max-w-md mx-auto space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-xs text-muted-foreground font-medium">
            Trigger button demo:
          </span>
          <ChangelogTriggerButton investigating={true} />
        </div>
        <InvestigatingBanner />
        {MOCK_CHANGELOG_DAYS.map((day, index) => (
          <ChangelogDayCard key={day.date} day={day} index={index} />
        ))}
      </div>
    );
  }

  if (activeState === 'changelog-cleared') {
    return (
      <div className="max-w-md mx-auto space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-xs text-muted-foreground font-medium">
            Trigger button demo:
          </span>
          <ChangelogTriggerButton investigating={false} />
        </div>
        {MOCK_CHANGELOG_DAYS.map((day, index) => (
          <ChangelogDayCard key={day.date} day={day} index={index} />
        ))}
      </div>
    );
  }

  if (activeState === 'changelog-empty') {
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

  // -- Alert states ----------------------------------------------------------

  if (activeState === 'alert-success') {
    return (
      <div className="max-w-lg mx-auto">
        <Alert variant="success">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Team updated successfully!</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (activeState === 'alert-error') {
    return (
      <div className="max-w-lg mx-auto">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Sling could not accept this update right now. Try again in a moment.
            Please contact Dev (Andrew) (requestId: 28779d6c-...).
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (activeState === 'alert-partial-rollback') {
    return (
      <div className="max-w-lg mx-auto">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Some teams were not updated. Failed teams were safely undone, so
            their Sling values were preserved. Review failed teams and retry
            (requestId: bd35292f-...).
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (activeState === 'alert-partial-no-rollback') {
    return (
      <div className="max-w-lg mx-auto">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Some teams failed and at least one could not be fully undone, so
            times on screen may not match Sling. Stop editing now. Please
            contact Dev (Andrew) (requestId: bd35292f-...).
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // -- Modal states ----------------------------------------------------------

  if (activeState === 'modal-loading') {
    return (
      <>
        <div className="flex flex-col items-center justify-center h-full text-center px-6">
          <p className="text-sm text-muted-foreground">
            The operation modal overlay is shown above.
          </p>
        </div>
        <OperationModal
          open={true}
          message="Processing Request"
          type="loading"
          onClose={onClearState}
        />
      </>
    );
  }

  if (activeState === 'modal-success') {
    return (
      <>
        <div className="flex flex-col items-center justify-center h-full text-center px-6">
          <p className="text-sm text-muted-foreground">
            The operation modal overlay is shown above.
          </p>
        </div>
        <OperationModal
          open={true}
          message="Shifts Updated Successfully"
          type="success"
          onClose={onClearState}
        />
      </>
    );
  }

  if (activeState === 'modal-error') {
    return (
      <>
        <div className="flex flex-col items-center justify-center h-full text-center px-6">
          <p className="text-sm text-muted-foreground">
            The operation modal overlay is shown above.
          </p>
        </div>
        <OperationModal
          open={true}
          message="Could not save team updates right now."
          type="error"
          onClose={onClearState}
        />
      </>
    );
  }

  // Exhaustive check -- should never reach here
  return null;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function PreviewPage() {
  const [activeState, setActiveState] = useState<PreviewState | null>(null);

  function handleSelect(key: PreviewState) {
    setActiveState((prev) => (prev === key ? null : key));
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Left column -- control panel */}
      <div className="w-[35%] min-w-[280px] max-w-[420px] shrink-0 border-r border-border/50 bg-white flex flex-col">
        {/* Panel header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border/50">
          <Badge variant="outline" className="text-xs font-mono uppercase tracking-wider">
            Dev Preview
          </Badge>
          <span className="text-xs text-muted-foreground">
            Component state inspector
          </span>
        </div>

        {/* Scrollable controls */}
        <ScrollArea className="flex-1">
          <div className="px-3 py-4 space-y-1">
            <ControlSection
              title="Recent Activity"
              icon={<Clock className="h-4 w-4 shrink-0 text-primary" />}
              options={ACTIVITY_OPTIONS}
              activeKey={activeState}
              onSelect={handleSelect}
              defaultOpen={true}
            />

            <ControlSection
              title="System Change Log"
              icon={<Megaphone className="h-4 w-4 shrink-0 text-primary" />}
              options={CHANGELOG_OPTIONS}
              activeKey={activeState}
              onSelect={handleSelect}
              defaultOpen={true}
            />

            <ControlSection
              title="Alerts & Modals"
              icon={<AlertCircle className="h-4 w-4 shrink-0 text-primary" />}
              options={ALERT_MODAL_OPTIONS}
              activeKey={activeState}
              onSelect={handleSelect}
              defaultOpen={true}
            />
          </div>
        </ScrollArea>
      </div>

      {/* Right column -- preview area */}
      <div className="flex-1 min-w-0 overflow-auto">
        <div className="p-8 min-h-full flex flex-col">
          {/* Preview header */}
          {activeState !== null && (
            <div className="mb-6 flex items-center gap-3">
              <Badge variant="secondary" className="text-xs font-mono">
                {activeState}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setActiveState(null)}
                className="text-xs text-muted-foreground"
              >
                Clear
              </Button>
            </div>
          )}

          {/* Preview content */}
          <div className="flex-1 flex items-start justify-center pt-4">
            <div className="w-full">
              <PreviewContent activeState={activeState} onClearState={() => setActiveState(null)} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
