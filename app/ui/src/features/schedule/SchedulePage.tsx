import { useEffect, useMemo, useState } from 'react';
import { useSchedule } from '@/hooks/use-schedule';
import { SearchBar } from './SearchBar';
import { TeamsTable } from './TeamsTable';
import { UnmatchedBanner } from './UnmatchedBanner';
import { BulkControls } from './BulkControls';
import { OperationModal } from './OperationModal';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getTimeFromDateTime } from '@/lib/time';
import type { EditValues } from '@/types/schedule';
import { Calendar, Users, AlertCircle, Sparkles, Coffee } from 'lucide-react';

export function SchedulePage() {
  const [state, actions] = useSchedule();
  const [bulkEditedValues, setBulkEditedValues] = useState<Record<string, EditValues>>({});

  // Auto-load from URL parameter on mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const dateParam = urlParams.get('date');

    if (!dateParam) {
      return;
    }

    try {
      const parts = dateParam.split('/');
      if (parts.length !== 3) {
        return;
      }

      const month = parts[0].padStart(2, '0');
      const day = parts[1].padStart(2, '0');
      const year = parts[2];
      const isoDate = `${year}-${month}-${day}`;

      const parsedDate = new Date(isoDate);
      if (!isNaN(parsedDate.getTime())) {
        actions.setDate(parsedDate);
        setTimeout(() => {
          actions.searchSchedule(parsedDate);
        }, 100);
      }
    } catch {
      // Fail silently - page still works for manual search
    }
  }, []);

  const handleSearch = (dateToSearch?: Date) => {
    const searchDate = dateToSearch || state.date;
    if (searchDate) {
      actions.searchSchedule(searchDate);
    }
  };

  const handleEnterBulkEdit = () => {
    // Initialize bulk edited values with current values
    const initialValues: Record<string, EditValues> = {};
    Object.keys(state.teams).forEach((teamName) => {
      const team = state.teams[teamName];
      initialValues[teamName] = {
        start: getTimeFromDateTime(team.mainShift.dtstart),
        end: getTimeFromDateTime(team.mainShift.dtend),
        status: team.mainShift.status,
      };
    });
    setBulkEditedValues(initialValues);
    actions.enterBulkEditMode();
  };

  const handleCancelBulkEdit = () => {
    setBulkEditedValues({});
    actions.cancelBulkEdit();
  };

  const handleUpdateAllTeams = async () => {
    const changedTeams: Array<{ teamName: string; values: EditValues }> = [];

    Object.keys(state.teams).forEach((teamName) => {
      const team = state.teams[teamName];
      const edited = bulkEditedValues[teamName];

      if (!edited) return;

      const originalStart = getTimeFromDateTime(team.mainShift.dtstart);
      const originalEnd = getTimeFromDateTime(team.mainShift.dtend);
      const originalStatus = team.mainShift.status;

      const hasChanges =
        edited.start !== originalStart ||
        edited.end !== originalEnd ||
        edited.status !== originalStatus;

      if (hasChanges) {
        changedTeams.push({
          teamName,
          values: edited,
        });
      }
    });

    if (changedTeams.length === 0) {
      alert('No changes to save');
      handleCancelBulkEdit();
      return;
    }

    await actions.updateAllTeams(changedTeams);
    setBulkEditedValues({});
  };

  const hasTeams = Object.keys(state.teams).length > 0;
  const hasResults = hasTeams || state.unmatchedShifts.length > 0;
  const teamCount = Object.keys(state.teams).length;
  const unmatchedCount = state.unmatchedShifts.length;

  const formattedDate = useMemo(() => {
    if (!state.date) return 'No date selected';
    return state.date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  }, [state.date]);

  return (
    <div className="min-h-screen pb-16">
      {/* Warm header section */}
      <div className="relative overflow-hidden bg-gradient-to-br from-primary/5 via-accent/5 to-secondary/5 border-b border-border/50">
        <div className="container mx-auto px-4 py-12 max-w-6xl relative z-10">
          {/* Friendly header */}
          <div className="text-center mb-10 animate-bounce-in">
            <div className="inline-flex items-center gap-2 mb-3 text-primary">
              <Coffee className="h-5 w-5" />
              <span className="text-sm font-medium">Sling Schedule Manager</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-display font-semibold text-foreground mb-3 tracking-tight">
              Your Team Schedule
            </h1>
            <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto">
              Find shifts for any day, update team assignments, and keep everyone on the same page.
            </p>
          </div>

          {/* Search bar - prominent and friendly */}
          <div className="max-w-2xl mx-auto animate-bounce-in" style={{ animationDelay: '100ms' }}>
            <SearchBar
              date={state.date}
              onDateChange={actions.setDate}
              onSearch={handleSearch}
              loading={state.loading}
            />
          </div>

          {/* Quick stats when results exist */}
          {hasResults && (
            <div className="mt-10 grid grid-cols-1 sm:grid-cols-[1.6fr_1fr_1fr] gap-4 max-w-4xl mx-auto animate-bounce-in" style={{ animationDelay: '200ms' }}>
              <div className="bg-white/80 backdrop-blur rounded-2xl p-5 border border-border/50 shadow-sm text-center hover:shadow-md transition-shadow">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <Calendar className="h-5 w-5 text-primary" />
                  <span className="text-sm font-medium text-muted-foreground">Viewing</span>
                </div>
                <div className="text-lg font-semibold text-foreground whitespace-nowrap">{formattedDate}</div>
              </div>

              <div className="bg-white/80 backdrop-blur rounded-2xl p-5 border border-border/50 shadow-sm text-center hover:shadow-md transition-shadow">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <Users className="h-5 w-5 text-success-500" />
                  <span className="text-sm font-medium text-muted-foreground">Teams</span>
                </div>
                <div className="text-3xl font-bold text-foreground font-display">{teamCount}</div>
              </div>

              <div className="bg-white/80 backdrop-blur rounded-2xl p-5 border border-border/50 shadow-sm text-center hover:shadow-md transition-shadow">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <AlertCircle className="h-5 w-5 text-warning-500" />
                  <span className="text-sm font-medium text-muted-foreground">Need Review</span>
                </div>
                <div className="text-3xl font-bold text-foreground font-display">{unmatchedCount}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="container mx-auto px-4 py-10 max-w-6xl">
        {state.error && (
          <Alert variant="destructive" className="mb-6 rounded-2xl shadow-sm animate-bounce-in">
            <AlertDescription className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{state.error}</span>
            </AlertDescription>
          </Alert>
        )}

        {state.success && (
          <Alert variant="success" className="mb-6 rounded-2xl shadow-sm animate-bounce-in">
            <AlertDescription className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 flex-shrink-0" />
              <span>{state.success}</span>
            </AlertDescription>
          </Alert>
        )}

        <UnmatchedBanner
          unmatchedShifts={state.unmatchedShifts}
          editingIndex={state.unmatchedEditing}
          onEditShift={actions.editUnmatched}
          onCancelEdit={actions.cancelUnmatched}
          onUpdateShift={actions.updateUnmatched}
        />

        {/* Friendly empty state */}
        {!state.loading && !hasResults && state.date && (
          <div className="rounded-3xl bg-gradient-to-br from-muted/40 to-accent/20 px-8 py-16 text-center animate-bounce-in">
            <div className="max-w-md mx-auto">
              <div className="mb-4 text-6xl">📅</div>
              <h3 className="text-2xl font-display font-semibold text-foreground mb-3">
                No shifts found
              </h3>
              <p className="text-muted-foreground">
                There aren't any scheduled shifts for this day. Try picking a different date or check
                back later!
              </p>
            </div>
          </div>
        )}

        {/* Teams section */}
        {hasTeams && (
          <section className="space-y-6 animate-bounce-in" style={{ animationDelay: '300ms' }}>
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-2xl font-display font-semibold text-foreground flex items-center gap-2">
                  <Users className="h-6 w-6 text-primary" />
                  Team Shifts
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Update times, change status, or edit multiple teams at once.
                </p>
              </div>
              <BulkControls
                bulkEditMode={state.bulkEditMode}
                hasTeams={hasTeams}
                onEditAll={handleEnterBulkEdit}
                onUpdateAll={handleUpdateAllTeams}
                onCancelAll={handleCancelBulkEdit}
              />
            </div>

            <TeamsTable
              teams={state.teams}
              editingTeam={state.editingTeam}
              bulkEditMode={state.bulkEditMode}
              onEditTeam={actions.editTeam}
              onCancelTeamEdit={actions.cancelTeamEdit}
              onUpdateTeam={actions.updateTeam}
            />
          </section>
        )}
      </div>

      {state.modal && (
        <OperationModal
          open={true}
          message={state.modal.message}
          type={state.modal.type}
        />
      )}
    </div>
  );
}
