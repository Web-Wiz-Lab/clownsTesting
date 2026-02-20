import { useState, useEffect, useRef, useCallback } from 'react';
import { CheckCircle2, Loader2, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StatusMessage {
  text: string;
  /** Duration bucket: short (350-800ms), medium (600-1200ms), long (800-1800ms) */
  bucket: 'short' | 'medium' | 'long';
  /** If true, this message counts toward the team counter */
  isTeamMessage?: boolean;
  /** Processing phase for visual grouping */
  phase: 'init' | 'teams' | 'verify' | 'finalize';
}

export interface BulkUpdateProgressProps {
  teamNames: string[];
  /** Teams that failed (simulates partial failure outcome) */
  failedTeams?: string[];
  /** Signal from parent that the real API call has completed.
   *  undefined = preview mode (animation runs on its own timer)
   *  false     = API still working
   *  true      = API responded */
  apiDone?: boolean;
  onComplete?: () => void;
  /** Called when user clicks the dismiss button after completion */
  onDismiss?: () => void;
}

// ---------------------------------------------------------------------------
// Timing helpers
// ---------------------------------------------------------------------------

type Bucket = 'short' | 'medium' | 'long';

const BUCKET_RANGES: Record<Bucket, [number, number]> = {
  short: [350, 800],
  medium: [600, 1200],
  long: [800, 1800],
};

function randomInRange(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getDuration(bucket: Bucket, prevBucket: Bucket | null, speedUp?: boolean): number {
  if (speedUp) return randomInRange(100, 150);

  const [min, max] = BUCKET_RANGES[bucket];
  let duration = randomInRange(min, max);

  // Ensure consecutive messages don't feel the same speed
  if (prevBucket === bucket) {
    // Nudge toward the opposite end of the range
    const mid = (min + max) / 2;
    if (duration > mid) {
      duration = randomInRange(min, Math.floor(mid));
    } else {
      duration = randomInRange(Math.ceil(mid), max);
    }
  }

  return duration;
}

// ---------------------------------------------------------------------------
// Message sequence builder
// ---------------------------------------------------------------------------

const INTERLEAVE_MESSAGES = [
  'Applying time changes',
  'Validating shift rules',
  'Writing shift data',
  'Checking schedule constraints',
];

const RECOVERY_MESSAGES: Omit<StatusMessage, 'phase'>[] = [
  { text: 'Analyzing response', bucket: 'long' },
  { text: 'Retrying update', bucket: 'long' },
  { text: 'Reviewing calendar data', bucket: 'long' },
  { text: 'Switching update method', bucket: 'long' },
];

const LOOPING_MESSAGES: StatusMessage[] = [
  { text: 'Confirming changes', bucket: 'medium', phase: 'verify' },
  { text: 'Verifying schedule integrity', bucket: 'medium', phase: 'verify' },
  { text: 'Cross-referencing calendar', bucket: 'short', phase: 'verify' },
  { text: 'Syncing changes', bucket: 'short', phase: 'verify' },
];

function buildMessageSequence(teamNames: string[]): StatusMessage[] {
  const messages: StatusMessage[] = [];

  // Phase 1 - Initialization
  messages.push({ text: 'Connecting to scheduling engine', bucket: 'short', phase: 'init' });
  messages.push({ text: 'Authenticating session', bucket: 'short', phase: 'init' });

  // Phase 2 - Per-team processing
  // Pick ~30% of teams to get recovery messages
  const recoveryIndices = new Set<number>();
  for (let i = 0; i < teamNames.length; i++) {
    if (Math.random() < 0.3) recoveryIndices.add(i);
  }

  for (let i = 0; i < teamNames.length; i++) {
    const teamName = teamNames[i];

    // Always show team update message
    messages.push({ text: `Updating ${teamName}`, bucket: 'medium', isTeamMessage: true, phase: 'teams' });

    // Randomly interleave one sub-task message
    const interleave = INTERLEAVE_MESSAGES[Math.floor(Math.random() * INTERLEAVE_MESSAGES.length)];
    messages.push({ text: interleave, bucket: 'short', phase: 'teams' });

    // Recovery simulation for ~30% of teams
    if (recoveryIndices.has(i)) {
      const count = randomInRange(2, 3);
      const shuffled = [...RECOVERY_MESSAGES].sort(() => Math.random() - 0.5);
      for (let r = 0; r < count; r++) {
        messages.push({ ...shuffled[r], phase: 'teams' });
      }
    }
  }

  // Phase 3 - Verification
  messages.push({ text: 'Confirming changes', bucket: 'medium', phase: 'verify' });
  messages.push({ text: 'Verifying schedule integrity', bucket: 'medium', phase: 'verify' });
  messages.push({ text: 'Cross-referencing calendar', bucket: 'short', phase: 'verify' });

  // Phase 4 - Finalization
  messages.push({ text: 'Finalizing schedule', bucket: 'medium', phase: 'finalize' });
  messages.push({ text: 'Syncing changes', bucket: 'short', phase: 'finalize' });

  return messages;
}

// ---------------------------------------------------------------------------
// Phase label helper
// ---------------------------------------------------------------------------

const PHASE_LABELS: Record<string, string> = {
  init: 'Initializing',
  teams: 'Processing teams',
  verify: 'Verifying',
  finalize: 'Finalizing',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const MAX_VISIBLE_LOG = 4;

export function BulkUpdateProgress({ teamNames, failedTeams = [], apiDone, onComplete, onDismiss }: BulkUpdateProgressProps) {
  const hasFailures = failedTeams.length > 0;
  const succeededCount = teamNames.length - failedTeams.length;
  const [messages] = useState(() => buildMessageSequence(teamNames));
  const [currentIndex, setCurrentIndex] = useState(0);
  const [completedMessages, setCompletedMessages] = useState<string[]>([]);
  const [teamsProcessed, setTeamsProcessed] = useState(0);
  const [done, setDone] = useState(false);

  const prevBucketRef = useRef<Bucket | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const indexRef = useRef(0);
  const speedUpRef = useRef(false);
  const loopingRef = useRef(false);
  const loopIndexRef = useRef(0);
  // Track the current message object for looping (not in the scripted array)
  const [loopingMessage, setLoopingMessage] = useState<StatusMessage | null>(null);

  const advance = useCallback(() => {
    const prev = indexRef.current;

    // If we're in looping mode, archive the looping message and cycle
    if (loopingRef.current) {
      const loopMsg = LOOPING_MESSAGES[loopIndexRef.current % LOOPING_MESSAGES.length];
      setCompletedMessages((log) => [...log, loopMsg.text]);

      // If speed-up was triggered, exit looping and finish
      if (speedUpRef.current) {
        loopingRef.current = false;
        setLoopingMessage(null);
        setDone(true);
        return;
      }

      // Cycle to next looping message
      loopIndexRef.current += 1;
      const nextLoop = LOOPING_MESSAGES[loopIndexRef.current % LOOPING_MESSAGES.length];
      setLoopingMessage(nextLoop);
      // Force re-render by updating index (use a negative sentinel to distinguish)
      setCurrentIndex((c) => c + 0.001);
      return;
    }

    // Archive current scripted message as completed
    const currentMsg = messages[prev];
    if (currentMsg) {
      setCompletedMessages((log) => [...log, currentMsg.text]);
      if (currentMsg.isTeamMessage) {
        setTeamsProcessed((t) => t + 1);
      }
    }

    const next = prev + 1;

    if (next >= messages.length) {
      // End of scripted messages
      if (apiDone === undefined) {
        // Preview mode: just finish
        setDone(true);
        return;
      }
      if (apiDone === false && !speedUpRef.current) {
        // API still working — enter looping mode
        loopingRef.current = true;
        loopIndexRef.current = 0;
        setLoopingMessage(LOOPING_MESSAGES[0]);
        setCurrentIndex((c) => c + 0.001);
        return;
      }
      // apiDone === true or speedUp: finish
      setDone(true);
      return;
    }

    indexRef.current = next;
    setCurrentIndex(next);
  }, [messages, apiDone]);

  // Schedule the next tick
  useEffect(() => {
    if (done) {
      onComplete?.();
      return;
    }

    const msg = loopingRef.current
      ? LOOPING_MESSAGES[loopIndexRef.current % LOOPING_MESSAGES.length]
      : messages[Math.floor(currentIndex)];
    if (!msg) return;

    const duration = getDuration(msg.bucket, prevBucketRef.current, speedUpRef.current);
    prevBucketRef.current = msg.bucket;

    timeoutRef.current = setTimeout(advance, duration);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [currentIndex, done, messages, advance, onComplete]);

  // Watch for apiDone transition to true → activate speed-up
  useEffect(() => {
    if (apiDone !== true) return;
    speedUpRef.current = true;

    // If currently looping, kick an immediate advance to exit the loop
    if (loopingRef.current) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      // Small delay so the speed-up flag is picked up
      timeoutRef.current = setTimeout(advance, randomInRange(100, 150));
    }
  }, [apiDone, advance]);

  const currentMessage = loopingMessage ?? messages[Math.floor(currentIndex)];

  // Weighted progress: team messages count for more than sub-tasks
  const teamWeight = 3;
  const otherWeight = 1;
  const totalWeight = messages.reduce(
    (sum, m) => sum + (m.isTeamMessage ? teamWeight : otherWeight),
    0,
  );
  const scriptedIndex = Math.floor(currentIndex);
  const completedWeight = messages
    .slice(0, scriptedIndex)
    .reduce((sum, m) => sum + (m.isTeamMessage ? teamWeight : otherWeight), 0);
  // Cap at 95% while looping so it never hits 100 until truly done
  const rawProgress = Math.round((completedWeight / totalWeight) * 100);
  const progress = done ? 100 : loopingRef.current ? Math.min(rawProgress, 95) : rawProgress;

  // Show last N completed messages
  const visibleLog = completedMessages.slice(-MAX_VISIBLE_LOG);

  // Phase label for current step
  const phaseLabel = currentMessage ? PHASE_LABELS[currentMessage.phase] : '';

  return (
    <div className="flex flex-col items-center gap-5 py-4 px-2">
      {/* Hero icon -- spinner, success checkmark, or warning */}
      <div
        className={cn(
          'flex items-center justify-center rounded-full transition-all duration-500',
          done && hasFailures
            ? 'h-14 w-14 bg-warning-50 animate-bounce-in'
            : done
              ? 'h-14 w-14 bg-success-50 animate-bounce-in'
              : 'h-12 w-12 bg-muted',
        )}
      >
        {done && hasFailures ? (
          <AlertTriangle className="h-7 w-7 text-warning-600" />
        ) : done ? (
          <CheckCircle2 className="h-7 w-7 text-success-600" />
        ) : (
          <Loader2 className="h-6 w-6 text-primary animate-spin" />
        )}
      </div>

      {/* Title */}
      <div className="text-center">
        <h3 className="text-lg font-display font-semibold text-foreground">
          {done && hasFailures
            ? `${succeededCount} of ${teamNames.length} Teams Updated`
            : done
              ? 'All Teams Updated'
              : `Updating ${teamNames.length} Teams`}
        </h3>
        {!done && phaseLabel && (
          <p className="text-xs text-muted-foreground mt-1">
            {phaseLabel}
          </p>
        )}
        {done && hasFailures && (
          <p className="text-sm text-warning-700 mt-1.5">
            {failedTeams.length === 1
              ? `${failedTeams[0]} could not be updated`
              : `${failedTeams.length} teams could not be updated`}
          </p>
        )}
      </div>

      {/* Team counter -- the most meaningful progress indicator */}
      {!done && (
        <p className="text-sm font-medium text-foreground tabular-nums">
          {teamsProcessed} of {teamNames.length} teams processed
        </p>
      )}

      {/* Current status line */}
      <div
        className="flex items-center gap-2.5 min-h-[28px]"
        aria-live="polite"
        aria-atomic="true"
      >
        {!done && currentMessage && (
          <>
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
            </span>
            <span
              key={currentIndex}
              className="text-sm text-muted-foreground animate-in fade-in slide-in-from-bottom-1 duration-200"
            >
              {currentMessage.text}
            </span>
          </>
        )}
        {done && !hasFailures && (
          <span className="text-sm font-medium text-success-600 animate-in fade-in duration-300">
            All {teamNames.length} teams updated successfully
          </span>
        )}
        {done && hasFailures && (
          <span className="text-sm font-medium text-warning-700 animate-in fade-in duration-300">
            Review failed teams and retry
          </span>
        )}
      </div>

      {/* Progress bar */}
      <div className="w-full max-w-sm flex flex-col gap-2">
        <div
          className="h-2 w-full rounded-full bg-muted overflow-hidden"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Update progress: ${progress}%`}
        >
          <div
            className={cn(
              'h-full rounded-full transition-[width] duration-500 ease-out',
              done && hasFailures
                ? 'bg-warning-500'
                : done
                  ? 'bg-success-500'
                  : 'bg-primary',
            )}
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Completed log -- contained in a subtle card */}
        {visibleLog.length > 0 && (
          <div className="rounded-xl bg-muted/40 border border-border/30 px-3 py-2.5 mt-1">
            <div className="flex flex-col gap-1">
              {visibleLog.map((text, i) => {
                const isNewest = i === visibleLog.length - 1;
                return (
                  <div
                    key={`${completedMessages.length - visibleLog.length + i}-${text}`}
                    className={cn(
                      'flex items-center gap-2 text-xs transition-opacity duration-300',
                      isNewest
                        ? 'text-muted-foreground animate-in fade-in slide-in-from-bottom-1 duration-200'
                        : 'text-muted-foreground/60',
                    )}
                  >
                    <CheckCircle2 className="h-3 w-3 shrink-0 text-success-500/70" />
                    <span className="truncate">{text}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Dismiss button -- shown after simulation finishes */}
      {done && (
        <Button
          variant={hasFailures ? 'outline' : 'default'}
          onClick={onDismiss}
          className="w-full max-w-sm rounded-xl animate-in fade-in duration-300 mt-1"
        >
          {hasFailures ? 'Close' : 'Done'}
        </Button>
      )}
    </div>
  );
}
